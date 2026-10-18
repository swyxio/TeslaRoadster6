// Local Wrangler fixture only. Never deploy this worker: it intentionally maps
// all benchmark room names to one room and exposes diagnostic measurements.
import worker, { GameRoom as ProductionGameRoom, GlobalChat } from '../../worker/index';

export { GlobalChat };

type Sample = { started: number; elapsed: number; sessions: number; snapshot: boolean };

export class GameRoom extends ProductionGameRoom {
  private profileEnabled = true;
  private profileSamples: Sample[] = [];
  private profileDropped = 0;

  constructor(ctx: DurableObjectState, env: ConstructorParameters<typeof ProductionGameRoom>[1]) {
    super(ctx, env);
    // Keep the local fixture instance alive after the last benchmark client
    // closes, so the reader can retrieve its in-memory samples. This extra
    // callback is deliberately identical with sampling enabled and disabled.
    setInterval(() => {}, 10_000);
    // Production's timer looks up this method at callback time. The wrapper
    // invokes the unchanged production tick once, synchronously, per callback.
    const tick = Reflect.get(this, 'tick') as () => void;
    Reflect.set(this, 'tick', () => {
      if (!this.profileEnabled) return tick.call(this);
      const sessions = (Reflect.get(this, 'sessions') as Map<WebSocket, unknown>).size;
      const beforeTick = Reflect.get(this, 'tickCount') as number;
      const started = performance.now();
      try { tick.call(this); }
      finally {
        const elapsed = performance.now() - started;
        const afterTick = Reflect.get(this, 'tickCount') as number;
        const snapshot = afterTick === beforeTick + 1 && afterTick % 2 === 0;
        if (this.profileSamples.length < 5000) this.profileSamples.push({ started, elapsed, sessions, snapshot });
        else this.profileDropped++;
      }
    });
  }

  override fetch(request?: Request): Response {
    const url = new URL(request!.url);
    if (url.pathname === '/__room_profile') {
      const action = url.searchParams.get('action');
      if (action === 'reset') { this.profileSamples = []; this.profileDropped = 0; }
      if (action === 'enable') this.profileEnabled = true;
      if (action === 'disable') this.profileEnabled = false;
      return Response.json({ enabled: this.profileEnabled, dropped: this.profileDropped, samples: this.profileSamples });
    }
    return super.fetch();
  }
}

type Env = Parameters<typeof worker.fetch>[1];
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response('Local use only', { status: 403 });
    if (url.pathname === '/__room_profile') return env.ROOMS.get(env.ROOMS.idFromName('profile')).fetch(request);
    if (/^\/api\/room\/[a-z0-9-]+$/.test(url.pathname)) {
      url.pathname = '/api/room/profile';
      return worker.fetch(new Request(url, request), env, ctx);
    }
    return worker.fetch(request, env, ctx);
  },
};
