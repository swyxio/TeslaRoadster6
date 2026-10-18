// Local-only fixture: start two drivers at a workshop with spending money.
import worker, { GameRoom as ProductionGameRoom, GlobalChat } from '../../worker/index';
import { SHOPS } from '../../shared/upgrades';
import { terrainHeight } from '../../shared/map';
import type { World } from '../../shared/game';

export default worker;
export { GlobalChat };

export class GameRoom extends ProductionGameRoom {
  override fetch(): Response {
    const world = Reflect.get(this, 'world') as World;
    const response = super.fetch();
    const player = world.players.at(-1);
    const car = world.entities.find(entity => entity.id === player?.entityId);
    if (response.status === 101 && player && car) {
      player.delivery.cash = 200;
      const x = SHOPS[0].x + (world.players.length === 1 ? -5 : 5), z = SHOPS[0].z;
      Object.assign(car, { x, z, y: terrainHeight(x, z) ?? 0, vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ground' });
    }
    return response;
  }
}
