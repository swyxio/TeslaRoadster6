import { DurableObject } from 'cloudflare:workers';
import { addPlayer, createWorld, interact, removePlayer, resetPlayer, step, type Input } from '../shared/game';
import { parseMessage, roomCapacity, roomSlug } from './protocol';

type Env = { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<GameRoom>; MAX_PLAYERS?: string };
type Session = { id: string; lastInput: number; lastMessage: number; windowStart: number; count: number; lastAction: number };
const reply = (body: string, status: number) => new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health') return Response.json({ ok: true, version: 1, capacity: roomCapacity(env.MAX_PLAYERS) });
    const slug = roomSlug(url.pathname);
    if (!slug) return reply('Unknown API route. Room names use 1–32 lowercase letters, digits, or hyphens.', 404);
    if (request.method !== 'GET') return reply('GET required', 405);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return reply('WebSocket upgrade required', 426);
    const origin = request.headers.get('Origin');
    // Non-browser clients may omit Origin. This is a public sandbox, not authentication.
    if (origin && origin !== url.origin) return reply('Cross-origin connections are not allowed', 403);
    return env.ROOMS.get(env.ROOMS.idFromName(slug)).fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Sessions and world are deliberately ephemeral. Deploy/restart/last disconnect
// resets a room. Real-time physics cannot hibernate while participants are active.
export class GameRoom extends DurableObject<Env> {
  private world = createWorld();
  private sessions = new Map<WebSocket, Session>();
  private inputs = new Map<string, Input>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  fetch(): Response {
    const capacity = roomCapacity(this.env.MAX_PLAYERS);
    if (this.sessions.size >= capacity) return reply('Room full. Choose another room.', 503);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID();
    const now = Date.now();
    server.accept();
    this.sessions.set(server, { id, lastInput: now, lastMessage: now, windowStart: now, count: 0, lastAction: 0 });
    addPlayer(this.world, id, `Driver ${this.sessions.size}`);
    server.addEventListener('message', event => this.onMessage(server, event.data));
    server.addEventListener('close', () => this.disconnect(server));
    server.addEventListener('error', () => this.disconnect(server));
    server.send(JSON.stringify({ type: 'welcome', id, version: 1, capacity }));
    server.send(JSON.stringify({ type: 'state', world: this.world }));
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    const now = Date.now();
    if (now - session.windowStart >= 1000) { session.windowStart = now; session.count = 0; }
    if (++session.count > 90) { this.disconnect(socket, 1008, 'Message rate exceeded'); return; }
    if (typeof raw !== 'string' || raw.length > 1024) { this.disconnect(socket, 1009, 'Text messages up to 1024 characters required'); return; }
    const message = parseMessage(raw);
    if (!message) { this.disconnect(socket, 1008, 'Invalid message'); return; }
    session.lastMessage = now;
    if (message.type === 'input') { this.inputs.set(session.id, message.input); session.lastInput = now; return; }
    if (now - session.lastAction < 400) return;
    session.lastAction = now;
    if (message.type === 'interact') interact(this.world, session.id);
    if (message.type === 'reset') resetPlayer(this.world, session.id);
    if (message.type === 'name') {
      const player = this.world.players.find(p => p.id === session.id);
      if (player) player.name = message.name;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const [socket, session] of this.sessions) {
      if (now - session.lastInput > 300) this.inputs.delete(session.id);
      if (now - session.lastMessage > 30_000) this.disconnect(socket, 1001, 'Connection inactive');
    }
    if (!this.sessions.size) return;
    step(this.world, this.inputs, 0.05);
    if (++this.tickCount % 2) return;
    const snapshot = JSON.stringify({ type: 'state', world: this.world });
    for (const socket of this.sessions.keys()) {
      try { socket.send(snapshot); } catch { this.disconnect(socket); }
    }
  }

  private disconnect(socket: WebSocket, code = 1000, reason = 'Session ended'): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket); this.inputs.delete(session.id); removePlayer(this.world, session.id);
    try { socket.close(code, reason); } catch { /* Already disconnected. */ }
    if (!this.sessions.size) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null; this.tickCount = 0; this.world = createWorld();
    }
  }
}
