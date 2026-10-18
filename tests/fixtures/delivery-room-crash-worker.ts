// LOCAL TEST ONLY: observe a real room arrival, an accepted journal stage,
// and the recovered profile intent without changing production behavior.
import walletWorker, { GameRoom as WalletGameRoom, DriverProfile as WalletDriverProfile,
  RoomEconomy as WalletRoomEconomy, GlobalChat, GlobalIncome } from './luxury-wallet-worker';
import { GlobalEarningsEvent as ProductionGlobalEvents } from '../../worker/global-earnings-event';
import { MarketService } from '../../worker/market-service';
import { GLOBAL_EVENT_DURATION_MS, type EarningsEvents } from '../../shared/earnings-events';
import { BUILDINGS, terrainHeight } from '../../shared/map';
import { orderTarget } from '../../shared/delivery';
import type { World } from '../../shared/game';
import type { EconomyIntent } from '../../worker/driver-profile';
import type { DeliveryStage } from '../../worker/room-economy';

export { GlobalChat, GlobalIncome, MarketService };
export class GlobalEarningsEvent extends ProductionGlobalEvents {
  fixtureSeedExpiring(){
    const endsAt=Date.now()+6_000,startsAt=endsAt-GLOBAL_EVENT_DURATION_MS;
    this.ctx.storage.sql.exec('INSERT INTO global_events (request_id,starts_at,ends_at) VALUES (?,?,?)','fixture-expiring',startsAt,endsAt);
    return {startsAt,endsAt};
  }
}
export class DriverProfile extends WalletDriverProfile {
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    if(intent.action.kind==='delivery')await this.ctx.storage.put(`fixture-delivery:${intent.eventId}`,{intent,events});
    return super.commit(intent,events);
  }
  async fixtureSources(){return Object.fromEntries(await this.ctx.storage.list({prefix:'earned-source:'}));}
  async fixtureReplay(eventId:string){
    const saved=await this.ctx.storage.get<{intent:EconomyIntent;events?:EarningsEvents}>(`fixture-delivery:${eventId}`);
    if(!saved)throw new Error('Recovered delivery intent was not committed');
    return super.commit(saved.intent,saved.events);
  }
}
export class RoomEconomy extends WalletRoomEconomy {
  override async stageDelivery(stage:DeliveryStage){
    const result=await super.stageDelivery(stage);
    if(result==='accepted')await this.ctx.storage.put(`fixture-delivery-accepted:${stage.driverId}:${stage.eventId}`,stage);
    return result;
  }
  async fixtureAccepted(driverId:string){return [...(await this.ctx.storage.list({prefix:`fixture-delivery-accepted:${driverId}:`})).values()];}
  fixtureReplay(stage:DeliveryStage){return super.stageDelivery(stage);}
}
export class GameRoom extends WalletGameRoom {
  async fixtureRefreshRate(){
    await Reflect.apply(Reflect.get(this,'refreshEarnings'),this,[]);
    return Reflect.apply(Reflect.get(this,'rate'),this,[Date.now()]);
  }
  async fixtureTransientDropoff(playerId:string){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(candidate=>candidate.id===playerId);
    const car=world.entities.find(entity=>entity.id===player?.entityId);
    if(!player||!car||player.delivery.order.stage!=='dropoff')throw new Error('Test driver has no drop-off');
    const target=orderTarget(player.delivery.order);
    const roof=target.rooftop?BUILDINGS.findIndex(building=>building.x===target.x&&building.z===target.z&&building.h===target.y):-1;
    if(target.rooftop&&roof<0)throw new Error('Drop-off roof missing');
    const previous=structuredClone(car);
    Object.assign(car,{x:target.x,z:target.z,y:target.rooftop?target.y:terrainHeight(target.x,target.z)??0,
      vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:target.rooftop?`roof:${roof}`:'ground',autopilot:false,navigation:null});
    try{Reflect.apply(Reflect.get(this,'tick'),this,[]);}finally{Object.assign(car,previous);}
    return {target};
  }
}
type FixtureEnv={ROOMS:DurableObjectNamespace<GameRoom>;DRIVERS:DurableObjectNamespace<DriverProfile>;
  ECONOMIES:DurableObjectNamespace<RoomEconomy>;GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>};
export default {
  async fetch(request:Request,env:FixtureEnv,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/__delivery-crash/'))return walletWorker.fetch(request,env as never,ctx);
    if(request.method!=='POST')return new Response('POST required',{status:405});
    const body=await request.json() as {room:string;driverId:string;playerId:string;eventId:string;stage:DeliveryStage};
    if(path==='/__delivery-crash/seed-event')return Response.json(await env.GLOBAL_EVENTS.get(env.GLOBAL_EVENTS.idFromName('global')).fixtureSeedExpiring());
    if(path==='/__delivery-crash/sources')return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId)).fixtureSources());
    if(path==='/__delivery-crash/replay-intent')return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId)).fixtureReplay(body.eventId));
    const economy=env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room));
    if(path==='/__delivery-crash/accepted')return Response.json(await economy.fixtureAccepted(body.driverId));
    if(path==='/__delivery-crash/replay-stage')return Response.json(await economy.fixtureReplay(body.stage));
    const room=env.ROOMS.get(env.ROOMS.idFromName(body.room));
    if(path==='/__delivery-crash/rate')return Response.json(await room.fixtureRefreshRate());
    if(path==='/__delivery-crash/dropoff')return Response.json(await room.fixtureTransientDropoff(body.playerId));
    return new Response('Unknown fixture route',{status:404});
  },
};
