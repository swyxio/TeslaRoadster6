// Local-only fixture: only player poses and the ferry's initial dock timer are
// staged. GameRoom still owns all messages, simulation, ticks and snapshots.
import worker, { GameRoom as ProductionGameRoom, GlobalChat } from '../../worker/index';
import { DOME } from '../../shared/dome';
import type { World } from '../../shared/game';

export default worker;
export { GlobalChat };

export class GameRoom extends ProductionGameRoom {
  override fetch(request?: Request): Response {
    const world = Reflect.get(this, 'world') as World;
    const before = world.players.length;
    const response = super.fetch();
    if (response.status !== 101 || world.players.length !== before + 1 || before >= 2) return response;
    const player = world.players.at(-1)!;
    const car = world.entities.find(entity => entity.id === player.entityId);
    if (!car) throw new Error('Fixture did not find the player car');
    const room = new URL(request!.url).pathname;
    if (room.includes('/ferry-')) {
      if (before === 0) world.ferry.remaining = 4;
      Object.assign(car, {
        x: before === 0 ? -3.5 : 3.5, y: 0, z: world.ferry.z + (before === 0 ? -6 : 6), yaw: 0,
        vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ferry', autopilot: false,
      });
    } else if (room.includes('/collision-')) {
      Object.assign(car, {
        x: DOME.x + (before === 0 ? -30 : 20), y: 0, z: DOME.z - 12,
        yaw: before === 0 ? -Math.PI / 2 : Math.PI / 2, inDome: true,
        vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0, supportId: 'ground', autopilot: false,
      });
    }
    return response;
  }
}
