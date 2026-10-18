// LOCAL TEST ONLY: exercise the production room journal and per-player queue.
import cabFixture, { GameRoom } from './cybercab-room-worker';
import { DriverProfile, GlobalChat, RoomEconomy as WalletRoomEconomy, GlobalIncome } from './luxury-wallet-worker';
import { EconomySession } from '../../worker/economy-session';
import { progressFrom, type DriverOutcome, type EconomyIntent } from '../../worker/driver-profile';
import type { CabIncomeStage } from '../../worker/room-economy';
import { addPlayer, createEmptyWorld } from '../../shared/game';
import { emptyCybercabFleet, purchaseCybercab, settleCybercabIntervals } from '../../shared/cybercabs';

export { GameRoom, DriverProfile, GlobalChat, GlobalIncome };
export class RoomEconomy extends WalletRoomEconomy {
  private alarmCalls=0;
  private alarmActive=false;
  private loseStageReply=false;
  private holdStageReply=false;
  private stageHeld=false;
  private releaseStage:(()=>void)|undefined;
  async fixtureLoseStageReply(){this.loseStageReply=true;}
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
    async stageCab(stage:CabIncomeStage){stages.push(structuredClone(stage));return 'accepted' as const;},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){headStarted();await head;return {ok:false,reason:'invalid'};}
      if(intent.action.kind!=='cab-income')throw new Error('Dependent progress was not discarded');
      const result=settleCybercabIntervals(persisted.cybercabs!,persisted.cash,persisted.eligibleIncome,intent.action.intervals);
      if(!result.ok)throw new Error('Cab stage could not be rebased');
      persisted={...persisted,cash:result.cash,eligibleIncome:result.eligibleIncome,cybercabs:result.fleet};
      return {ok:true,revision:intent.revision+1,progress:structuredClone(persisted),awards:[]};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.update(player,()=>{player.delivery.cash-=1;});await started;
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:240,multiplier:1});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  session.update(player,()=>{player.delivery.cash-=7;});session.barrier(99);
  releaseHead();
  for(let i=0;i<100&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Session failed to drain');
  const secondWorld=createEmptyWorld(),secondPlayer=addPlayer(secondWorld,'second','Driver');
  secondPlayer.delivery.cash=initial.cash;secondPlayer.delivery.lifetimeIncome=initial.eligibleIncome;
  const failedLedger={async stageCab(){return 'accepted' as const;},async submit(){return {ok:false as const,reason:'invalid' as const};},
    async acknowledge(){throw new Error('Failed income must remain unacknowledged');}};
  const failed=new EconomySession({} as never,failedLedger as never,secondWorld,secondPlayer,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  (Reflect.get(failed,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:240,multiplier:1});
  Reflect.apply(Reflect.get(failed,'flushCabIncome') as ()=>void,failed,[]);
  for(let i=0;i<100&&Reflect.get(failed,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  failed.finish();
  const failedDrained=await Promise.race([failed.freeze().then(()=>true),new Promise<false>(resolve=>setTimeout(()=>resolve(false),1000))]);
  return {initial,persisted,writes,stages,barrier:session.sync(),failedDrained,failedQueue:(Reflect.get(failed,'queue') as unknown[]).length};
}

type Env={ECONOMIES:DurableObjectNamespace<RoomEconomy>;INCOME:DurableObjectNamespace<GlobalIncome>};
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path==='/__cab-stage/rejected-head')return Response.json(await rejectedHeadSimulation());
    if(path==='/__cab-stage/total')return Response.json({total:await env.INCOME.get(env.INCOME.idFromName('global')).total()});
    if(path.startsWith('/__cab-stage/')){
      const body=await request.json() as {room:string;stage:CabIncomeStage;intent:EconomyIntent};
      const room=env.ECONOMIES.get(env.ECONOMIES.idFromName(body.room));
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
