// Local-only fixture: fill every checked SF spawn without changing production state.
import { GameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome } from '../../worker/index';
import { makeEntity, type World } from '../../shared/game';
export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome };

export class NoSpawnGameRoom extends GameRoom {
  private seeded=false;
  override async fetch(request:Request):Promise<Response> {
    const world=(this as unknown as {world:World}).world;
    if(!this.seeded){
      let id=0;
      const block=(x:number,z:number)=>world.entities.push(makeEntity(`no-spawn-blocker-${id++}`,'roadster',x,z));
      block(40,60);
      for(let i=0;i<192;i++)block([60,0,-60,-120,-180,-240][Math.floor(i/32)]+(i%2?3.5:-3.5),120-Math.floor(i/2)%16*14);
      for(let x=-220;x<=220;x+=20)for(const z of [210,-210])block(x,z);
      this.seeded=true;
    }
    if(new URL(request.url).pathname==='/release'){
      world.entities=world.entities.filter(entity=>!entity.id.startsWith('no-spawn-blocker-'));
      return new Response('released');
    }
    return super.fetch(request);
  }
}

export default {
  fetch(request:Request,env:{ROOMS:DurableObjectNamespace<NoSpawnGameRoom>}){
    return env.ROOMS.get(env.ROOMS.idFromName('blocked')).fetch(request);
  },
};
