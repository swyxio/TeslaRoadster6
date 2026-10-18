import type { ChatMessage } from './chat-panel';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';

export type ChatStatus = 'connecting' | 'online' | 'offline';
export type AwardProgress = { room: AchievementId[]; solo: AchievementId[] };
export type AwardTicket = { requestId:number; ticket:string; expiresAt:number };
type ChatCallbacks = {
  onStatus: (status: ChatStatus, detail?: string) => void;
  onReady: (playerId: string, name: string, messages: ChatMessage[]) => void;
  onRenamed: (playerId: string, name: string, requestId: number) => void;
  onMessage: (message: ChatMessage) => void;
  onRecovery: (code: string) => void;
  onError: (message: string, code?: string, requestId?: number) => void;
  onAwards?: (awards:AwardProgress|null) => void;
  onAwardTicket?: (ticket:AwardTicket) => void;
};

function parseAwards(value:unknown):AwardProgress|null {
  if(!value||typeof value!=='object')return null;
  const {room,solo}=value as Record<string,unknown>;
  const valid=(ids:unknown):ids is AchievementId[]=>Array.isArray(ids)&&ids.every(id=>typeof id==='string'&&Object.hasOwn(ACHIEVEMENTS,id));
  return valid(room)&&valid(solo)?{room:[...new Set(room)],solo:[...new Set(solo)]}:null;
}

/** Global chat is independent of the current driving room. */
export class GlobalChat {
  status: ChatStatus = 'offline';
  name = '';
  playerId = '';
  code: string | undefined;
  // Event snapshots let the game consume replies independently of chat UI.
  awards: AwardProgress|null = null;
  awardsRevision = 0;
  awardTicket: AwardTicket|null = null;
  awardFailure: { revision:number; message:string; requestId?:number }|null = null;
  readyGeneration = 0;
  identityTransition = false;
  private requestedName = 'Driver';
  private requestedCode: string | undefined;
  private socket?: WebSocket;
  private reconnectTimer = 0;
  private heartbeatTimer = 0;
  private sentAt: number[] = [];
  private retries = 0;
  private identityRetries = 0;
  private blocked = false;
  private generation = 0;

  constructor(private callbacks: ChatCallbacks) {}

  connect(name: string, code?: string, force = false) {
    const wanted = name.trim() || 'Driver';
    if (!force && (this.status === 'online' || this.status === 'connecting') &&
        code === this.requestedCode && (wanted === this.name || wanted === this.requestedName)) return;
    this.requestedName = wanted;
    // During a deliberate identity change the old ID must not receive new
    // awards while the replacement socket authenticates.
    this.identityTransition = !code || code !== this.code;
    if(this.identityTransition){this.awardTicket=null;this.awards=null;}
    this.requestedCode = code;
    this.blocked = false;
    this.retries = 0;
    this.identityRetries = 0;
    clearTimeout(this.reconnectTimer);
    this.replaceSocket();
  }

  send(text: string): boolean {
    if (this.status !== 'online') return false;
    const now = Date.now();
    this.sentAt = this.sentAt.filter(time => now - time < 10_000);
    if (this.sentAt.length >= 5) { this.callbacks.onError('Please wait before sending more messages.'); return false; }
    if (!this.sendPacket({ type: 'message', text })) return false;
    this.sentAt.push(now);
    return true;
  }
  save(): boolean { return this.sendPacket({ type: 'save' }); }
  rename(name: string, requestId: number): boolean { return this.sendPacket({ type: 'rename', name, requestId }); }
  requestAwardTicket(requestId:number):boolean { return this.sendPacket({type:'awardTicket',requestId}); }
  saveSoloAwards(achievements:AchievementId[]):boolean { return this.sendPacket({type:'soloAwards',achievements}); }
  getAwards():boolean { return this.sendPacket({type:'getAwards'}); }

  private receiveAwards(value:unknown) {
    this.awards=parseAwards(value);this.awardsRevision++;
    this.callbacks.onAwards?.(this.awards);
  }

  private sendPacket(packet: object): boolean {
    if (this.status !== 'online' || this.socket?.readyState !== WebSocket.OPEN) return false;
    try { this.socket.send(JSON.stringify(packet)); return true; } catch { return false; }
  }

  private setStatus(status: ChatStatus, detail?: string) {
    this.status = status;
    this.callbacks.onStatus(status, detail);
  }

  private replaceSocket() {
    const generation = ++this.generation;
    this.stopHeartbeat();
    const previous = this.socket;
    this.socket = undefined;
    this.setStatus('connecting');
    let started = false;
    let fallback = 0;
    const start = () => {
      if (started || generation !== this.generation) return;
      started = true;
      clearTimeout(fallback);
      this.openSocket();
    };
    if (previous && previous.readyState !== WebSocket.CLOSED) {
      // A saved identity cannot have two active sockets. Wait for the server
      // to observe the previous close before trying to recover it.
      previous.addEventListener('close', start, { once: true });
      fallback = window.setTimeout(start, 1500);
      previous.close();
    } else start();
  }

  private openSocket() {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chat`);
    } catch {
      this.setStatus('offline', 'Reconnecting soon');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify({ type: 'hello', name: this.requestedName, ...(this.requestedCode ? { code: this.requestedCode } : {}) }));
    };
    socket.onmessage = event => {
      if (this.socket !== socket || typeof event.data !== 'string') return;
      let data: Record<string, unknown>;
      try { data = JSON.parse(event.data) as Record<string, unknown>; } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'ready' && typeof data.playerId === 'string' && typeof data.name === 'string' && Array.isArray(data.messages)) {
        this.playerId = data.playerId;
        this.name = data.name;
        this.code = this.requestedCode;
        this.identityTransition = false;
        this.awardTicket = null;
        this.readyGeneration++;
        this.receiveAwards(data.awards);
        this.retries = 0;
        this.identityRetries = 0;
        this.setStatus('online');
        this.startHeartbeat(socket);
        this.callbacks.onReady(this.playerId, this.name, data.messages as ChatMessage[]);
      } else if (data.type === 'renamed' && typeof data.playerId === 'string' && data.playerId === this.playerId && typeof data.name === 'string' && Number.isSafeInteger(data.requestId) && (data.requestId as number) > 0) {
        this.name = data.name;
        this.requestedName = data.name;
        this.callbacks.onRenamed(this.playerId, this.name, data.requestId as number);
      } else if (data.type === 'message' && data.message && typeof data.message === 'object') {
        this.callbacks.onMessage(data.message as ChatMessage);
      } else if (data.type === 'recovery' && typeof data.code === 'string') {
        this.code = data.code;
        this.requestedCode = data.code;
        this.callbacks.onRecovery(data.code);
      } else if(data.type==='awards') {
        this.receiveAwards(data.awards);
      } else if(data.type==='awardTicket' && Number.isSafeInteger(data.requestId) && (data.requestId as number)>0 && typeof data.ticket==='string' && /^[0-9a-f]{64}$/.test(data.ticket) && typeof data.expiresAt==='number' && Number.isFinite(data.expiresAt)) {
        this.awardTicket={requestId:data.requestId as number,ticket:data.ticket,expiresAt:data.expiresAt};
        this.callbacks.onAwardTicket?.(this.awardTicket);
      } else if (data.type === 'error' && typeof data.message === 'string') {
        if(data.code==='awards_failed')this.awardFailure={revision:(this.awardFailure?.revision??0)+1,message:data.message,...(typeof data.requestId==='number'?{requestId:data.requestId}:{})};
        if (this.status === 'connecting' && data.code === 'identity_active' && this.requestedCode && this.identityRetries < 4) {
          // A prior connection can take longer to disappear on the server than
          // it does locally. Retry on this socket before requiring user action.
          const delay = 1000 * 2 ** this.identityRetries++;
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            if (this.socket === socket && socket.readyState === WebSocket.OPEN && this.status === 'connecting') {
              socket.send(JSON.stringify({ type: 'hello', name: this.requestedName, code: this.requestedCode }));
            }
          }, delay);
          return;
        }
        if (this.status === 'connecting') {
          // Failed recovery is never replaced with a new guest automatically.
          this.blocked = true;
          this.setStatus('offline', 'Action needed');
        }
        this.callbacks.onError(data.message, typeof data.code === 'string' ? data.code : undefined, typeof data.requestId === 'number' ? data.requestId : undefined);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.stopHeartbeat();
      if (this.blocked) return;
      this.setStatus('offline', 'Reconnecting soon');
      this.scheduleReconnect();
    };
  }

  private startHeartbeat(socket: WebSocket) {
    this.stopHeartbeat();
    if (this.socket !== socket || this.status !== 'online') return;
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket === socket) this.sendPacket({ type: 'ping' });
    }, 25_000);
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  }

  private scheduleReconnect() {
    if (this.blocked) return;
    const delay = Math.min(20_000, 1000 * 2 ** Math.min(this.retries++, 5));
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.replaceSocket(), delay);
  }
}
