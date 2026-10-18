// Local-only profiling fixture. Do not deploy this Worker or its debug route.
// Exactly one production room session is permitted. We stage only the starting
// pose and speed; production owns all later inputs, ticks, physics and snapshots.
import worker, { GameRoom as ProductionGameRoom, GlobalChat } from '../../worker/index';
import { terrainHeight } from '../../shared/map';
import type { World } from '../../shared/game';

export { GlobalChat };
type Sample = { tick: number; elapsedMs: number; substeps: number; snapshot: boolean; entities: number;
  driverSpeed: number; maxOtherSpeed: number; otherAbove50: number };

export class GameRoom extends ProductionGameRoom {
  private collecting = false;
  private samples: Sample[] = [];
  private dropped = 0;
  private mark: { wall: number; sim: number; tick: number } | null = null;

  constructor(ctx: DurableObjectState, env: ConstructorParameters<typeof ProductionGameRoom>[1]) {
    super(ctx, env);
    const productionTick = Reflect.get(this, 'tick') as () => void;
    Reflect.set(this, 'tick', () => {
      if (!this.collecting) return productionTick.call(this);
      const world = Reflect.get(this, 'world') as World;
      const player = world.players[0];
      const driver = world.entities.find(entity => entity.id === player?.entityId);
      // Same speed expression used by simulationSubsteps. Metadata collection
      // occurs outside the callback stopwatch but still adds fixture overhead.
      const effectiveSpeed = (entity: World['entities'][number]) => Math.max(
        Math.abs(entity.speed) + Math.hypot(entity.pushX, entity.pushZ),
        Math.hypot(entity.vx, entity.vy, entity.vz));
      let maxOtherSpeed = 0, otherAbove50 = 0;
      for (const entity of world.entities) if (entity !== driver) {
        const speed = effectiveSpeed(entity);
        maxOtherSpeed = Math.max(maxOtherSpeed, speed);
        if (speed > 50) otherAbove50++;
      }
      const driverSpeed = driver ? effectiveSpeed(driver) : 0, entities = world.entities.length;
      const started = performance.now();
      try { productionTick.call(this); }
      finally {
        const elapsedMs = performance.now() - started;
        const tick = Reflect.get(this, 'tickCount') as number;
        const substeps = Reflect.get(this, 'lastSubsteps') as number;
        if (this.samples.length < 5000) this.samples.push({ tick, elapsedMs, substeps, snapshot: tick % 2 === 0,
          entities, driverSpeed, maxOtherSpeed, otherAbove50 });
        else this.dropped++;
      }
    });
  }

  override fetch(request?: Request): Response {
    const url = new URL(request!.url);
    const world = Reflect.get(this, 'world') as World;
    if (url.pathname === '/__fast_room_profile') {
      const action = url.searchParams.get('action');
      if (action === 'start') {
        if (world.players.length !== 1) return new Response('Exactly one driver required', { status: 409 });
        this.samples = []; this.dropped = 0;
        this.mark = { wall: performance.now(), sim: world.time, tick: Reflect.get(this, 'tickCount') as number };
        this.collecting = true;
        return Response.json({ started: true, mark: this.mark });
      }
      if (action === 'stop' && this.mark) {
        this.collecting = false;
        return Response.json({ wallMs: performance.now() - this.mark.wall, simSeconds: world.time - this.mark.sim,
          ticks: (Reflect.get(this, 'tickCount') as number) - this.mark.tick,
          players: world.players.length, dropped: this.dropped, samples: this.samples });
      }
      return new Response('Use start or stop', { status: 400 });
    }
    if (world.players.length !== 0) return new Response('This fixture permits one driver', { status: 409 });
    const empty = world.players.length === 0;
    const response = super.fetch();
    if (empty && world.players.length === 1) {
      const player = world.players[0];
      const car = world.entities.find(entity => entity.id === player.entityId);
      if (!car) throw new Error('Fixture did not find the driver car');
      Object.assign(car, { x: -300, y: terrainHeight(-300, 1500) ?? 0, z: 1500, yaw: Math.PI,
        vx: 0, vy: 0, vz: 56, speed: 56, pushX: 0, pushZ: 0, supportId: 'ground', autopilot: false });
    }
    return response;
  }
}

type Env = Parameters<typeof worker.fetch>[1];
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response('Local use only', { status: 403 });
    if (url.pathname === '/__fast_room_profile') return env.ROOMS.get(env.ROOMS.idFromName('fast-drive')).fetch(request);
    return worker.fetch(request, env, ctx);
  },
};
