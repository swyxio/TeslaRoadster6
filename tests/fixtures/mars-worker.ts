// Local-only fixture: seed verified global income and place a player at Fremont.
import worker, { GameRoom, GlobalChat, DriverProfile as ProductionDriverProfile, GlobalIncome, RoomEconomy as ProductionRoomEconomy } from '../../worker/index';
import type { EconomyIntent } from '../../worker/driver-profile';
import { FREMONT_SPACEPORT, terrainHeight } from '../../shared/map';
import type { World } from '../../shared/game';
export { GlobalChat, GlobalIncome };
export class RoomEconomy extends ProductionRoomEconomy {
  private alarmCalls=0;
  override async alarm(){this.alarmCalls++;return super.alarm();}
  async fixtureAlarmState(){return {calls:this.alarmCalls,alarm:await this.ctx.storage.getAlarm(),now:Date.now()};}
}
export class DriverProfile extends ProductionDriverProfile {
  private holdNextDonation=false;
  private heldIntent:EconomyIntent|undefined;
  private heldReply:Promise<void>|undefined;

  async fixtureHoldDonation(){this.holdNextDonation=true;}
  async fixtureFaultState(){return {held:!!this.heldReply,intent:this.heldIntent};}
  async fixtureCash(){const record=await this.ctx.storage.get<{progress:{cash:number}}>('driver');return record?.progress.cash;}
  override async commit(intent:EconomyIntent){
    // Duplicate attempts must also wait; otherwise an alarm could bypass the
    // simulated lost reply before the test terminates the local Worker.
    if(this.heldIntent?.eventId===intent.eventId && this.heldReply)await this.heldReply;
    const outcome=await super.commit(intent);
    if(this.holdNextDonation&&intent.action.kind==='contribute'){
      this.holdNextDonation=false;this.heldIntent=structuredClone(intent);
      this.heldReply=new Promise<void>(()=>{});
      await this.heldReply;
    }
    return outcome;
  }
}
export class MarsTestRoom extends GameRoom {
  async fixtureSessionCount(){return (Reflect.get(this,'sessions') as Map<WebSocket,unknown>).size;}
  async fixtureWalletId(playerId:string){
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:{walletId:string}}>;
    const session=[...sessions.values()].find(value=>value.id===playerId);
    if(!session)throw new Error('Player missing');
    return session.economy.walletId;
  }
  async fixturePlace(playerId:string,side:number){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(p=>p.id===playerId),car=world.entities.find(e=>e.id===player?.entityId);
    if(!car)throw new Error('Player missing');
    const x=FREMONT_SPACEPORT.entrance.x+side*5,z=FREMONT_SPACEPORT.entrance.z;
    Object.assign(car,{x,z,y:terrainHeight(x,z)??0,yaw:-Math.PI/2,vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:'ground'});
  }
}
type Env={ROOMS:DurableObjectNamespace<MarsTestRoom>;INCOME:DurableObjectNamespace<GlobalIncome>;DRIVERS:DurableObjectNamespace<DriverProfile>;ECONOMIES:DurableObjectNamespace<RoomEconomy>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/__mars-test/credit'){
      const data=await request.json() as {id:string;amount:number};
      return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).credit(data.id,data.amount));
    }
    if(url.pathname==='/__mars-test/total'){
      return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).total());
    }
    if(url.pathname==='/__mars-test/place'){
      const data=await request.json() as {room:string;id:string;side:number};
      await env.ROOMS.get(env.ROOMS.idFromName(data.room)).fixturePlace(data.id,data.side);
      return Response.json({ok:true});
    }
    if(url.pathname==='/__mars-test/sessions'){
      const data=await request.json() as {room:string};
      return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(data.room)).fixtureSessionCount());
    }
    if(url.pathname==='/__mars-test/wallet-id'){
      const data=await request.json() as {room:string;id:string};
      return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(data.room)).fixtureWalletId(data.id));
    }
    if(url.pathname==='/__mars-test/hold-donation'||url.pathname==='/__mars-test/fault-state'||url.pathname==='/__mars-test/cash'){
      const data=await request.json() as {driverId:string};
      const driver=env.DRIVERS.get(env.DRIVERS.idFromName(data.driverId));
      if(url.pathname.endsWith('/hold-donation')){await driver.fixtureHoldDonation();return Response.json({ok:true});}
      return Response.json(url.pathname.endsWith('/cash')?await driver.fixtureCash():await driver.fixtureFaultState());
    }
    if(url.pathname==='/__mars-test/replay'){
      const intent=await request.json() as EconomyIntent;
      return Response.json(await env.ECONOMIES.get(env.ECONOMIES.idFromName(intent.roomId)).submit(intent));
    }
    if(url.pathname==='/__mars-test/room-alarm'){
      const data=await request.json() as {room:string};
      return Response.json(await env.ECONOMIES.get(env.ECONOMIES.idFromName(data.room)).fixtureAlarmState());
    }
    return worker.fetch(request,env as never,ctx);
  }
};
