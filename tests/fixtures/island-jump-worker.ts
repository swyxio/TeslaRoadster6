// Local Wrangler fixture only. The production room, messages, timer and
// snapshots are unchanged; only the first player's initial pose is staged.
import worker, { GameRoom as ProductionGameRoom, GlobalChat } from '../../worker/index';
import { ISLAND_JUMPS } from '../../shared/island-jumps';
import type { World } from '../../shared/game';

export default worker;
export { GlobalChat };

export class GameRoom extends ProductionGameRoom {
  fetch(): Response {
    // TypeScript's private field is intentionally accessed only by this
    // test-only subclass, rather than exposing a production debug endpoint.
    const world = Reflect.get(this, 'world') as World;
    const stageDriver = world.players.length === 0;
    const response = super.fetch();
    if (stageDriver && response.status === 101) {
      const player = world.players[0];
      const car = world.entities.find(entity => entity.id === player?.entityId);
      if (!car) throw new Error('Fixture did not find the first player’s car');
      const jump = ISLAND_JUMPS[0];
      Object.assign(car, {
        x: jump.start - 25, y: 0, z: jump.z, yaw: -Math.PI / 2,
        vx: 0, vy: 0, vz: 0, speed: 0, pushX: 0, pushZ: 0,
        supportId: 'ground', autopilot: false,
      });
    }
    return response;
  }
}
