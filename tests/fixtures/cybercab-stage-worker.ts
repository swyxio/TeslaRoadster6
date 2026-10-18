// LOCAL TEST ONLY: exercise the production room journal and per-player queue.
import cabFixture, { GameRoom as CabGameRoom } from './cybercab-room-worker';
import { DriverProfile, GlobalChat, RoomEconomy as WalletRoomEconomy, GlobalIncome, GlobalEarningsEvent } from './luxury-wallet-worker';
import { EconomySession } from '../../worker/economy-session';
import { progressFrom, type DriverOutcome, type DriverProgress, type EconomyIntent } from '../../worker/driver-profile';
import type { CabIncomeStage } from '../../worker/room-economy';
import { addPlayer, createEmptyWorld, makeEntity } from '../../shared/game';
import { emptyCybercabFleet, purchaseCybercab, settleCybercabIntervals } from '../../shared/cybercabs';
import { initialDelivery, levelForCash } from '../../shared/delivery';
import { applyAchievementAwards, initialAchievements, type AchievementId } from '../../shared/achievements';

function settledCab(progress:DriverProgress,result:Extract<ReturnType<typeof settleCybercabIntervals>,{ok:true}>){
  const delivery=initialDelivery({x:0,z:0});
  Object.assign(delivery,{cash:result.cash,lifetimeIncome:result.eligibleIncome,level:levelForCash(result.cash)});
  const state=initialAchievements();state.unlocked=[...progress.unlocked];
  const awards=applyAchievementAwards(delivery,state,[]);
  return {progress:{...progress,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,level:delivery.level,
    unlocked:state.unlocked,cybercabs:result.fleet},awards};
}

export { DriverProfile, GlobalChat, GlobalIncome, GlobalEarningsEvent };
export class GameRoom extends CabGameRoom {
  private overloadSession:EconomySession|null=null;
  async fixtureOverload(driverId:string,fence:string,roomId:string,progress:DriverProgress,invalidHead:boolean,closedCount:number){
    const world=createEmptyWorld(),player=addPlayer(world,driverId,'Overloaded driver');
    const cab=makeEntity('fixture-cab','cybercab',0,0);
    Object.assign(cab,{owner:driverId,npc:true,autopilot:true,cab:{assetId:'cab-a'}});world.entities.push(cab);
    let closes=0,overloadApplied=false;
    const socket={send(){},close(){closes++;}} as unknown as WebSocket;
    const ledger=this.env.ECONOMIES.get(this.env.ECONOMIES.idFromName(roomId));
    const session=new EconomySession(this.env,ledger,world,player,socket,driverId,fence,roomId,1,1,progress,new Map(),new Set());
    this.overloadSession=session;
    session.observeCabs(1000);session.observeCabs(1120);session.observeCabs(1240);
    const closed=Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals'];
    for(let i=0;i<closedCount;i++)closed.push({assetId:'cab-a',startMs:i,endMs:i+1});
    for(let i=0;i<32;i++)session.update(player,()=>{
      if(invalidHead){player.delivery.cash=Number.MAX_SAFE_INTEGER;player.delivery.earned=-1;player.delivery.tickets++;}
      else player.delivery.cash--;
    });
    session.update(player,()=>{overloadApplied=true;});
    const queue=Reflect.get(session,'queue') as {intent:EconomyIntent}[];
    for(let i=0;i<500&&(Reflect.get(session,'staging') as Set<unknown>).size;i++)await new Promise(resolve=>setTimeout(resolve,1));
    const stages=await ledger.fixtureStages(driverId);
    const result={queue:queue.length,failed:Reflect.get(session,'failed') as boolean,closes,overloadApplied,
      final:stages,open:(Reflect.get(session,'cabOpen') as Map<string,unknown>).size};
    session.finish();this.ctx.waitUntil(session.freeze());
    return result;
  }
  async fixtureOverloadState(){
    const session=this.overloadSession;
    return {processing:session?Reflect.get(session,'processing') as boolean:false,
      staging:session?(Reflect.get(session,'staging') as Set<unknown>).size:0};
  }
}
export class RoomEconomy extends WalletRoomEconomy {
  private alarmCalls=0;
  private alarmActive=false;
  private loseStageReply=false;
  private holdStageReply=false;
  private stageHeld=false;
  private releaseStage:(()=>void)|undefined;
  async fixtureLoseStageReply(){this.loseStageReply=true;}
  async fixtureStages(driverId:string){return [...(await this.ctx.storage.list<CabIncomeStage>({prefix:`cab-stage:${driverId}:`})).values()].sort((a,b)=>a.sequence-b.sequence);}
  async fixtureHoldStageReply(){this.holdStageReply=true;}
  async fixtureStageState(){return {held:this.stageHeld};}
  async fixtureAlarmState(){return {calls:this.alarmCalls,active:this.alarmActive,
    recovering:[...(Reflect.get(this,'recoveries') as Map<string,unknown>).keys()]};}
  override async alarm(){this.alarmCalls++;this.alarmActive=true;try{await super.alarm();}finally{this.alarmActive=false;}}
  async fixtureReleaseStage(){this.releaseStage?.();}
  async fixtureInjectOutOfOrder(intent:EconomyIntent){
    await this.ctx.storage.transaction(async txn=>{
      await txn.put(`intent:${intent.eventId}`,{intent,outcome:null});
      await txn.put(`pending:${intent.driverId}:${intent.eventId}`,intent);
    });
  }
  async fixtureInjectPending(intent:EconomyIntent){
    await this.ctx.storage.transaction(async txn=>{
      await txn.put(`intent:${intent.eventId}`,{intent,outcome:null});
      await txn.put(`pending:${intent.driverId}:${intent.eventId}`,intent);
      await txn.setAlarm(Date.now()+1000);
    });
  }
  async fixtureInjectCleanup(intent:EconomyIntent){
    await this.ctx.storage.put(`cleanup:${intent.driverId}:${intent.eventId}`,intent);
  }
  override async stageCab(stage:CabIncomeStage){
    const result=await super.stageCab(stage);
    if(this.loseStageReply){this.loseStageReply=false;throw new Error('Injected lost stage reply');}
    if(this.holdStageReply){
      this.holdStageReply=false;this.stageHeld=true;
      try{await new Promise<void>(resolve=>{this.releaseStage=resolve;});}
      finally{this.stageHeld=false;this.releaseStage=undefined;}
    }
    return result;
  }
}

async function rejectedHeadSimulation(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Could not seed cab');
  player.delivery.cash=purchase.cash;player.delivery.lifetimeIncome=purchase.eligibleIncome;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let persisted=structuredClone(initial),releaseHead=()=>{},headStarted=()=>{};
  const head=new Promise<void>(resolve=>{releaseHead=resolve;});
  const started=new Promise<void>(resolve=>{headStarted=resolve;});
  const writes:EconomyIntent[]=[],stages:CabIncomeStage[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageCab(stage:CabIncomeStage){stages.push(structuredClone(stage));return 'accepted' as const;},
    async prepareCab(){return {room:[],global:[]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){headStarted();await head;return {ok:false,reason:'invalid'};}
      let awards:AchievementId[]=[];
      if(intent.action.kind==='cab-income'){
        const result=settleCybercabIntervals(persisted.cybercabs!,persisted.cash,persisted.eligibleIncome,intent.action.intervals,{room:[],global:[]});
        if(!result.ok)throw new Error('Cab stage could not be rebased');
        ({progress:persisted,awards}=settledCab(persisted,result));
      }else if(intent.action.kind==='progress'){
        persisted={...structuredClone(intent.action.progress),cybercabs:persisted.cybercabs};
      }else throw new Error('Dependent action was not discarded');
      return {ok:true,revision:intent.revision+1,progress:structuredClone(persisted),awards};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.update(player,()=>{player.delivery.cash-=1;});await started;
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:240});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  for(let i=0;i<100&&(Reflect.get(session,'staging') as Set<unknown>).size;i++)await new Promise(resolve=>setTimeout(resolve,1));
  session.update(player,()=>{player.delivery.cash-=7;});
  session.gameAward(player,()=>{player.delivery.cash+=100;player.delivery.lifetimeIncome+=100;player.achievements.unlocked.push('first-parking' as never);});
  session.barrier(99);
  releaseHead();
  for(let i=0;i<100&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Session failed to drain');
  const secondWorld=createEmptyWorld(),secondPlayer=addPlayer(secondWorld,'second','Driver');
  secondPlayer.delivery.cash=initial.cash;secondPlayer.delivery.lifetimeIncome=initial.eligibleIncome;
  const failedLedger={async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},async stageCab(){return 'accepted' as const;},async prepareCab(){return {room:[],global:[]};},async submit(){return {ok:false as const,reason:'invalid' as const};},
    async acknowledge(){throw new Error('Failed income must remain unacknowledged');}};
  const failed=new EconomySession({} as never,failedLedger as never,secondWorld,secondPlayer,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  (Reflect.get(failed,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:240});
  Reflect.apply(Reflect.get(failed,'flushCabIncome') as ()=>void,failed,[]);
  for(let i=0;i<100&&(Reflect.get(failed,'processing')||(Reflect.get(failed,'staging') as Set<unknown>).size);i++)await new Promise(resolve=>setTimeout(resolve,1));
  failed.finish();
  const failedDrained=await Promise.race([failed.freeze().then(()=>true),new Promise<false>(resolve=>setTimeout(()=>resolve(false),1000))]);
  return {initial,persisted,writes,stages,barrier:session.sync(),failedDrained,failedQueue:(Reflect.get(failed,'queue') as unknown[]).length};
}

// Hold an authoritative 3x cab settlement while later snapshots are drafted.
async function delayedCabSimulation(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Could not seed cab');
  player.delivery.cash=purchase.cash;player.delivery.lifetimeIncome=purchase.eligibleIncome;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let persisted=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageCab(){return 'accepted' as const;},
    async prepareCab(){return {room:[{startsAtMs:0,endsAtMs:600_000}],global:[{startsAtMs:0,endsAtMs:1_800_000}]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      let awards:AchievementId[]=[];
      if(intent.action.kind==='cab-income'){
        started();await held;
        const result=settleCybercabIntervals(persisted.cybercabs!,persisted.cash,persisted.eligibleIncome,intent.action.intervals,
          {room:[{startsAtMs:0,endsAtMs:600_000}],global:[{startsAtMs:0,endsAtMs:1_800_000}]});
        if(!result.ok)throw new Error('Cab income failed');
        ({progress:persisted,awards}=settledCab(persisted,result));
      }else if(intent.action.kind==='progress'){
        persisted={...structuredClone(intent.action.progress),cybercabs:persisted.cybercabs};
      }else throw new Error('Unexpected action');
      return {ok:true,revision:intent.revision+1,progress:structuredClone(persisted),awards};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:480});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);await began;
  session.update(player,()=>{player.delivery.cash-=7;});
  session.gameAward(player,()=>{player.delivery.cash+=100;player.delivery.lifetimeIncome+=100;player.achievements.unlocked.push('first-parking' as never);});
  session.barrier(42);release();
  for(let i=0;i<100&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Session failed to drain');
  return {initial,persisted,writes,barrier:session.sync()};
}

async function stageOrderSimulation(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Could not seed cab');
  player.delivery.cash=purchase.cash;player.delivery.lifetimeIncome=purchase.eligibleIncome;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let persisted=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const attempted:number[]=[],accepted:number[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageCab(stage:CabIncomeStage){
      attempted.push(stage.sequence);
      if(stage.sequence===1){started();await held;}
      accepted.push(stage.sequence);return 'accepted' as const;
    },
    async prepareCab(){return {room:[],global:[]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      if(intent.action.kind!=='cab-income')throw new Error('Unexpected action');
      const result=settleCybercabIntervals(persisted.cybercabs!,persisted.cash,persisted.eligibleIncome,intent.action.intervals,{room:[],global:[]});
      if(!result.ok)throw new Error('Cab stage could not settle');
      const settled=settledCab(persisted,result);persisted=settled.progress;
      return {ok:true,revision:intent.revision+1,progress:structuredClone(persisted),awards:settled.awards};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  const intervals=Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals'];
  intervals.push({assetId:'cab-a',startMs:0,endMs:240});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);await began;
  intervals.push({assetId:'cab-a',startMs:240,endMs:480});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  await new Promise(resolve=>setTimeout(resolve,25));
  const beforeRelease={attempted:[...attempted],accepted:[...accepted]};
  release();
  for(let i=0;i<100&&(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Session failed to drain');
  return {beforeRelease,attempted,accepted,persisted};
}

type Env={ECONOMIES:DurableObjectNamespace<RoomEconomy>;INCOME:DurableObjectNamespace<GlobalIncome>;ROOMS:DurableObjectNamespace<GameRoom>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path==='/__cab-stage/rejected-head')return Response.json(await rejectedHeadSimulation());
    if(path==='/__cab-stage/delayed-income')return Response.json(await delayedCabSimulation());
    if(path==='/__cab-stage/stage-order')return Response.json(await stageOrderSimulation());
    if(path==='/__cab-stage/total')return Response.json({total:await env.INCOME.get(env.INCOME.idFromName('global')).total()});
    if(path.startsWith('/__cab-stage/')){
      const body=await request.json() as {room:string;stage:CabIncomeStage;intent:EconomyIntent;driverId:string;fence:string;progress:DriverProgress;invalidHead:boolean;closedCount?:number};
      const room=env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room));
      if(path==='/__cab-stage/overload')return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(body.room)).fixtureOverload(body.driverId,body.fence,body.room,body.progress,body.invalidHead,body.closedCount??0));
      if(path==='/__cab-stage/overload-state')return Response.json(await env.ROOMS.get(env.ROOMS.idFromName(body.room)).fixtureOverloadState());
      if(path==='/__cab-stage/lose-reply'){await room.fixtureLoseStageReply();return Response.json({ok:true});}
      if(path==='/__cab-stage/hold-reply'){await room.fixtureHoldStageReply();return Response.json({ok:true});}
      if(path==='/__cab-stage/hold-state')return Response.json(await room.fixtureStageState());
      if(path==='/__cab-stage/alarm-state')return Response.json(await room.fixtureAlarmState());
      if(path==='/__cab-stage/release'){await room.fixtureReleaseStage();return Response.json({ok:true});}
      if(path==='/__cab-stage/inject-out-of-order'){await room.fixtureInjectOutOfOrder(body.intent);return Response.json({ok:true});}
      if(path==='/__cab-stage/inject-pending'){await room.fixtureInjectPending(body.intent);return Response.json({ok:true});}
      if(path==='/__cab-stage/inject-cleanup'){await room.fixtureInjectCleanup(body.intent);return Response.json({ok:true});}
      if(path==='/__cab-stage/stage'){
        try{return Response.json(await room.stageCab(body.stage));}catch{return Response.json({threw:true});}
      }
    }
    return cabFixture.fetch(request,env as never,ctx);
  },
};
