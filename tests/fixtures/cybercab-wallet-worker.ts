// Local-only fixture for the production profile transaction and outbox.
import { DriverProfile as ProductionDriver, progressFrom, type DriverProgress, type EconomyIntent } from '../../worker/driver-profile';
import { GameRoom, GlobalChat, RoomEconomy, GlobalIncome } from '../../worker/index';
import { initialDelivery, levelForCash } from '../../shared/delivery';

export { GameRoom, GlobalChat, RoomEconomy, GlobalIncome };
export class DriverProfile extends ProductionDriver {
  async fixtureSeed(driverId:string,fence:string,roomId:string){
    const delivery=initialDelivery({x:0,z:0});delivery.cash=25_000;delivery.level=levelForCash(delivery.cash);
    const progress=progressFrom(delivery,[],{},[],0,0);
    // Simulate a profile written before CybercabFleet was added.
    delete progress.cybercabs;
    await this.ctx.storage.put('driver',{driverId,fence,roomId,revision:0,sequence:0,sealed:false,progress,incomeActivated:false});
  }
  async fixtureRead(){
    return {record:await this.ctx.storage.get<{progress:DriverProgress;revision:number;sequence:number}>('driver'),
      pending:await this.ctx.storage.get<number>('income-pending')??null};
  }
}
type Env={DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>};
type Body={driverId:string;fence:string;roomId:string;intent:EconomyIntent};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path==='/health')return Response.json({ok:true});
    if(path==='/income')return Response.json({total:await env.INCOME.get(env.INCOME.idFromName('global')).total()});
    const body=await request.json() as Body,profile=env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId));
    if(path==='/seed'){await profile.fixtureSeed(body.driverId,body.fence,body.roomId);return Response.json({ok:true});}
    if(path==='/acquire')return Response.json(await profile.acquire(body.driverId,body.fence,progressFrom(initialDelivery({x:0,z:0}),[],{},[],0,0),body.roomId));
    if(path==='/commit')return Response.json(await profile.commit(body.intent));
    if(path==='/read')return Response.json(await profile.fixtureRead());
    return new Response('not found',{status:404});
  }
};
