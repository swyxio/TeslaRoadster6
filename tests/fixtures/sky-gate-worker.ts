// Local-only fixture. The room's real messages, simulation and snapshots are
// unchanged; stage the first driver immediately before the observer joins.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from '../../worker/index';
import { ACCESS_BOUNDARIES } from '../../shared/delivery';
import { JET_STREAMS } from '../../shared/sky-currents';
import type { World } from '../../shared/game';

export default worker;
export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent };

export class GameRoom extends ProductionGameRoom {
  override async fetch(request:Request): Promise<Response> {
    const world = Reflect.get(this, 'world') as World;
    if (world.players.length === 1) {
      const player = world.players[0];
      const car = world.entities.find(entity => entity.id === player.entityId);
      const lane = JET_STREAMS.find(current => current.id === 'skyline');
      if (!car || !lane) throw new Error('Fixture needs the first player and Skyline Express');
      Object.assign(car, {
        x: ACCESS_BOUNDARIES.oaklandX - .2, y: lane.height, z: lane.start.z,
        yaw: Math.PI / 2, vx: 30, vy: 0, vz: 0, speed: 0,
        pushX: 0, pushZ: 0, air: 0, supportId: null, autopilot: false,
      });
    }
    return super.fetch(request);
  }
}
