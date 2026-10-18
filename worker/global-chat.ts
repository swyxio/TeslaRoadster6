import { DurableObject } from 'cloudflare:workers';
import { chooseAvailableName, createRecoveryCode, hashRecoverySecret, normalizeChatText, parseRecoveryCode } from './global-chat-core';

/**
 * One global object, shared across rooms. WebSocket client sends:
 *   {type:'hello',name:string,code?:string}, {type:'message',text:string},
 *   {type:'rename',name:string}, {type:'save'}, or {type:'ping'}.
 * Server sends:
 *   {type:'ready',playerId,name,messages}, {type:'message',message},
 *   {type:'renamed',playerId,name}, {type:'recovery',code}, or {type:'error',message}.
 * Recovery codes are bearer credentials: never broadcast or include in history.
 */
export type ChatMessage = { id: string; playerId: string; name: string; text: string; time: number };
export type ChatServerMessage =
  | { type: 'ready'; playerId: string; name: string; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'renamed'; playerId: string; name: string }
  | { type: 'recovery'; code: string }
  | { type: 'error'; message: string; code?: 'identity_active' | 'rename_failed' | 'save_failed' };

type StoredIdentity = { hash: string; name: string };
type Session = {
  playerId?: string;
  name?: string;
  ip: string;
  lastActivity: number;
  authenticating: boolean;
  saving: boolean;
  updates: Promise<void>;
  pendingName?: string;
  issuedCode?: string;
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

// Messages and session state stay in memory only. Sockets use the standard
// non-hibernating API, so an instance must remain awake while players are connected.
// A restart forgets chat history; explicitly saved identity digests survive.
export class GlobalChat extends DurableObject {
  private sessions = new Map<WebSocket, Session>();
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
      ip, lastActivity: Date.now(), authenticating: false, saving: false, updates: Promise.resolve(), authFailures: 0,
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
    if (!session.playerId || !session.name) { this.error(socket, 'Choose a name before using chat.'); return; }
    if (data.type === 'ping') return;
    if (data.type === 'save') {
      if (session.issuedCode) { this.send(socket, { type: 'recovery', code: session.issuedCode }); return; }
      if (session.saving) { this.send(socket, { type: 'error', code: 'save_failed', message: 'Generating your code; please wait.' }); return; }
      if (!this.allowIdentityCreation(session.ip)) { this.send(socket, { type: 'error', code: 'save_failed', message: 'Saved drivers are temporarily limited. Try again later.' }); return; }
      session.saving = true;
      session.updates = session.updates.then(() => this.save(socket, session));
      return;
    }
    if (data.type === 'rename') {
      if (typeof data.name !== 'string' || data.name.length > 512) { this.send(socket, { type: 'error', code: 'rename_failed', message: 'Enter a valid driver name.' }); return; }
      const name = data.name;
      session.updates = session.updates.then(() => this.rename(socket, session, name));
      return;
    }
    if (data.type === 'message') {
      if (typeof data.text !== 'string') { this.error(socket, 'Enter a chat message.'); return; }
      const text = normalizeChatText(data.text);
      if (!text) { this.error(socket, 'Messages must contain 1–240 characters.'); return; }
      session.messageTimes = session.messageTimes.filter(time => now - time < CHAT_WINDOW);
      if (session.messageTimes.length >= CHAT_LIMIT) { this.error(socket, 'Please wait before sending more messages.'); return; }
      session.messageTimes.push(now);
      const chat: ChatMessage = { id: crypto.randomUUID(), playerId: session.playerId, name: session.name, text, time: now };
      this.history.push(chat);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
      for (const [recipient, active] of this.sessions) if (active.playerId) this.send(recipient, { type: 'message', message: chat });
      return;
    }
    this.error(socket, 'Unknown chat request.');
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
        if ([...this.sessions.values()].some(active => active !== session && active.playerId === playerId)) {
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
      this.send(socket, { type: 'ready', playerId, name: session.name, messages: this.history });
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

  private async rename(socket: WebSocket, session: Session, desiredName: string): Promise<void> {
    if (!this.sessions.has(socket) || !session.playerId) return;
    const used = [...this.sessions.values()].filter(active => active !== session)
      .flatMap(active => [active.name, active.pendingName].filter((value): value is string => !!value));
    const name = chooseAvailableName(desiredName, used);
    session.pendingName = name;
    try {
      if (session.issuedCode) {
        const key = `identity:${session.playerId}`;
        const saved = await this.ctx.storage.get<StoredIdentity>(key);
        if (!saved) throw new Error('Saved identity unavailable');
        await this.ctx.storage.put(key, { ...saved, name } satisfies StoredIdentity);
      }
      session.name = name;
      if (this.sessions.has(socket)) this.send(socket, { type: 'renamed', playerId: session.playerId, name });
    } catch {
      this.send(socket, { type: 'error', code: 'rename_failed', message: 'Could not change your name. Please try again.' });
    } finally {
      session.pendingName = undefined;
    }
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
  }

  private error(socket: WebSocket, message: string): void { this.send(socket, { type: 'error', message }); }
  private send(socket: WebSocket, message: ChatServerMessage): void {
    try { socket.send(JSON.stringify(message)); } catch { this.disconnect(socket); }
  }
  private disconnect(socket: WebSocket, code = 1000, reason = 'Chat ended'): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    if (session.handshakeTimer) clearTimeout(session.handshakeTimer);
    if (!this.sessions.size && this.reapTimer) { clearInterval(this.reapTimer); this.reapTimer = null; }
    try { socket.close(code, reason); } catch { /* Already disconnected. */ }
  }
}
