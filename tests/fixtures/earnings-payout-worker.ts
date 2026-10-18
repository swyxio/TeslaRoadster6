// LOCAL TEST ONLY: seed an active event, position players, and inject a lost RPC reply.
import worker, { GameRoom as ProductionGameRoom, GlobalChat, RoomEconomy as ProductionRoomEconomy } from '../../worker/index';
import { DriverProfile as ProductionDriverProfile, GlobalIncome as ProductionGlobalIncome, type EconomyIntent } from '../../worker/driver-profile';
import { GlobalEarningsEvent as ProductionGlobalEvents } from '../../worker/global-earnings-event';
import { GLOBAL_EVENT_DURATION_MS } from '../../shared/earnings-events';
import { orderTarget } from '../../shared/delivery';
import { DOME } from '../../shared/dome';
import { terrainHeight } from '../../shared/map';
import { travelDome, type World } from '../../shared/game';

export { GlobalChat };
export class GlobalEarningsEvent extends ProductionGlobalEvents {
  // Deliberately bypasses scheduling lead-time only to make an active event
  // available immediately. Rate lookup and leases remain production code.
  fixtureSeed(){
    const start=Date.now()-1_000;
    this.ctx.storage.sql.exec('INSERT INTO global_events (request_id,starts_at,ends_at) VALUES (?,?,?)','fixture-active',start,start+GLOBAL_EVENT_DURATION_MS);
  }
}
export class GlobalIncome extends ProductionGlobalIncome {
  private holdDriver:string|null=null;
  private held=false;
  fixtureHold(driver:string){this.holdDriver=driver;}
  async fixtureState(driver:string){return {held:this.held,status:await this.status(driver)};}
  override async credit(driver:string,total:number){
    const result=await super.credit(driver,total);
    if(this.holdDriver===driver){this.held=true;await new Promise<void>(()=>{});}
    return result;
  }
}
export class DriverProfile extends ProductionDriverProfile {
  private loseDelivery=false;
  private lost=false;
  fixtureLoseDelivery(){this.loseDelivery=true;}
  override async commit(intent:EconomyIntent,cabEvents?:import('../../shared/earnings-events').EarningsEvents){
    const result=await super.commit(intent,cabEvents);
    if(intent.action.kind==='progress'&&intent.action.earnings?.some(part=>part.kind==='delivery')){
      await this.ctx.storage.put('fixture-delivery-intent',intent);
      if(this.loseDelivery){this.loseDelivery=false;this.lost=true;throw new Error('Injected lost profile reply');}
    }
    return result;
  }
  async fixtureReplay(){
    const intent=await this.ctx.storage.get<EconomyIntent>('fixture-delivery-intent');
    if(!intent)throw new Error('No delivery intent');
    return super.commit(intent);
  }
  async fixtureState(){
    return {driver:await this.ctx.storage.get('driver'),sources:Object.fromEntries(await this.ctx.storage.list({prefix:'earned-source:'})),
      pending:await this.ctx.storage.get<number>('income-pending')??null,alarm:await this.ctx.storage.getAlarm(),lost:this.lost};
  }
}
export class RoomEconomy extends ProductionRoomEconomy {
  private holdWin=false;
  private heldWin=false;
  override recordEarningsWinWithoutPayout(eventId:string,atMs:number){
    const result=super.recordEarningsWinWithoutPayout(eventId,atMs);
    // DO RPC permits a Promise return; the cast adapts the synchronous base
    // signature in this local fault fixture without altering production.
    if(this.holdWin){this.heldWin=true;return new Promise<typeof result>(()=>{}) as unknown as typeof result;}
    return result;
  }
  fixtureHoldWin(){this.holdWin=true;}
  fixtureWinFault(){return {held:this.heldWin};}
  fixtureWins(){return this.ctx.storage.sql.exec('SELECT event_id,requested_at,won_at,ends_at FROM room_earnings_wins').toArray();}
}
export class GameRoom extends ProductionGameRoom {
  fixturePlayer(id:string){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(p=>p.id===id);
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:{walletId:string}}>;
    const session=[...sessions.values()].find(s=>s.id===id);
    if(!player||!session)throw new Error('Fixture player missing');
    return {driver:session.economy.walletId,player:structuredClone(player)};
  }
  fixturePlace(id:string){
    const world=Reflect.get(this,'world') as World;
    const player=world.players.find(p=>p.id===id),car=world.entities.find(e=>e.id===player?.entityId);
    if(!player||!car)throw new Error('Fixture player missing');
    const target=orderTarget(player.delivery.order);
    Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z)??0,vx:0,vy:0,vz:0,speed:0,pushX:0,pushZ:0,supportId:'ground'});
    return {stage:player.delivery.order.stage,target};
  }
  fixtureWin(id:string){
    const world=Reflect.get(this,'world') as World;
    if(!travelDome(world,id))throw new Error('Could not enter Dome');
    world.soccer.participants=[{playerId:id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:4,retrofit:0,stock:0}}];
    world.soccer.lastTouch={playerId:id,carClass:'roadster'};
    world.soccer.blueScore=4;
    Object.assign(world.soccer.ball,{x:DOME.x+DOME.halfLength-2,y:3,z:DOME.z,vx:90,vy:0,vz:0});
  }
  async fixtureState(){
    return {pending:this.ctx.storage.sql.exec('SELECT * FROM game_room_pending_wins').toArray(),snapshot:Reflect.get(this,'earningsSnapshot'),hasPending:Reflect.get(this,'hasPendingWin'),alarm:await this.ctx.storage.getAlarm()};
  }
}
type Env={ROOMS:DurableObjectNamespace<GameRoom>;CHAT:DurableObjectNamespace<GlobalChat>;DRIVERS:DurableObjectNamespace<DriverProfile>;ECONOMIES:DurableObjectNamespace<RoomEconomy>;INCOME:DurableObjectNamespace<GlobalIncome>;GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/__earnings-test/'))return worker.fetch(request,env as never,ctx);
    const data=await request.json() as {room?:string;player?:string;driver?:string};
    const room=env.ROOMS.get(env.ROOMS.idFromName(data.room??'earnings'));
    const income=env.INCOME.get(env.INCOME.idFromName('global'));
    try{
      switch(url.pathname.slice('/__earnings-test/'.length)){
        case 'seed-event':await env.GLOBAL_EVENTS.get(env.GLOBAL_EVENTS.idFromName('global')).fixtureSeed();return Response.json({ok:true});
        case 'player':return Response.json(await room.fixturePlayer(data.player!));
        case 'place':return Response.json(await room.fixturePlace(data.player!));
        case 'win':await room.fixtureWin(data.player!);return Response.json({ok:true});
        case 'room':return Response.json(await room.fixtureState());
        case 'wins':return Response.json(await env.ECONOMIES.get(env.ECONOMIES.idFromName(data.room??'earnings')).fixtureWins());
        case 'hold-win':await env.ECONOMIES.get(env.ECONOMIES.idFromName(data.room??'earnings')).fixtureHoldWin();return Response.json({ok:true});
        case 'win-fault':return Response.json(await env.ECONOMIES.get(env.ECONOMIES.idFromName(data.room??'earnings')).fixtureWinFault());
        case 'profile':return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(data.driver!)).fixtureState());
        case 'lose-delivery':await env.DRIVERS.get(env.DRIVERS.idFromName(data.driver!)).fixtureLoseDelivery();return Response.json({ok:true});
        case 'replay':return Response.json(await env.DRIVERS.get(env.DRIVERS.idFromName(data.driver!)).fixtureReplay());
        case 'hold':await income.fixtureHold(data.driver!);return Response.json({ok:true});
        case 'income':return Response.json(await income.fixtureState(data.driver!));
        default:return new Response('Not found',{status:404});
      }
    }catch(error){return new Response(String(error),{status:400});}
  }
};
