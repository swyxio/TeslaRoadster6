// Local-only fixture: start two drivers at a workshop with their guest wallets.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent } from '../../worker/index';
import { SHOPS } from '../../shared/upgrades';
import { terrainHeight } from '../../shared/map';
import type { World } from '../../shared/game';

export default worker;
export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent };

export class GameRoom extends ProductionGameRoom {
  override async fetch(request:Request): Promise<Response> {
    const world = Reflect.get(this, 'world') as World;
    const response = await super.fetch(request);
    const player = world.players.at(-1);
    const car = world.entities.find(entity => entity.id === player?.entityId);
    if (response.status === 101 && player && car) {
      const x = SHOPS[0].x + (world.players.length === 1 ? -5 : 5), z = SHOPS[0].z;
      Object.assign(car, { x, z, y: terrainHeight(x, z) ?? 0, vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ground' });
    }
    return response;
  }
}
