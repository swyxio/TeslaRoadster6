import { DurableObject } from 'cloudflare:workers';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { chooseAvailableName, createRecoveryCode, hashRecoverySecret, normalizeChatText, parseRecoveryCode } from './global-chat-core';

/**
 * One global object, shared across rooms. WebSocket client sends:
 *   {type:'hello',name:string,code?:string}, {type:'message',text:string},
 *   {type:'rename',name:string,requestId:number}, {type:'save'}, {type:'awardTicket',requestId:number},
 *   {type:'getAwards'}, or {type:'ping'}.
 * Server sends:
 *   {type:'ready',playerId,name,messages}, {type:'message',message},
 *   {type:'renamed',playerId,name,requestId}, {type:'recovery',code}, or {type:'error',message}.
 * Recovery codes are bearer credentials: never broadcast or include in history.
 */
export type ChatMessage = { id: string; playerId: string; name: string; text: string; time: number };
export type AwardProgress = AchievementId[];
export type ChatServerMessage =
  | { type: 'ready'; playerId: string; name: string; messages: ChatMessage[]; awards: AwardProgress | null }
  | { type: 'message'; message: ChatMessage }
  | { type: 'renamed'; playerId: string; name: string; requestId: number }
  | { type: 'recovery'; code: string }
  | { type: 'awardTicket'; ticket: string; expiresAt: number; requestId: number }
  | { type: 'awards'; awards: AwardProgress }
  | { type: 'error'; message: string; code?: 'identity_active' | 'rename_failed' | 'save_failed' | 'awards_failed'; requestId?: number };

type StoredIdentity = { hash: string; name: string };
type Session = {
  playerId?: string;
  name?: string;
  ip: string;
  lastActivity: number;
  authenticating: boolean;
  ready: boolean;
  saving: boolean;
  updates: Promise<void>;
  pendingName?: string;
  issuedCode?: string;
  awardTicket?: string;
  authFailures: number;
  inboundStart: number;
  inboundCount: number;
  warnedRate: boolean;
  messageTimes: number[];
  handshakeTimer: ReturnType<typeof setTimeout> | null;
};
type Bucket = { start: number; count: number };
const HISTORY_LIMIT = 50;
const CONNECTION_LIMIT = 512;
const IP_CONNECTION_LIMIT = 24;
const IDENTITY_WINDOW = 3_600_000;
const IP_IDENTITY_LIMIT = 30;
const GLOBAL_IDENTITY_LIMIT = 240;
const STALE_AFTER = 180_000;
const REAP_INTERVAL = 10_000;
const AUTH_TIMEOUT = 30_000;
const INBOUND_WINDOW = 10_000;
const INBOUND_LIMIT = 30;
const CHAT_WINDOW = 10_000;
const CHAT_LIMIT = 5;
const IP_WINDOW = 60_000;
const IP_LIMIT = 60;
const IP_BUCKET_LIMIT = 1000;
const AWARD_TICKET_LIFETIME = 30_000;
const AWARD_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];
const validAwards = (value: unknown): value is AchievementId[] => Array.isArray(value) &&
  value.length <= AWARD_IDS.length && value.every(id => typeof id === 'string' && Object.hasOwn(ACHIEVEMENTS, id));

// Messages and session state stay in memory only. Sockets use the standard
// non-hibernating API, so an instance must remain awake while players are connected.
// A restart forgets chat history; explicitly saved identity digests survive.
export class GlobalChat extends DurableObject {
  private sessions = new Map<WebSocket, Session>();
  private awardTickets = new Map<string, { socket: WebSocket; session: Session; expiresAt: number }>();
  private awardUpdates = new Map<string, Promise<void>>();
  private drainingIds = new Set<string>();
  private history: ChatMessage[] = [];
  private ipBuckets = new Map<string, Bucket>();
  private identityBuckets = new Map<string, Bucket>();
  private globalIdentityBucket: Bucket = { start: Date.now(), count: 0 };
  private reapTimer: ReturnType<typeof setInterval> | null = null;

  fetch(request: Request): Response {
    if (this.sessions.size >= CONNECTION_LIMIT) return new Response('Global chat is full. Try again shortly.', { status: 503 });
    // Cloudflare provides this header for public requests; absent in some local
    // and internal calls. These short-lived buckets are only a modest abuse brake.
    const incomingIp = request.headers.get('CF-Connecting-IP');
    const ip = incomingIp && incomingIp.length <= 80 ? incomingIp : 'unknown';
    if (!this.hasRoomForIp(ip) || !this.allowConnection(ip)) return new Response('Too many chat connections. Try again shortly.', { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const session: Session = {
      ip, lastActivity: Date.now(), authenticating: false, ready: false, saving: false, updates: Promise.resolve(), authFailures: 0,
      inboundStart: Date.now(), inboundCount: 0, warnedRate: false, messageTimes: [], handshakeTimer: null,
    };
    this.sessions.set(server, session);
    if (!this.reapTimer) this.reapTimer = setInterval(() => this.reap(), REAP_INTERVAL);
    session.handshakeTimer = setTimeout(() => this.disconnect(server, 1008, 'Chat name not provided'), AUTH_TIMEOUT);
    server.addEventListener('message', event => this.onMessage(server, event.data));
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  private hasRoomForIp(ip: string): boolean {
    let connections = 0;
    for (const session of this.sessions.values()) {
      if (session.ip === ip && ++connections >= IP_CONNECTION_LIMIT) return false;
    }
    return true;
  }

  // Best-effort memory-only abuse brakes, shared by all rooms and reset on
  // restart. Existing saved drivers and idempotent re-requests do not count.
  private allowIdentityCreation(ip: string, now = Date.now()): boolean {
    if (now - this.globalIdentityBucket.start >= IDENTITY_WINDOW) this.globalIdentityBucket = { start: now, count: 0 };
    let bucket = this.identityBuckets.get(ip);
    if (!bucket || now - bucket.start >= IDENTITY_WINDOW) {
      if (!bucket && this.identityBuckets.size >= IP_BUCKET_LIMIT) this.identityBuckets.delete(this.identityBuckets.keys().next().value!);
      bucket = { start: now, count: 0 };
      this.identityBuckets.set(ip, bucket);
    }
    if (bucket.count >= IP_IDENTITY_LIMIT || this.globalIdentityBucket.count >= GLOBAL_IDENTITY_LIMIT) return false;
    bucket.count++; this.globalIdentityBucket.count++;
    return true;
  }

  private reap(now = Date.now()): void {
    for (const [socket, session] of this.sessions) {
      if (now - session.lastActivity >= STALE_AFTER) this.disconnect(socket, 1001, 'Chat connection inactive');
    }
  }

  private allowConnection(ip: string): boolean {
    const now = Date.now();
    let bucket = this.ipBuckets.get(ip);
    if (!bucket || now - bucket.start >= IP_WINDOW) {
      // Cap memory even if a flood uses many different addresses.
      if (!bucket && this.ipBuckets.size >= IP_BUCKET_LIMIT) this.ipBuckets.delete(this.ipBuckets.keys().next().value!);
      bucket = { start: now, count: 0 };
      this.ipBuckets.set(ip, bucket);
    }
    return ++bucket.count <= IP_LIMIT;
  }

  private onMessage(socket: WebSocket, raw: unknown): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    const now = Date.now();
    if (now - session.inboundStart >= INBOUND_WINDOW) {
      session.inboundStart = now; session.inboundCount = 0; session.warnedRate = false;
    }
    if (++session.inboundCount > INBOUND_LIMIT) {
      if (!session.warnedRate) this.error(socket, 'Too many requests. Please wait a moment.');
      session.warnedRate = true;
      return;
    }
    if (typeof raw !== 'string' || raw.length > 2048) { this.error(socket, 'Use a short text message.'); return; }
    let message: unknown;
    try { message = JSON.parse(raw); } catch { this.error(socket, 'Invalid chat request.'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) { this.error(socket, 'Invalid chat request.'); return; }
    const data = message as Record<string, unknown>;
    session.lastActivity = now;
    if (data.type === 'hello') {
      if (session.playerId) { this.error(socket, 'You are already connected to chat.'); return; }
      if (session.authenticating) { this.error(socket, 'Connecting; please wait.'); return; }
      if (typeof data.name !== 'string' || data.name.length > 512 || (data.code !== undefined && (typeof data.code !== 'string' || data.code.length > 160))) {
        this.error(socket, 'Enter a name and a valid recovery code.'); return;
      }
      session.authenticating = true;
      void this.hello(socket, session, data.name, data.code as string | undefined);
      return;
    }
    if (!session.playerId || !session.name || !session.ready) { this.error(socket, 'Choose a name before using chat.'); return; }
    if (data.type === 'ping') return;
    if (data.type === 'awardTicket') {
      if (!Number.isSafeInteger(data.requestId) || (data.requestId as number) < 1) { this.error(socket, 'Invalid award ticket request.'); return; }
      const requestId = data.requestId as number;
      session.updates = session.updates.then(() => this.issueAwardTicket(socket, session, requestId));
      return;
    }
    if (data.type === 'getAwards') {
      session.updates = session.updates.then(() => this.sendAwards(socket, session));
      return;
    }
    if (data.type === 'save') {
      if (session.issuedCode) {
        this.send(socket, { type: 'recovery', code: session.issuedCode });
        session.updates = session.updates.then(() => this.sendAwards(socket, session));
        return;
      }
      if (session.saving) { this.send(socket, { type: 'error', code: 'save_failed', message: 'Generating your code; please wait.' }); return; }
      if (!this.allowIdentityCreation(session.ip)) { this.send(socket, { type: 'error', code: 'save_failed', message: 'Saved drivers are temporarily limited. Try again later.' }); return; }
      session.saving = true;
      session.updates = session.updates.then(() => this.save(socket, session));
      return;
    }
    if (data.type === 'rename') {
      if (!Number.isSafeInteger(data.requestId) || (data.requestId as number) < 1) { this.error(socket, 'Invalid name change request.'); return; }
      const requestId = data.requestId as number;
      if (typeof data.name !== 'string' || data.name.length > 512) { this.send(socket, { type: 'error', code: 'rename_failed', requestId, message: 'Enter a valid driver name.' }); return; }
      const name = data.name;
      session.updates = session.updates.then(() => this.rename(socket, session, name, requestId));
      return;
    }
    if (data.type === 'message') {
      if (typeof data.text !== 'string') { this.error(socket, 'Enter a chat message.'); return; }
      const text = normalizeChatText(data.text);
      if (!text) { this.error(socket, 'Messages must contain 1–240 characters.'); return; }
      session.messageTimes = session.messageTimes.filter(time => now - time < CHAT_WINDOW);
      if (session.messageTimes.length >= CHAT_LIMIT) { this.error(socket, 'Please wait before sending more messages.'); return; }
      session.messageTimes.push(now);
      session.updates = session.updates.then(() => {
        if (!session.playerId || !session.name) return;
        const chat: ChatMessage = { id: crypto.randomUUID(), playerId: session.playerId, name: session.name, text, time: Date.now() };
        this.history.push(chat);
        if (this.history.length > HISTORY_LIMIT) this.history.shift();
        for (const [recipient, active] of this.sessions) if (active.playerId) this.send(recipient, { type: 'message', message: chat });
      });
      return;
    }
    this.error(socket, 'Unknown chat request.');
  }

  // Each profile has its own queue: room RPCs and reads cannot
  // overwrite or overtake one another. Rename writes use a different key.
  private withAwardLock<T>(playerId: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.awardUpdates.get(playerId) ?? Promise.resolve()).then(operation);
    const settled = result.then(() => {}, () => {});
    this.awardUpdates.set(playerId, settled);
    void settled.then(() => { if (this.awardUpdates.get(playerId) === settled) this.awardUpdates.delete(playerId); });
    return result;
  }

  private async readAwards(playerId: string): Promise<AwardProgress> {
    const saved = await this.ctx.storage.get<AwardProgress>(`awards:${playerId}`);
    if (saved === undefined) return [];
    if (!validAwards(saved)) throw new Error('Invalid saved award profile');
    const unlocked = new Set(saved);
    return AWARD_IDS.filter(id => unlocked.has(id));
  }

  private async sendAwards(socket: WebSocket, session: Session): Promise<void> {
    if (!session.playerId || !this.sessions.has(socket)) return;
    try {
      await this.withAwardLock(session.playerId, async () => {
        const awards = session.issuedCode ? await this.readAwards(session.playerId!) : [];
        if (this.sessions.has(socket)) this.send(socket, { type: 'awards', awards });
      });
    } catch {
      if (this.sessions.has(socket)) this.send(socket, { type: 'error', code: 'awards_failed', message: 'Could not load your awards. Please try again.' });
    }
  }

  private issueAwardTicket(socket: WebSocket, session: Session, requestId: number): void {
    if (!this.sessions.has(socket)) return;
    if (!session.playerId || !session.issuedCode) {
      this.send(socket, { type: 'error', code: 'awards_failed', requestId, message: 'Save your driver before saving awards.' });
      return;
    }
    if (session.awardTicket) this.awardTickets.delete(session.awardTicket);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const ticket = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const expiresAt = Date.now() + AWARD_TICKET_LIFETIME;
    this.awardTickets.set(ticket, { socket, session, expiresAt });
    session.awardTicket = ticket;
    this.send(socket, { type: 'awardTicket', ticket, expiresAt, requestId });
  }

  /** Internal room-to-chat RPC; the HTTP router never exposes this method. */
  consumeAwardTicket(ticket: string): string | null {
    if (typeof ticket !== 'string' || !/^[0-9a-f]{64}$/.test(ticket)) return null;
    const entry = this.awardTickets.get(ticket);
    if (!entry) return null;
    this.awardTickets.delete(ticket);
    if (entry.session.awardTicket === ticket) entry.session.awardTicket = undefined;
    if (Date.now() >= entry.expiresAt || this.sessions.get(entry.socket) !== entry.session || !entry.session.issuedCode) return null;
    return entry.session.playerId ?? null;
  }

  /** Internal room-to-chat RPC. Only the authoritative room calls this. */
  async recordRoomAwards(playerId: string, achievements: AchievementId[]): Promise<AwardProgress> {
    if (typeof playerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(playerId) || !validAwards(achievements)) {
      throw new Error('Invalid award request');
    }
    return this.withAwardLock(playerId, async () => {
      if (!await this.ctx.storage.get<StoredIdentity>(`identity:${playerId}`)) throw new Error('Saved driver unavailable');
      const before = await this.readAwards(playerId);
      const unlocked = new Set([...before, ...achievements]);
      const awards = AWARD_IDS.filter(id => unlocked.has(id));
      if (awards.length !== before.length) {
        await this.ctx.storage.put(`awards:${playerId}`, awards);
      }
      for (const [socket, session] of this.sessions) {
        if (session.ready && session.playerId === playerId) this.send(socket, { type: 'awards', awards });
      }
      return awards;
    });
  }

  private async hello(socket: WebSocket, session: Session, desiredName: string, code?: string): Promise<void> {
    try {
      let playerId: string;
      let knownCode: string | undefined;
      let name = desiredName;
      if (code !== undefined) {
        const parsed = parseRecoveryCode(code);
        if (!parsed) { this.badRecovery(socket, session); return; }
        const saved = await this.ctx.storage.get<StoredIdentity>(`identity:${parsed.playerId}`);
        const givenHash = await hashRecoverySecret(parsed.secret);
        // Always compare equal-length digests, including for an unknown ID.
        const recordedHash = typeof saved?.hash === 'string' && /^[0-9a-f]{64}$/.test(saved.hash) ? saved.hash : '0'.repeat(64);
        const valid = crypto.subtle.timingSafeEqual(new TextEncoder().encode(givenHash), new TextEncoder().encode(recordedHash));
        if (!saved || !valid || typeof saved.name !== 'string') { this.badRecovery(socket, session); return; }
        playerId = parsed.playerId;
        knownCode = `poly-${parsed.playerId}.${parsed.secret}`;
        name = saved.name;
        if (!this.sessions.has(socket)) return;
        if (this.drainingIds.has(playerId) || [...this.sessions.values()].some(active => active !== session && active.playerId === playerId)) {
          this.send(socket, { type: 'error', code: 'identity_active', message: 'That saved driver is already connected elsewhere.' }); return;
        }
      } else {
        playerId = crypto.randomUUID();
      }
      if (!this.sessions.has(socket)) return;
      const used = [...this.sessions.values()].flatMap(active => [active.name, active.pendingName].filter((value): value is string => !!value));
      session.playerId = playerId;
      session.name = chooseAvailableName(name, used);
      session.issuedCode = knownCode;
      if (session.handshakeTimer) clearTimeout(session.handshakeTimer);
      session.handshakeTimer = null;
      const ready = (awards: AwardProgress | null) => {
        if (!this.sessions.has(socket)) return;
        session.ready = true;
        this.send(socket, { type: 'ready', playerId, name: session.name!, messages: this.history, awards });
      };
      if (!knownCode) ready([]);
      else {
        try { await this.withAwardLock(playerId, async () => ready(await this.readAwards(playerId))); }
        catch {
          ready(null);
          if (this.sessions.has(socket)) this.send(socket, { type: 'error', code: 'awards_failed', message: 'Could not load your awards. Please try again.' });
        }
      }
    } catch {
      this.error(socket, 'Could not connect to chat. Please try again.');
    } finally {
      session.authenticating = false;
    }
  }

  private badRecovery(socket: WebSocket, session: Session): void {
    session.authFailures++;
    this.error(socket, 'Recovery code not recognized. Check it and try again.');
    if (session.authFailures >= 4) this.disconnect(socket, 1008, 'Too many recovery attempts');
  }

  private async rename(socket: WebSocket, session: Session, desiredName: string, requestId: number): Promise<void> {
    if (!session.playerId) return;
    const used = [...this.sessions.values()].filter(active => active !== session)
      .flatMap(active => [active.name, active.pendingName].filter((value): value is string => !!value));
    const name = chooseAvailableName(desiredName, used);
    session.pendingName = name;
    let renamed = false;
    try {
      if (session.issuedCode) {
        const key = `identity:${session.playerId}`;
        const saved = await this.ctx.storage.get<StoredIdentity>(key);
        if (!saved) throw new Error('Saved identity unavailable');
        await this.ctx.storage.put(key, { ...saved, name } satisfies StoredIdentity);
      }
      session.name = name;
      renamed = true;
      if (this.sessions.has(socket)) this.send(socket, { type: 'renamed', playerId: session.playerId, name, requestId });
    } catch {
      this.send(socket, { type: 'error', code: 'rename_failed', requestId, message: 'Could not change your name. Please try again.' });
    } finally {
      session.pendingName = undefined;
    }
    if (renamed) await this.sendAwards(socket, session);
  }

  private async save(socket: WebSocket, session: Session): Promise<void> {
    try {
      if (!session.playerId || !session.name) return;
      const code = createRecoveryCode(session.playerId);
      const { secret } = parseRecoveryCode(code)!;
      const hash = await hashRecoverySecret(secret);
      if (!this.sessions.has(socket)) return;
      // An existing recovery code is never rotated implicitly: a failed send
      // must not invalidate a credential the player previously saved.
      await this.ctx.storage.put(`identity:${session.playerId}`, { hash, name: session.name } satisfies StoredIdentity);
      if (this.sessions.has(socket)) {
        session.issuedCode = code;
        this.send(socket, { type: 'recovery', code });
      }
    } catch {
      this.send(socket, { type: 'error', code: 'save_failed', message: 'Could not save this driver. Please try again.' });
    } finally {
      session.saving = false;
    }
    if (session.issuedCode) await this.sendAwards(socket, session);
  }

  private error(socket: WebSocket, message: string): void { this.send(socket, { type: 'error', message }); }
  private send(socket: WebSocket, message: ChatServerMessage): void {
    try { socket.send(JSON.stringify(message)); } catch { this.disconnect(socket); }
  }
  private disconnect(socket: WebSocket, code = 1000, reason = 'Chat ended'): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    if (session.awardTicket) this.awardTickets.delete(session.awardTicket);
    if (session.playerId) {
      const id = session.playerId;
      this.drainingIds.add(id);
      // Finish accepted writes/messages before allowing this saved identity to
      // reconnect, so a new socket cannot race the old one's pending rename.
      void session.updates.then(() => this.drainingIds.delete(id), () => this.drainingIds.delete(id));
    }
    if (session.handshakeTimer) clearTimeout(session.handshakeTimer);
    if (!this.sessions.size && this.reapTimer) { clearInterval(this.reapTimer); this.reapTimer = null; }
    try { socket.close(code, reason); } catch { /* Already disconnected. */ }
  }
}
