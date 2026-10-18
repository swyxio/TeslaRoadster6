// Test-only entry point: grant the two drivers endgame cash and place them at
// Fremont so the real room can exercise contributions/boarding without months
// of deliveries. This file is never used by the deployed Wrangler config.
import worker, { GameRoom, GlobalChat } from '../../worker/index';
import { FREMONT_SPACEPORT } from '../../shared/map';
import type { World } from '../../shared/game';
export { GlobalChat };
export default worker;

export class MarsTestRoom extends GameRoom {
  override fetch():Response {
    const response=super.fetch();
    const world=(this as unknown as {world:World}).world;
    const player=world.players.at(-1);
    if(player){
      player.delivery.cash=600_000_000;player.delivery.level=2;
      const car=world.entities.find(e=>e.id===player.entityId)!;
      Object.assign(car,{x:FREMONT_SPACEPORT.entrance.x+(world.players.length===1?-5:5),z:FREMONT_SPACEPORT.entrance.z,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
    }
    return response;
  }
}
