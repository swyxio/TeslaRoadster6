// LOCAL TEST ONLY: bind Wrangler to loopback and use isolated storage. Never deploy.
// Only the two player poses and the ferry dock countdown are staged; the real
// room owns all input handling, ticks, collisions and replicated snapshots.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from '../../worker/index';
import { DOME } from '../../shared/dome';
import type { World } from '../../shared/game';

export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService };

export class GameRoom extends ProductionGameRoom {
  override async fetch(request: Request): Promise<Response> {
    const beforeWorld = Reflect.get(this, 'world') as World;
    const previousIds = new Set(beforeWorld.players.map(player => player.id));
    const response = await super.fetch(request);
    const world = Reflect.get(this, 'world') as World;
    const player = world.players.find(candidate => !previousIds.has(candidate.id));
    if (response.status !== 101 || !player || previousIds.size >= 2) return response;
    const car = world.entities.find(entity => entity.id === player.entityId);
    const sessions = Reflect.get(this, 'sessions') as Map<WebSocket, { id: string }>;
    const entry = [...sessions].find(([, session]) => session.id === player.id);
    if (!car || !entry) throw new Error('Fixture did not find the player car and session');
    const room = new URL(request.url).pathname;
    if (room.includes('/ferry-')) {
      if (previousIds.size === 1) world.ferry.remaining = 4;
      Object.assign(car, {
        x: world.ferry.x + (previousIds.size === 0 ? -3.5 : 3.5), y: 0,
        z: world.ferry.z + (previousIds.size === 0 ? -6 : 6), yaw: 0,
        vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ferry', autopilot: false,
      });
    } else if (room.includes('/collision-')) {
      Object.assign(car, {
        x: DOME.x + (previousIds.size === 0 ? -30 : 20), y: 0, z: DOME.z - 12,
        yaw: previousIds.size === 0 ? -Math.PI / 2 : Math.PI / 2, inDome: true,
        vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ground', autopilot: false,
      });
    } else return response;
    // The first snapshot was already sent; fence stale controls after staging.
    Reflect.apply(Reflect.get(this, 'invalidate'), this, [entry[0], entry[1], true]);
    return response;
  }
}

export default {
  async fetch(request: Request, env: Parameters<typeof worker.fetch>[1], ctx: ExecutionContext): Promise<Response> {
    // The Host header is not an access boundary; loopback binding is required.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname))
      return new Response('Room behavior fixture is local only', { status: 403 });
    return worker.fetch(request, env, ctx);
  },
};
