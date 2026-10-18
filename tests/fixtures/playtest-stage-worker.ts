// LOCAL PLAYTEST ONLY. Serve this entry point on loopback with isolated storage;
// never deploy it. Staging changes only the first driver in each fresh room.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from '../../worker/index';
import { MAP_BOUNDS, terrainHeight } from '../../shared/map';
import { addPlayer, createEmptyWorld, type World } from '../../shared/game';

export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

type StageVars = { PLAYTEST_X?: unknown; PLAYTEST_Z?: unknown; PLAYTEST_YAW?: unknown };
type StagePose = { x: number; y: number; z: number; yaw: number };

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
    const response = await super.fetch(request);
    const world = Reflect.get(this, 'world') as World;
    if (response.status !== 101 || this.stagedWorld === world || !world.players.length) return response;

    // The first snapshot was already sent. Invalidate after staging so the
    // next snapshot fences old controls and the client snaps to the new pose.
    if (!this.staging || this.staging.world !== world)
      this.staging = { world, promise: this.stageFirst(world, pose) };
    try { await this.staging.promise; }
    catch (error) {
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
    // The hostname check is defense in depth; bind Wrangler to 127.0.0.1 too.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname))
      return new Response('Playtest fixture is local only', { status: 403 });
    try { stagePose(env as unknown as StageVars); }
    catch (error) { return new Response(error instanceof Error ? error.message : 'Invalid playtest position', { status: 500 }); }
    return worker.fetch(request, env, ctx);
  },
};
