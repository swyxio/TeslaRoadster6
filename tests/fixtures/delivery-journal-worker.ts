// LOCAL TEST ONLY: inject lost replies around the production wallet journal.
import { GameRoom as BaseRoom, RoomEconomy as BaseEconomy, DriverProfile as BaseProfile,
  GlobalIncome as BaseIncome, GlobalEarningsEvent as BaseGlobal } from './cybercab-events-worker';
import { initialDelivery, levelForCash } from '../../shared/delivery';
import { progressFrom, type EconomyIntent } from '../../worker/driver-profile';
import type { EarningsEvents } from '../../shared/earnings-events';
import type { AchievementStage, DeliveryStage } from '../../worker/room-economy';

export class GameRoom extends BaseRoom {}
export class GlobalIncome extends BaseIncome {}
export class GlobalEarningsEvent extends BaseGlobal {}
export class RoomEconomy extends BaseEconomy {
  private hold=false;
  private held=false;
  private failLaterHistory=false;
  private historyFailures=0;
  fixtureHoldDelivery(){this.hold=true;}
  fixtureDeliveryHeld(){return this.held;}
  fixtureFailHistory(value:boolean){this.failLaterHistory=value;}
  fixtureHistoryFailures(){return this.historyFailures;}
  override earningsHistory(from:number,to:number,cursor?:Parameters<BaseEconomy['earningsHistory']>[2]){
    if(cursor&&this.failLaterHistory){this.historyFailures++;throw new Error('Injected later room history page failure');}
    return super.earningsHistory(from,to,cursor);
  }
  override async stageDelivery(stage:DeliveryStage){
    const result=await super.stageDelivery(stage);
    if(this.hold){this.hold=false;this.held=true;await new Promise<void>(()=>{});}
    return result;
  }
  override async stageAchievement(stage:AchievementStage){
    const result=await super.stageAchievement(stage);
    if(this.hold){this.hold=false;this.held=true;await new Promise<void>(()=>{});}
    return result;
  }
}
export class DriverProfile extends BaseProfile {
  private holdDelivery=false;
  private deliveryHeld=false;
  private holdAssignment=false;
  private assignmentHeld=false;
  fixtureHoldAssignment(){this.holdAssignment=true;}
  fixtureAssignmentHeld(){return this.assignmentHeld;}
  fixtureAssignment(eventId:string){return this.ctx.storage.get(`assignment:${eventId}`);}
  async fixtureLegacyAssignment(eventId:string){
    const key=`assignment:${eventId}`;
    const saved=await this.ctx.storage.get<{done:boolean;delivery:{order:{search?:{cursor:{pair:number;leg:0|1;heading:number;version?:number}}}}}>(key);
    if(!saved||saved.done||!saved.delivery.order.search)throw new Error('No unfinished assignment');
    saved.delivery.order.search.cursor={pair:128,leg:1,heading:0};
    await this.ctx.storage.put(key,saved);
  }
  protected override async assignmentCheckpointed(_eventId:string,done:boolean){
    if(this.holdAssignment&&!done){this.holdAssignment=false;this.assignmentHeld=true;await new Promise<void>(()=>{});}
  }
  fixtureHoldDelivery(){this.holdDelivery=true;}
  fixtureDeliveryHeld(){return this.deliveryHeld;}
  async fixtureSources(){return [...(await this.ctx.storage.list({prefix:'earned-source:'})).keys()];}
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    const result=await super.commit(intent,events);
    if((intent.action.kind==='delivery'||intent.action.kind==='achievement')&&this.holdDelivery){
      this.holdDelivery=false;this.deliveryHeld=true;await new Promise<void>(()=>{});
    }
    return result;
  }
}
type Env={ROOMS:DurableObjectNamespace<GameRoom>;ECONOMIES:DurableObjectNamespace<RoomEconomy>;
  DRIVERS:DurableObjectNamespace<DriverProfile>;INCOME:DurableObjectNamespace<GlobalIncome>;
  GLOBAL_EVENTS:DurableObjectNamespace<GlobalEarningsEvent>};
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(new URL(request.url).pathname==='/health')return new Response('ok');
    const body=await request.json() as any;
    const room=env.ROOMS.get(env.ROOMS.idFromName(body.room??'fixture'));
    const economy=env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room??'fixture'));
    const driver=env.DRIVERS.get(env.DRIVERS.idFromName(body.driverId??'fixture'));
    try{
      switch(body.op){
        case 'producer':await room.fixtureProducer(body.active);return Response.json(true);
        case 'persistent-producer':await room.fixturePersistentProducer(body.active);return Response.json(true);
        case 'acquire':{
          const initial=progressFrom(initialDelivery({x:0,z:0}),[],{},[],0,0);
          initial.cash=body.cash??35_000;initial.level=levelForCash(initial.cash);
          if(body.progress)Object.assign(initial,body.progress);
          return Response.json(await driver.acquire(body.driverId,body.fence,initial,body.room));
        }
        case 'commit':return Response.json(await driver.commit(body.intent));
        case 'stage':return Response.json(await economy.stageDelivery(body.stage));
        case 'stage-achievement':return Response.json(await economy.stageAchievement(body.stage));
        case 'stage-ticket':return Response.json(await economy.stageTicket(body.stage));
        case 'submit':return Response.json(await economy.submit(body.intent));
        case 'ack':return Response.json(await economy.acknowledge(body.intent));
        case 'freeze':await economy.freeze(body.driverId,body.fence);return Response.json(true);
        case 'record':return Response.json(await economy.fixtureRecord(body.eventId)??null);
        case 'keys':return Response.json(await economy.fixtureKeys());
        case 'profile':return Response.json(await driver.fixtureInspect()??null);
        case 'sources':return Response.json(await driver.fixtureSources());
        case 'hold-stage':await economy.fixtureHoldDelivery();return Response.json(true);
        case 'stage-held':return Response.json(await economy.fixtureDeliveryHeld());
        case 'hold-assignment':await driver.fixtureHoldAssignment();return Response.json(true);
        case 'assignment-held':return Response.json(await driver.fixtureAssignmentHeld());
        case 'assignment':return Response.json(await driver.fixtureAssignment(body.eventId)??null);
        case 'legacy-assignment':await driver.fixtureLegacyAssignment(body.eventId);return Response.json(true);
        case 'hold-profile':await driver.fixtureHoldDelivery();return Response.json(true);
        case 'profile-held':return Response.json(await driver.fixtureDeliveryHeld());
        case 'hold-fence':await driver.fixtureHoldFence(body.skip??0);return Response.json(true);
        case 'fence-held':return Response.json(await driver.fixtureFenceHeld());
        case 'release-fence':await driver.fixtureReleaseFence();return Response.json(true);
        case 'room-win':return Response.json(await economy.recordEarningsWinWithoutPayout(body.eventId,body.at));
        case 'room-pending':return Response.json(await economy.prepareEarningsWin(body.eventId,body.at));
        case 'room-resolve':return Response.json(await economy.commitEarningsWin(body.eventId));
        case 'history-fault':await economy.fixtureFailHistory(body.enabled);return Response.json(true);
        case 'history-failures':return Response.json(await economy.fixtureHistoryFailures());
        case 'total':return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).total());
        default:return new Response('Unknown operation',{status:404});
      }
    }catch(error){return new Response(error instanceof Error?error.stack:String(error),{status:500});}
  },
};
