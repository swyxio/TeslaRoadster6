// Generate an isolated local Wrangler entry point around the TARGET revision's
// own stage fixture and room runtime. Never deploy this test entry point.
export function continuityWorkerSource(stagePath, options = {}) {
  if (typeof stagePath !== 'string' || !stagePath.startsWith('/')) throw new Error('An absolute target stage path is required');
  const target = JSON.stringify(stagePath);
  const grounded = options.grounded === true;
  const setupProbe = grounded ? `
      const startingWorld = Reflect.get(this, 'world');
      const startingSession = [...Reflect.get(this, 'sessions').values()][0] as any;
      const startingPlayer = startingWorld.players.find((p: any) => p.id === startingSession?.id);
      const initialEntityId = startingPlayer?.entityId;
      const reasons = new Set<string>();
      let beforeCount = 0, afterCount = 0;
      const previousProbe = (globalThis as any).__teslandContinuityProbe;
      const scope = (entity: any) => {
        if (!entity || entity.id !== initialEntityId || entity.supportId !== 'ground' || entity.inDome || entity.loopAngle !== null)
          reasons.add('out-of-ground-scope');
      };
      (globalThis as any).__teslandContinuityProbe = {
        contact: (entity: any, reason: string) => { if (entity?.id === initialEntityId) reasons.add(reason); },
        scope: (entity: any) => { if (entity?.id === initialEntityId) scope(entity); },
        boundary: (world: any, phase: string) => {
          if (phase === 'before') beforeCount++; else if (phase === 'after') afterCount++;
          else reasons.add('unknown-boundary');
          const player = world.players.find((p: any) => p.id === startingSession?.id);
          if (!player || player.entityId !== initialEntityId) reasons.add('controlled-vehicle-changed');
          scope(world.entities.find((e: any) => e.id === player?.entityId));
        },
      };` : '';
  const finishProbe = grounded ? `
        if (previousProbe === undefined) delete (globalThis as any).__teslandContinuityProbe;
        else (globalThis as any).__teslandContinuityProbe = previousProbe;
        if (!beforeCount || beforeCount !== afterCount) reasons.add('missing-substep-boundary');` : '';
  const contactField = grounded ? '[...reasons].sort()' : 'null';
  const coverage = grounded ? 'grounded-path-v1' : 'unproven';
  return `// Generated local-only trace collector. Bind Wrangler to 127.0.0.1.
import base, { GameRoom as StageRoom } from ${target};
export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from ${target};

export class GameRoom extends StageRoom {
  private traceSamples: any[] = [];
  private traceDropped = 0;
  private traceFailed = 0;
  constructor(ctx: any, env: any) {
    super(ctx, env);
    // Match the prior isolated motion fixture: no initial ambient entities.
    Reflect.get(this, 'world').entities = [];
    const original = Reflect.get(this, 'tick');
    if (typeof original !== 'function') throw new Error('Missing room tick method');
    Reflect.set(this, 'tick', () => {
      const tickBefore = Reflect.get(this, 'tickCount');
      const beforeEpochMs = Date.now();
      ${setupProbe}
      try { return Reflect.apply(original, this, []); }
      finally {
        const afterEpochMs = Date.now();
        ${finishProbe}
        try {
          const tick = Reflect.get(this, 'tickCount');
          const world = Reflect.get(this, 'world');
          const sessions = Reflect.get(this, 'sessions');
          const session = [...sessions.values()][0] as any;
          const player = world.players.find((p: any) => p.id === session?.id);
          const car = world.entities.find((e: any) => e.id === player?.entityId);
          if (tick !== tickBefore && car) {
            const sample = { tick, atMs: afterEpochMs, beforeEpochMs, afterEpochMs,
              simTime: world.time, x: car.x, y: car.y, z: car.z, yaw: car.yaw,
              vx: car.vx, vy: car.vy, vz: car.vz, supportId: car.supportId,
              poseRevision: session.poseRevision, contactReasons: ${contactField} };
            if (this.traceSamples.length < 10000) this.traceSamples.push(sample);
            else this.traceDropped++;
          }
        } catch { this.traceFailed++; }
      }
    });
  }
  private assertRoom(room: string) {
    if (!this.ctx.id.equals(this.env.ROOMS.idFromName(room))) throw new Error('Room identity mismatch');
  }
  traceClock(room: string) {
    this.assertRoom(room);
    return { authorityEpochMs: Date.now(), workerPerformanceNowMs: performance.now() };
  }
  traceRead(room: string) {
    this.assertRoom(room);
    return { format: 1, complete: this.traceFailed === 0 && this.traceDropped === 0,
      dropped: this.traceDropped, failed: this.traceFailed, collisionCoverage: '${coverage}',
      clock: { basis: 'worker-Date.now', continuityVerified: false, maxTickTimingErrorMs: null },
      interpolation: { verified: false, maxPositionErrorM: null },
      limitations: ['Tick timestamps use Worker Date.now; the clock can remain frozen during CPU work.',
        '${grounded ? 'Only instrumented ordinary ground paths are covered; all non-ground paths are out of scope.' : 'No collision hooks are installed; null contactReasons means unknown, not no contact.'}'],
      ticks: this.traceSamples };
  }
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response('Local only', {status:403});
    const match = /^\\/api\\/continuity\\/(clock|read)\\/(motion-[a-z0-9-]{1,24})$/.exec(url.pathname);
    if (match) {
      if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Cross-origin denied', {status:403});
      const expected = env.PLAYTEST_TRACE_SECRET;
      const supplied = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected) || !supplied ||
          !crypto.subtle.timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(supplied)))
        return new Response('Unauthorized', {status:401});
      const room = env.ROOMS.get(env.ROOMS.idFromName(match[2]));
      return Response.json(match[1] === 'clock' ? await room.traceClock(match[2]) : await room.traceRead(match[2]));
    }
    return base.fetch(request, env, ctx);
  },
};\n`;
}
