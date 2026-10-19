// LOCAL PLAYTEST ONLY. Serve this entry point on loopback with isolated storage;
// never deploy it. Staging changes only the first driver in each fresh room.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from '../../worker/index';
import { MAP_BOUNDS, terrainHeight } from '../../shared/map';
import { addPlayer, createEmptyWorld, createWorld, type World } from '../../shared/game';
import { CUSTOMERS, RESTAURANTS } from '../../shared/delivery';
import { roomSlug } from '../../worker/protocol';
import { prepareSnapshots } from '../../worker/snapshot';
import type { ScheduledInput } from '../../shared/tick-input';

export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

type StageVars = { PLAYTEST_X?: unknown; PLAYTEST_Z?: unknown; PLAYTEST_YAW?: unknown; PLAYTEST_SEED?: unknown; PLAYTEST_PAUSE?: unknown; PLAYTEST_STAGE_SECRET?: unknown };
type StagePose = { x: number; y: number; z: number; yaw: number };
type StageSession = { id: string; attachPending: boolean; guest: boolean; identitySequence: number; poseRevision: number; control: ScheduledInput };

function stageOptions(env: StageVars): { seed?: number; pause: boolean } {
  let seed: number | undefined;
  if (env.PLAYTEST_SEED !== undefined) {
    if (typeof env.PLAYTEST_SEED !== 'string' || !/^(0|[1-9]\d*)$/.test(env.PLAYTEST_SEED))
      throw new Error('PLAYTEST_SEED must be a nonnegative integer');
    seed = Number(env.PLAYTEST_SEED);
    if (!Number.isSafeInteger(seed)) throw new Error('PLAYTEST_SEED must be a safe integer');
  }
  if (env.PLAYTEST_PAUSE !== undefined && env.PLAYTEST_PAUSE !== '1')
    throw new Error('PLAYTEST_PAUSE must be 1 when supplied');
  const pause = env.PLAYTEST_PAUSE === '1';
  if (pause && seed === undefined) throw new Error('PLAYTEST_PAUSE requires PLAYTEST_SEED');
  return { seed, pause };
}

// addPlayer uses the game's actual private spawn/solid/contact checks. Probe a
// clone so this check cannot add a player or change the real room.
function acceptsPose(world: World, pose: StagePose, excludeEntity?: string): boolean {
  const trial = structuredClone(world);
  if (excludeEntity) trial.entities = trial.entities.filter(entity => entity.id !== excludeEntity);
  try {
    const player = addPlayer(trial, '__playtest-stage-probe__', 'Playtest', [pose]);
    const car = trial.entities.find(entity => entity.id === player.entityId);
    return !!car && car.x === pose.x && car.z === pose.z && car.yaw === pose.yaw;
  } catch { return false; }
}

function stagePose(env: StageVars) {
  const number = (value: unknown, name: string): number => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be an explicitly supplied finite number`);
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`${name} must be an explicitly supplied finite number`);
    return result;
  };
  const x = number(env.PLAYTEST_X, 'PLAYTEST_X');
  const z = number(env.PLAYTEST_Z, 'PLAYTEST_Z');
  const yaw = number(env.PLAYTEST_YAW, 'PLAYTEST_YAW');
  if (x < MAP_BOUNDS.minX || x > MAP_BOUNDS.maxX || z < MAP_BOUNDS.minZ || z > MAP_BOUNDS.maxZ)
    throw new Error('The staged position must be inside the game map');
  const y = terrainHeight(x, z);
  if (y === null) throw new Error('The staged position must have ground support');
  const pose = { x, y, z, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) };
  if (!acceptsPose(createEmptyWorld(), pose)) throw new Error('The staged position overlaps solid map geometry');
  return pose;
}

export class GameRoom extends ProductionGameRoom {
  private stagedWorld?: World;
  private staging?: { world: World; promise: Promise<void> };
  private seededWorld?: World;
  private pausedWorld?: World;
  private startedWorld?: World;
  private pausedHeartbeat?: ReturnType<typeof setInterval>;

  private sessionsForStage(): Map<WebSocket, StageSession> {
    return Reflect.get(this, 'sessions') as Map<WebSocket, StageSession>;
  }

  private stopPausedHeartbeat(): void {
    if (this.pausedHeartbeat !== undefined) clearInterval(this.pausedHeartbeat);
    this.pausedHeartbeat = undefined;
  }

  // A repeated snapshot at the same tick keeps the browser connection alive
  // while the recorder prepares. It does not advance the room simulation.
  private publishPausedSnapshot(): void {
    const world = Reflect.get(this, 'world') as World;
    const sessions = this.sessionsForStage();
    if (world !== this.pausedWorld || !sessions.size) { this.stopPausedHeartbeat(); return; }
    const snapshot = prepareSnapshots(world, Reflect.get(this, 'tickCount') as number,
      Reflect.get(this, 'roomEpoch') as string, Reflect.get(this, 'lastSubsteps') as number);
    for (const [socket, session] of sessions) {
      try { socket.send(snapshot(session.id, session.control.snapshot(), session.poseRevision)); }
      catch { /* A disconnected browser is detected by the normal room close handler. */ }
    }
  }

  private stageStatus(room: string) {
    if (!this.ctx.id.equals(this.env.ROOMS.idFromName(room))) throw new Error('Room identity mismatch');
    const world = Reflect.get(this, 'world') as World;
    const entries = [...this.sessionsForStage()];
    const session = entries.length === 1 ? entries[0][1] : undefined;
    const player = world.players.find(candidate => candidate.id === session?.id);
    const connected = !!session && entries[0][0].readyState === 1;
    const fresh = !!player && player.delivery.level === 0 && player.delivery.completed === 0 &&
      player.delivery.earned === 0 && player.delivery.lifetimeIncome === 0 && player.delivery.order.stage === 'pickup';
    const restaurant = player && RESTAURANTS[player.delivery.order.restaurant];
    const customer = player && CUSTOMERS[player.delivery.order.customer];
    return {
      paused: this.pausedWorld === world,
      started: this.startedWorld === world,
      ready: this.pausedWorld === world && connected && !!session && session.guest && !session.attachPending && fresh,
      tick: Reflect.get(this, 'tickCount') as number,
      poseRevision: session?.poseRevision ?? null,
      sessionCount: entries.length, connected, guest: session?.guest ?? false,
      attachPending: session?.attachPending ?? false, identitySequence: session?.identitySequence ?? 0,
      fresh,
      initialOrder: restaurant && customer ? {
        restaurant: { id: restaurant.id, x: restaurant.x, z: restaurant.z },
        customer: { id: customer.id, x: customer.x, y: customer.y, z: customer.z, rooftop: customer.rooftop },
      } : null,
    };
  }

  playtestStatus(room: string) { return this.stageStatus(room); }

  playtestBegin(room: string) {
    const status = this.stageStatus(room);
    if (!status.ready || status.started) return { ok: false, ...status };
    const world = this.pausedWorld!;
    const [[socket, session]] = [...this.sessionsForStage()];
    this.stopPausedHeartbeat();
    // Fence pre-start heartbeats and queued controls before restarting the
    // ordinary timer. The client observes the new revision in this snapshot.
    Reflect.apply(Reflect.get(this, 'invalidate'), this, [socket, session]);
    this.publishPausedSnapshot();
    this.pausedWorld = undefined;
    this.startedWorld = world;
    const timer = setInterval(() => Reflect.apply(Reflect.get(this, 'tick'), this, []), 50);
    Reflect.set(this, 'timer', timer);
    return { ok: true, tick: status.tick, poseRevision: session.poseRevision };
  }

  private async stageFirst(world: World, pose: StagePose): Promise<void> {
    const player = world.players[0];
    const car = world.entities.find(entity => entity.id === player?.entityId);
    const sessions = Reflect.get(this, 'sessions') as Map<WebSocket, { id: string }>;
    const entry = [...sessions].find(([, session]) => session.id === player?.id);
    if (!car || !entry) throw new Error('Playtest fixture could not find the first driver');

    // An ordinary traffic car may initially occupy the requested position.
    // Let the real room tick for a bounded time rather than moving traffic.
    const deadline = Date.now() + 5000;
    while (!acceptsPose(world, pose, car.id)) {
      if (this.pausedWorld === world) throw new Error('Seeded playtest position is blocked by another vehicle');
      if (Date.now() >= deadline) throw new Error('Playtest stage remained blocked by another vehicle');
      if (Reflect.get(this, 'world') !== world || !sessions.has(entry[0])) throw new Error('Playtest room ended before staging');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (Reflect.get(this, 'world') !== world || !sessions.has(entry[0])) throw new Error('Playtest room ended before staging');

    this.stagedWorld = world;
    Object.assign(car, pose, {
      vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0,
      pitch: 0, roll: 0, pitchRate: 0, yawRate: 0, rollRate: 0,
      supportId: 'ground', autopilot: false, navigation: null,
    });
    Reflect.apply(Reflect.get(this, 'invalidate'), this, [entry[0], entry[1], true]);
  }

  override async fetch(request: Request): Promise<Response> {
    const pose = stagePose(this.env as unknown as StageVars);
    const options = stageOptions(this.env as unknown as StageVars);
    let world = Reflect.get(this, 'world') as World;
    const sessions = this.sessionsForStage();
    if (this.pausedWorld === world && sessions.size) return new Response('Playtest room already has a driver', { status: 409 });
    if (options.seed !== undefined && this.seededWorld !== world && !sessions.size && !world.players.length && Reflect.get(this, 'tickCount') === 0) {
      const previousMars = world.mars;
      world = createWorld(options.seed);
      world.mars.fund = previousMars.fund; world.mars.roomFund = previousMars.roomFund;
      Reflect.set(this, 'world', world);
      this.seededWorld = world;
    }
    const response = await super.fetch(request);
    world = Reflect.get(this, 'world') as World;
    if (response.status !== 101 || this.stagedWorld === world || !world.players.length) return response;

    if (options.pause) {
      // super.fetch starts the normal interval immediately before returning.
      // Stop it synchronously before yielding to the event loop.
      const timer = Reflect.get(this, 'timer') as ReturnType<typeof setInterval> | null;
      if (timer !== null) clearInterval(timer);
      Reflect.set(this, 'timer', null);
      this.pausedWorld = world;
    }

    // The first snapshot was already sent. Invalidate after staging so the
    // next snapshot fences old controls and the client snaps to the new pose.
    if (!this.staging || this.staging.world !== world)
      this.staging = { world, promise: this.stageFirst(world, pose) };
    try {
      await this.staging.promise;
      if (options.pause && this.pausedWorld === world) {
        // One ordinary broadcast is emitted every two normal ticks. These
        // deterministic setup ticks happen before guest identity or inputs.
        Reflect.apply(Reflect.get(this, 'tick'), this, []);
        Reflect.apply(Reflect.get(this, 'tick'), this, []);
        this.pausedHeartbeat = setInterval(() => this.publishPausedSnapshot(), 1000);
      }
    }
    catch (error) {
      this.stopPausedHeartbeat();
      const reason = error instanceof Error ? error.message : 'Playtest stage failed';
      const sessions = Reflect.get(this, 'sessions') as Map<WebSocket, unknown>;
      for (const socket of sessions.keys()) {
        try { socket.close(1011, reason); } catch { /* A peer may already have closed. */ }
      }
    }
    return response;
  }
}

export default {
  async fetch(request: Request, env: Parameters<typeof worker.fetch>[1], ctx: ExecutionContext): Promise<Response> {
    // Host is request-controlled, not peer authentication. The actual local
    // boundary is Wrangler's required --ip 127.0.0.1 binding.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname))
      return new Response('Playtest fixture is local only', { status: 403 });
    try { stagePose(env as unknown as StageVars); stageOptions(env as unknown as StageVars); }
    catch (error) { return new Response(error instanceof Error ? error.message : 'Invalid playtest position', { status: 500 }); }
    const url = new URL(request.url);
    const match = /^\/api\/playtest\/(status|begin)\/([^/]+)$/.exec(url.pathname);
    if (match) {
      if ((match[1] === 'begin' && request.method !== 'POST') || (match[1] === 'status' && request.method !== 'GET'))
        return new Response('Method not allowed', { status: 405 });
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Cross-origin request denied', { status: 403 });
      const room = roomSlug(`/api/room/${match[2]}`);
      if (!room) return new Response('Invalid room', { status: 400 });
      if (!stageOptions(env as unknown as StageVars).pause) return new Response('Paused playtest is not enabled', { status: 404 });
      const expected = (env as unknown as StageVars).PLAYTEST_STAGE_SECRET;
      if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected))
        return new Response('Playtest control secret is not configured', { status: 503 });
      const provided = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!provided || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(provided), new TextEncoder().encode(expected)))
        return new Response('Unauthorized', { status: 401 });
      const rooms = env.ROOMS as unknown as DurableObjectNamespace<GameRoom>;
      const roomObject = rooms.get(rooms.idFromName(room));
      if (match[1] === 'status') return Response.json(await roomObject.playtestStatus(room));
      const result = await roomObject.playtestBegin(room);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }
    return worker.fetch(request, env, ctx);
  },
};
