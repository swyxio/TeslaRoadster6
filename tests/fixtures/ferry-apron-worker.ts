// Local-only deterministic staging. The real room still receives and applies
// the frames, runs the ferry/physics step, and emits its ordinary messages.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, DriverProfile, RoomEconomy, GlobalIncome } from '../../worker/index';
import { FERRY_DOCKS } from '../../shared/map';
import type { World } from '../../shared/game';
import type { ScheduledInput } from '../../shared/tick-input';

export default worker;
export { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome };

export class GameRoom extends ProductionGameRoom {
  override async fetch(request:Request):Promise<Response> {
    const world=Reflect.get(this,'world') as World;
    const first=world.players.length===0;
    if(first){
      const runTick=Reflect.get(this,'tick') as () => void;
      let armed=false;
      Reflect.set(this,'tick',()=>{
        const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{control:ScheduledInput}>;
        const nextTick=(Reflect.get(this,'tickCount') as number)+1;
        if(!armed&&[...sessions.values()].some(session=>session.control.snapshot().queued.some(
          slot=>slot.targetTick===nextTick&&slot.input.jump===1&&slot.input.throttle===1,
        ))){
          // Reach the existing apron deadline exactly on the frame's due tick.
          world.ferry.remaining=12;
          armed=true;
        }
        runTick.call(this);
      });
    }
    const response=await super.fetch(request);
    if(first&&response.status===101){
      const player=world.players[0],car=world.entities.find(entity=>entity.id===player?.entityId);
      if(!car)throw new Error('Fixture could not find the driver');
      Object.assign(world.ferry,{phase:'island',x:FERRY_DOCKS.island.x,z:FERRY_DOCKS.island.deckZ,
        velocity:0,remaining:25,passengers:[],arrivals:[car.id],blocked:null});
      Object.assign(car,{x:world.ferry.x,y:0,z:world.ferry.z,yaw:0,vx:0,vy:0,vz:0,speed:0,
        pushX:0,pushZ:0,supportId:'ferry',autopilot:false});
    }
    return response;
  }
}
