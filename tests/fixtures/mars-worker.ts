// Local-only fixture: seed verified global income and place a player at Fremont.
import worker, { GameRoom, GlobalChat, DriverProfile, GlobalIncome, RoomEconomy } from '../../worker/index';
import { FREMONT_SPACEPORT, terrainHeight } from '../../shared/map';
import type { World } from '../../shared/game';
export { GlobalChat, DriverProfile, GlobalIncome, RoomEconomy };
export class MarsTestRoom extends GameRoom {
  async fixturePlace(playerId:string,side:number){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(p=>p.id===playerId),car=world.entities.find(e=>e.id===player?.entityId);
    if(!car)throw new Error('Player missing');
    const x=FREMONT_SPACEPORT.entrance.x+side*5,z=FREMONT_SPACEPORT.entrance.z;
    Object.assign(car,{x,z,y:terrainHeight(x,z)??0,yaw:-Math.PI/2,vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:'ground'});
  }
}
type Env={ROOMS:DurableObjectNamespace<MarsTestRoom>;INCOME:DurableObjectNamespace<GlobalIncome>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/__mars-test/credit'){
      const data=await request.json() as {id:string;amount:number};
      return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).credit(data.id,data.amount));
    }
    if(url.pathname==='/__mars-test/place'){
      const data=await request.json() as {room:string;id:string;side:number};
      await env.ROOMS.get(env.ROOMS.idFromName(data.room)).fixturePlace(data.id,data.side);
      return Response.json({ok:true});
    }
    return worker.fetch(request,env as never,ctx);
  }
};
