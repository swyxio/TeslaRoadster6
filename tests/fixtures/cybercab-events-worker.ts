// LOCAL TEST ONLY: fault injection around the production economy authorities.
import { GameRoom as BaseRoom } from '../../worker/index';
import { DriverProfile as BaseProfile, GlobalIncome as BaseIncome, progressFrom, type DriverProgress, type EconomyIntent } from '../../worker/driver-profile';
import { RoomEconomy as BaseEconomy, type CabIncomeStage } from '../../worker/room-economy';
import { GlobalEarningsEvent as BaseGlobalEvents } from '../../worker/global-earnings-event';
import { EconomySession } from '../../worker/economy-session';
import { addPlayer, createEmptyWorld, makeEntity, type Player, type World } from '../../shared/game';
import { newPolice, updatePolice } from '../../shared/police';
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
  private fixtureSession:EconomySession|null=null;
  private fixtureWorld:World|null=null;
  private fixturePlayer:Player|null=null;
  fixtureProducer(active:boolean){this.producer=active;}
  fixturePersistentProducer(active:boolean){return this.ctx.storage.put('fixture-producer',active);}
  override async hasWallet(driverId:string,fence:string){return this.producer || !!await this.ctx.storage.get('fixture-producer') || super.hasWallet(driverId,fence);}
  fixtureStartSession(driverId:string,fence:string,room:string,progress:DriverProgress,start:number,revision=1,sequence=1){
    const world=createEmptyWorld(),player=addPlayer(world,driverId,'Driver');player.delivery.activeUntil=100;
    player.delivery.flight={seconds:8,peakHeight:20,lastAirborneAt:0};
    const cab=makeEntity('fixture-cab','cybercab',0,0);
    Object.assign(cab,{owner:driverId,npc:true,autopilot:true,cab:{assetId:'cab-a'}});world.entities.push(cab);
    const economy=this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(room));
    this.fixtureSession=new EconomySession(this.env,economy,world,player,{send(){},close(){}} as unknown as WebSocket,
      driverId,fence,room,revision,sequence,progress,new Map(),new Set());
    this.fixtureWorld=world;this.fixturePlayer=player;
    this.fixtureSession.observeCabs(start);
  }
  fixtureSessionTicks(start:number,count:number){
    if(!this.fixtureSession)throw new Error('Missing fixture session');
    for(let i=1;i<=count;i++)this.fixtureSession.observeCabs(start+i*100);
  }
  fixtureRejectHead(){
    if(!this.fixtureSession||!this.fixturePlayer)throw new Error('Missing fixture session');
    const player=this.fixturePlayer;
    this.fixtureSession.update(player,()=>{player.delivery.cash-=1_000;player.delivery.earned=-1;});
  }
  fixtureTicket(){
    if(!this.fixtureSession||!this.fixturePlayer||!this.fixtureWorld)throw new Error('Missing fixture session');
    const world=this.fixtureWorld,player=this.fixturePlayer,session=this.fixtureSession;
    const car=world.entities.find(entity=>entity.id===player.entityId)!;
    const cop=makeEntity('fixture-police','model-3',0,0);cop.police=newPolice();cop.police.targetId=player.id;cop.police.lastSeen=world.time;world.entities.push(cop);
    Object.assign(car,{x:0,z:6,y:0,speed:0,vy:0,supportId:'ground'});
    updatePolice(world,.05,(p,apply,evidence)=>session.update(p,apply,null,evidence));
    const stopped=cop.police.targetId===null;world.entities=world.entities.filter(entity=>entity!==cop);
    return {stopped};
  }
}
export class RoomEconomy extends BaseEconomy {
  private holdStage=false;
  private stageHeld=false;
  private releaseStage:(()=>void)|undefined;
  private holdTicket=false;
  private ticketHeld=false;
  private holdPrepare=false;
  private prepareHeld=false;
  async fixtureKeys(){return [...(await this.ctx.storage.list()).keys()];}
  async fixtureRecord(eventId:string){return this.ctx.storage.get(`intent:${eventId}`);}
  fixtureHoldStage(){this.holdStage=true;}
  fixtureStageHeld(){return this.stageHeld;}
  fixtureReleaseStage(){this.releaseStage?.();}
  fixtureHoldTicket(){this.holdTicket=true;}
  fixtureTicketHeld(){return this.ticketHeld;}
  fixtureHoldPrepare(){this.holdPrepare=true;}
  fixturePrepareHeld(){return this.prepareHeld;}
  override async stageCab(stage:CabIncomeStage){
    const result=await super.stageCab(stage);
    if(this.holdStage){
      this.holdStage=false;this.stageHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseStage=resolve;});}finally{this.stageHeld=false;}
    }
    return result;
  }
  override async stageTicket(stage:Parameters<BaseEconomy['stageTicket']>[0]){
    const result=await super.stageTicket(stage);
    if(this.holdTicket){this.holdTicket=false;this.ticketHeld=true;await new Promise<void>(()=>{});}
    return result;
  }
  override async prepareCab(stage:CabIncomeStage){
    const result=await super.prepareCab(stage);
    if(this.holdPrepare){this.holdPrepare=false;this.prepareHeld=true;await new Promise<void>(()=>{});}
    return result;
  }
}
export class DriverProfile extends BaseProfile {
  private holdNext=false;
  private held=false;
  private holdFence=false;
  private fenceSkips=0;
  private fenceHeld=false;
  private releaseFence:(()=>void)|undefined;
  private holdHead=false;
  private headHeld=false;
  fixtureArm(){this.holdNext=true;}
  fixtureHeld(){return this.held;}
  fixtureInspect(){return this.ctx.storage.get('driver');}
  fixtureHoldFence(skip=0){this.fenceSkips=skip;this.holdFence=true;}
  fixtureFenceHeld(){return this.fenceHeld;}
  fixtureReleaseFence(){this.releaseFence?.();}
  fixtureHoldHead(){this.holdHead=true;}
  fixtureHeadHeld(){return this.headHeld;}
  override async checkFence(fence:string){
    const result=await super.checkFence(fence);
    if(this.holdFence&&this.fenceSkips>0)this.fenceSkips--;
    else if(this.holdFence){
      this.holdFence=false;this.fenceHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseFence=resolve;});}finally{this.fenceHeld=false;}
    }
    return result;
  }
  override async commit(intent:EconomyIntent,events?:EarningsEvents){
    if(this.holdHead){this.holdHead=false;this.headHeld=true;await new Promise<void>(()=>{});}
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
        case 'start-session':await room.fixtureStartSession(body.driverId,body.fence,body.room,body.progress,body.start,body.revision,body.sequence);return Response.json({ok:true});
        case 'session-ticks':await room.fixtureSessionTicks(body.start,body.count);return Response.json({ok:true});
        case 'reject-head':await room.fixtureRejectHead();return Response.json({ok:true});
        case 'ticket':return Response.json(await room.fixtureTicket());
        case 'persistent-producer':await room.fixturePersistentProducer(body.active);return Response.json({ok:true});
        case 'acquire':{
          const initial=progressFrom(initialDelivery({x:0,z:0}),[],{},[],0,0);
          initial.cash=35_000;initial.level=levelForCash(initial.cash);
          return Response.json(await driver.acquire(body.driverId,body.fence,initial,body.room));
        }
        case 'buy':return Response.json(await driver.commit(body.intent));
        case 'stage':return Response.json(await economy.stageCab(body.stage));
        case 'stage-ticket':return Response.json(await economy.stageTicket(body.stage));
        case 'acknowledge':return Response.json(await economy.acknowledge(body.intent));
        case 'hold-stage':await economy.fixtureHoldStage();return Response.json({ok:true});
        case 'hold-ticket':await economy.fixtureHoldTicket();return Response.json({ok:true});
        case 'ticket-held':return Response.json(await economy.fixtureTicketHeld());
        case 'hold-prepare':await economy.fixtureHoldPrepare();return Response.json({ok:true});
        case 'prepare-held':return Response.json(await economy.fixturePrepareHeld());
        case 'stage-held':return Response.json(await economy.fixtureStageHeld());
        case 'release-stage':await economy.fixtureReleaseStage();return Response.json({ok:true});
        case 'freeze':await economy.freeze(body.driverId,body.fence);return Response.json({ok:true});
        case 'submit':return Response.json(await economy.submit(body.intent));
        case 'keys':return Response.json(await economy.fixtureKeys());
        case 'record':return Response.json(await economy.fixtureRecord(body.eventId)??null);
        case 'arm':await driver.fixtureArm();return Response.json({ok:true});
        case 'held':return Response.json(await driver.fixtureHeld());
        case 'hold-fence':await driver.fixtureHoldFence(body.skip??0);return Response.json({ok:true});
        case 'hold-head':await driver.fixtureHoldHead();return Response.json({ok:true});
        case 'head-held':return Response.json(await driver.fixtureHeadHeld());
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
