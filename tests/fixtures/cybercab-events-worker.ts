// LOCAL TEST ONLY: fault injection around the production economy authorities.
import { GameRoom as BaseRoom } from '../../worker/index';
import { DriverProfile as BaseProfile, GlobalIncome as BaseIncome, progressFrom, type EconomyIntent } from '../../worker/driver-profile';
import { RoomEconomy as BaseEconomy, type CabIncomeStage } from '../../worker/room-economy';
import { GlobalEarningsEvent as BaseGlobalEvents } from '../../worker/global-earnings-event';
import { initialDelivery, levelForCash } from '../../shared/delivery';
import { GLOBAL_EVENT_DURATION_MS, type EarningsEvents } from '../../shared/earnings-events';

export class GlobalIncome extends BaseIncome {
  private blocked=false;
  private failures=0;
  fixtureBlock(blocked:boolean){this.blocked=blocked;}
  fixtureFailures(){return this.failures;}
  override async credit(driverId:string,cumulative:number){
    if(this.blocked){this.failures++;throw new Error('Injected income outbox failure');}
    return super.credit(driverId,cumulative);
  }
}
export class GameRoom extends BaseRoom {
  private producer=false;
  fixtureProducer(active:boolean){this.producer=active;}
  fixturePersistentProducer(active:boolean){return this.ctx.storage.put('fixture-producer',active);}
  override async hasWallet(driverId:string,fence:string){return this.producer || !!await this.ctx.storage.get('fixture-producer') || super.hasWallet(driverId,fence);}
}
export class RoomEconomy extends BaseEconomy {
  private holdStage=false;
  private stageHeld=false;
  private releaseStage:(()=>void)|undefined;
  async fixtureKeys(){return [...(await this.ctx.storage.list()).keys()];}
  async fixtureRecord(eventId:string){return this.ctx.storage.get(`intent:${eventId}`);}
  fixtureHoldStage(){this.holdStage=true;}
  fixtureStageHeld(){return this.stageHeld;}
  fixtureReleaseStage(){this.releaseStage?.();}
  override async stageCab(stage:CabIncomeStage){
    const result=await super.stageCab(stage);
    if(this.holdStage){
      this.holdStage=false;this.stageHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseStage=resolve;});}finally{this.stageHeld=false;}
    }
    return result;
  }
}
export class DriverProfile extends BaseProfile {
  private holdNext=false;
  private held=false;
  private holdFence=false;
  private fenceHeld=false;
  private releaseFence:(()=>void)|undefined;
  fixtureArm(){this.holdNext=true;}
  fixtureHeld(){return this.held;}
  fixtureInspect(){return this.ctx.storage.get('driver');}
  fixtureHoldFence(){this.holdFence=true;}
  fixtureFenceHeld(){return this.fenceHeld;}
  fixtureReleaseFence(){this.releaseFence?.();}
  override async checkFence(fence:string){
    const result=await super.checkFence(fence);
    if(this.holdFence){
      this.holdFence=false;this.fenceHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseFence=resolve;});}finally{this.fenceHeld=false;}
    }
    return result;
  }
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    const result=await super.commit(intent,events);
    if(intent.action.kind==='cab-income'&&this.holdNext){
      this.holdNext=false;this.held=true;
      await new Promise<void>(()=>{}); // process termination loses the response
    }
    return result;
  }
}
export class GlobalEarningsEvent extends BaseGlobalEvents {
  private failSecond=false;
  private calls=0;
  private failures=0;
  fixtureSeed(at:number,count:number){
    for(let i=0;i<count;i++)this.ctx.storage.sql.exec('INSERT INTO global_events (request_id,starts_at,ends_at) VALUES (?,?,?)',
      `fixture-${i}`,at+i*GLOBAL_EVENT_DURATION_MS,at+(i+1)*GLOBAL_EVENT_DURATION_MS);
  }
  fixtureFailSecond(value:boolean){this.failSecond=value;}
  fixtureStats(){return {calls:this.calls,failures:this.failures};}
  override history(from:number,to:number,cursor?:number){
    this.calls++;
    if(cursor!==undefined&&this.failSecond){this.failures++;throw new Error('Injected second global history page failure');}
    return super.history(from,to,cursor);
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
    const global=env.GLOBAL_EVENTS.get(env.GLOBAL_EVENTS.idFromName('global'));
    try{
      switch(body.op){
        case 'seed-global':await global.fixtureSeed(body.at,body.count);return Response.json({ok:true});
        case 'global-fault':await global.fixtureFailSecond(body.enabled);return Response.json({ok:true});
        case 'global-stats':return Response.json(await global.fixtureStats());
        case 'room-win':return Response.json(await economy.recordEarningsWinWithoutPayout('fixture-win',body.at));
        case 'producer':await room.fixtureProducer(body.active);return Response.json({ok:true});
        case 'persistent-producer':await room.fixturePersistentProducer(body.active);return Response.json({ok:true});
        case 'acquire':{
          const initial=progressFrom(initialDelivery({x:0,z:0}),[],{},[],0,0);
          initial.cash=35_000;initial.level=levelForCash(initial.cash);
          return Response.json(await driver.acquire(body.driverId,body.fence,initial,body.room));
        }
        case 'buy':return Response.json(await driver.commit(body.intent));
        case 'stage':return Response.json(await economy.stageCab(body.stage));
        case 'hold-stage':await economy.fixtureHoldStage();return Response.json({ok:true});
        case 'stage-held':return Response.json(await economy.fixtureStageHeld());
        case 'release-stage':await economy.fixtureReleaseStage();return Response.json({ok:true});
        case 'freeze':await economy.freeze(body.driverId,body.fence);return Response.json({ok:true});
        case 'submit':return Response.json(await economy.submit(body.intent));
        case 'keys':return Response.json(await economy.fixtureKeys());
        case 'record':return Response.json(await economy.fixtureRecord(body.eventId)??null);
        case 'arm':await driver.fixtureArm();return Response.json({ok:true});
        case 'held':return Response.json(await driver.fixtureHeld());
        case 'hold-fence':await driver.fixtureHoldFence();return Response.json({ok:true});
        case 'fence-held':return Response.json(await driver.fixtureFenceHeld());
        case 'release-fence':await driver.fixtureReleaseFence();return Response.json({ok:true});
        case 'profile':return Response.json(await driver.fixtureInspect()??null);
        case 'total':return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).total());
        case 'income-block':await env.INCOME.get(env.INCOME.idFromName('global')).fixtureBlock(body.blocked);return Response.json({ok:true});
        case 'income-failures':return Response.json(await env.INCOME.get(env.INCOME.idFromName('global')).fixtureFailures());
        default:return new Response('Unknown operation',{status:404});
      }
    }catch(error){return new Response(error instanceof Error?error.stack:String(error),{status:500});}
  },
};
