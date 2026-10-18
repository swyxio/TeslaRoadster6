// LOCAL TEST ONLY: delayed cab credit and an order-sensitive spend.
import { EconomySession } from '../../worker/economy-session';
import { progressFrom, type DriverOutcome, type EconomyIntent } from '../../worker/driver-profile';
import { createEmptyWorld, addPlayer, chooseVehicle, makeEntity, step } from '../../shared/game';
import { advanceDeliverySearch, applyDeliveryStop, CUSTOMERS, initialDelivery, levelForCash, orderTarget, rerouteInaccessibleOrder } from '../../shared/delivery';
import { applyAchievementAwards, initialAchievements, updateAchievements, type AchievementId } from '../../shared/achievements';
import { normalizeAchievementTiers } from '../../shared/achievement-tiers';
import type { AchievementEvidence } from '../../shared/achievement-evidence';
import { applyAcceptedDelivery, applyObservedAchievement } from '../../worker/achievement-progress';
import { applyTicketEvidence, ticketRoofAccess, newPolice, updatePolice } from '../../shared/police';
import { BUILDINGS, terrainHeight } from '../../shared/map';
import { emptyCybercabFleet, paintCybercab, purchaseCybercab, settleCybercabIntervals } from '../../shared/cybercabs';
import { LUXURY_SHOWROOM, luxuryPurchaseAwards, luxuryVehicle } from '../../shared/luxury';
import type { CabIncomeStage } from '../../worker/room-economy';
import type { DriverProgress } from '../../worker/driver-profile';


// Mimic the profile's atomic assignment receipt after each bounded search.
function receipt(progress:DriverProgress,intent:EconomyIntent,awards:AchievementId[]):Extract<DriverOutcome,{ok:true}>{
  let assignment:Extract<DriverOutcome,{ok:true}>['assignment'];
  if(progress.order.search){
    const delivery=initialDelivery(progress.order.search.origin);
    Object.assign(delivery,{level:levelForCash(progress.cash),completed:progress.completed,order:structuredClone(progress.order)});
    for(let i=0;i<10_000&&delivery.order.search;i++)advanceDeliverySearch(delivery,delivery.order.search.roofEligible);
    if(delivery.order.search)throw new Error('Fixture assignment did not finish');
    progress.order=delivery.order;
    if(delivery.lastReroute){const {reason,origin,level}=delivery.lastReroute;assignment={reason,origin,level};}
  }
  return {ok:true,revision:intent.revision+1,progress:structuredClone(progress),awards,...(assignment?{assignment}:{})};
}

function settledCab(progress:DriverProgress,result:Extract<ReturnType<typeof settleCybercabIntervals>,{ok:true}>){
  const delivery=initialDelivery({x:0,z:0});
  Object.assign(delivery,{cash:result.cash,lifetimeIncome:result.eligibleIncome,level:levelForCash(result.cash)});
  const state=initialAchievements();state.unlocked=[...progress.unlocked];
  const awards=applyAchievementAwards(delivery,state,[]);
  return {progress:{...progress,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,level:delivery.level,
    unlocked:state.unlocked,cybercabs:result.fleet},awards};
}

function advanceClock(progress:DriverProgress,intent:EconomyIntent):DriverProgress {
  if(intent.clock===undefined)return progress;
  const elapsed=intent.clock-(progress.deliveryClock??0);
  if(elapsed<0)throw new Error('Fixture clock moved backwards');
  return {...progress,deliveryClock:intent.clock,order:{...progress.order,elapsed:progress.order.elapsed+elapsed}};
}

function settledPhysical(progress:DriverProgress,action:Extract<EconomyIntent['action'],{kind:'delivery'|'achievement'}>){
  const delivery=initialDelivery(action.kind==='delivery'?action.stop:{x:0,z:0});
  Object.assign(delivery,{cash:progress.cash,lifetimeIncome:progress.eligibleIncome,earned:progress.earned,
    completed:progress.completed,level:levelForCash(progress.cash),order:{...progress.order},tickets:progress.tickets});
  const state=initialAchievements();state.unlocked=[...progress.unlocked];
  let awards:AchievementId[]=[],tiers=normalizeAchievementTiers(progress.achievementTiers,progress.completed,progress.unlocked);
  if(action.kind==='delivery'){
    if(action.multiplier===null)throw new Error('Fixture requires a known delivery rate');
    const before={...delivery.order},dropoff=before.stage==='dropoff',customer=CUSTOMERS[before.customer]?.id;
    const rooftop=dropoff&&orderTarget(before).rooftop;
    const parts=applyDeliveryStop(delivery,action.stop,component=>Math.round(component.amount*action.multiplier!));
    if(parts){const result=applyAcceptedDelivery(delivery,state,tiers,before,rooftop,dropoff?customer:undefined,true);awards=result.awards;tiers=result.progress;}
  }else {const result=applyObservedAchievement(delivery,state,tiers,action.evidence);awards=result.awards;tiers=result.progress;}
  return {progress:{...progress,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,earned:delivery.earned,
    completed:delivery.completed,level:delivery.level,order:delivery.order,unlocked:state.unlocked,achievementTiers:tiers},awards};
}

function ticketProgress(saved:DriverProgress,action:Extract<EconomyIntent['action'],{kind:'ticket'}>):DriverProgress{
  const delivery=initialDelivery(action.evidence);
  Object.assign(delivery,{cash:saved.cash,level:levelForCash(saved.cash),tickets:saved.tickets,completed:saved.completed,order:{...saved.order}});
  const previous=delivery.level;applyTicketEvidence(delivery,action.evidence);
  if(delivery.level<previous)rerouteInaccessibleOrder(delivery,action.evidence,ticketRoofAccess(action.evidence));
  return {...saved,cash:delivery.cash,tickets:delivery.tickets,level:delivery.level,order:delivery.order};
}

async function scenario(mode:'history'|'profile'='profile'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchased=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchased.ok)throw new Error('Fixture purchase failed');
  player.delivery.cash=26_000;player.delivery.lifetimeIncome=purchased.eligibleIncome;
  player.delivery.level=levelForCash(player.delivery.cash);
  const oakland=CUSTOMERS.findIndex(customer=>customer.id==='oak');
  if(oakland<0)throw new Error('Oakland customer missing');
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:oakland,base:9_000,elapsed:10};
  const initial=progressFrom(player.delivery,[],{},[],0,purchased.eligibleIncome);initial.cybercabs=purchased.fleet;
  const original=structuredClone(initial.order);
  let persisted=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[],messages:unknown[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageCab(){return 'accepted' as const;},
    async prepareCab(){if(mode==='history'){started();await held;}return {room:[],global:[]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      let awards:AchievementId[]=[];
      if(intent.action.kind==='cab-income'){
        if(mode==='profile'){started();await held;}
        const result=settleCybercabIntervals(persisted.cybercabs!,persisted.cash,persisted.eligibleIncome,intent.action.intervals,{room:[],global:[]});
        if(!result.ok)throw new Error('Fixture settlement failed');
        ({progress:persisted,awards}=settledCab(persisted,result));
      }else if(intent.action.kind==='contribute'){
        persisted={...persisted,cash:persisted.cash-intent.action.amount,
          order:intent.action.order?structuredClone(intent.action.order):persisted.order};
      }else throw new Error(`Unexpected action: ${intent.action.kind}`);
      persisted.level=levelForCash(persisted.cash);
      return receipt(persisted,intent,awards);
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(value:string){messages.push(JSON.parse(value));},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:4_800_000});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);await began;
  session.contributeMars(20_000,1);
  release();
  for(let i=0;i<1000&&(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size)throw new Error('Fixture queue failed to drain');
  return {original,persisted,writes,messages};
}
/** Observe real one-shot game events while history or the cab profile is held. */
async function transient(mode:'history'|'profile'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Fixture purchase failed');
  player.delivery.cash=26_000;player.delivery.level=levelForCash(26_000);player.delivery.lifetimeIncome=purchase.eligibleIncome;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:0,base:3_000,elapsed:1};
  player.delivery.flight={seconds:8,peakHeight:20,lastAirborneAt:0};
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const stages:number[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageDelivery(){return 'accepted' as const;},async stageAchievement(){return 'accepted' as const;},
    async stageCab(stage:CabIncomeStage){stages.push(stage.sequence);return 'accepted' as const;},
    async prepareCab(){if(mode==='history'){started();await held;}return {room:[],global:[]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      let awards:AchievementId[]=[];
      saved=advanceClock(saved,intent);
      if(intent.action.kind==='cab-income'){
        if(mode==='profile'){started();await held;}
        const result=settleCybercabIntervals(saved.cybercabs!,saved.cash,saved.eligibleIncome,intent.action.intervals,{room:[],global:[]});
        if(!result.ok)throw new Error('Fixture settlement failed');
        ({progress:saved,awards}=settledCab(saved,result));
      }else if(intent.action.kind==='progress')saved={...structuredClone(intent.action.progress),cybercabs:saved.cybercabs};
      else if(intent.action.kind==='ticket')saved=ticketProgress(saved,intent.action);
      else if(intent.action.kind==='delivery'||intent.action.kind==='achievement')({progress:saved,awards}=settledPhysical(saved,intent.action));
      else throw new Error('Unexpected action');
      saved.level=levelForCash(saved.cash);
      return receipt(saved,intent,awards);
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:0,endMs:240});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);await began;
  (Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals']).push({assetId:'cab-a',startMs:240,endMs:480});
  Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  for(let i=0;i<100&&stages.length<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(stages.join(',')!=='1,2')throw new Error('Later stage was not persisted while earlier work was held');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const cop=makeEntity('police','model-3',0,0);cop.police=newPolice();cop.police.targetId=player.id;cop.police.lastSeen=world.time;world.entities.push(cop);
  Object.assign(car,{x:0,z:6,y:0,speed:0,vy:0,supportId:'ground'});
  updatePolice(world,.05,(p,apply,evidence)=>session.update(p,apply,null,evidence));
  if(cop.police.targetId!==null)throw new Error('Ticket did not physically reset pursuit');
  world.entities=world.entities.filter(entity=>entity!==cop);
  const target=CUSTOMERS[0];Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z)??0,speed:0,vy:0,supportId:'ground'});
  const hooks=session.hooks();
  step(world,new Map(),.05,{economy:{...hooks,update:(p,apply)=>session.update(p,apply,{atMs:1,multiplier:1}),resolveDeliveryPayout:(_p,component)=>component.amount}});
  const roof=BUILDINGS[0];Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,supportId:'roof:0'});
  // Produce the same supported departure, flight and contact evidence as the room.
  const observeRoof=(dt:number)=>{const evidence:AchievementEvidence[]=[];
    session.update(player,()=>updateAchievements(player,car,false,undefined,false,evidence,true,dt));
    for(const fact of evidence)session.achievement(player,fact);
  };
  observeRoof(0);Object.assign(car,{y:roof.h+3,supportId:null});observeRoof(.4);
  Object.assign(car,{y:roof.h,supportId:'roof:0'});observeRoof(0);
  Object.assign(car,{x:0,z:0,y:0,supportId:'ground'}); // the landing is transient
  release();
  for(let i=0;i<2000&&(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size)throw new Error('Transient scenario did not drain');
  return {saved,stages};
}
async function rejected(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Fixture purchase failed');
  player.delivery.cash=26_000;player.delivery.level=levelForCash(26_000);player.delivery.lifetimeIncome=purchase.eligibleIncome;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={
    async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},
    async stageCab(){return 'accepted' as const;},async prepareCab(){return {room:[],global:[]};},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){started();await held;return {ok:false,reason:'invalid'};}
      let awards:AchievementId[]=[];
      if(intent.action.kind==='cab-income'){
        const result=settleCybercabIntervals(saved.cybercabs!,saved.cash,saved.eligibleIncome,intent.action.intervals,{room:[],global:[]});
        if(!result.ok)throw new Error('Failed to re-project staged income');
        ({progress:saved,awards}=settledCab(saved,result));
      }else if(intent.action.kind==='progress')saved={...structuredClone(intent.action.progress),cybercabs:saved.cybercabs};
      else throw new Error('Rejected speculative spending was resurrected');
      saved.level=levelForCash(saved.cash);
      return receipt(saved,intent,awards);
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.update(player,()=>{player.delivery.cash-=1_000;});await began;
  const intervals=Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals'];
  intervals.push({assetId:'cab-a',startMs:0,endMs:240});Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  for(let i=0;i<100&&(Reflect.get(session,'staging') as Set<unknown>).size;i++)await new Promise(resolve=>setTimeout(resolve,1));
  session.gameAward(player,()=>{player.delivery.cash+=100;player.delivery.lifetimeIncome+=100;player.achievements.unlocked.push('park-it');});
  intervals.push({assetId:'cab-a',startMs:240,endMs:480});Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  for(let i=0;i<100&&(Reflect.get(session,'staging') as Set<unknown>).size;i++)await new Promise(resolve=>setTimeout(resolve,1));
  session.contributeMars(20_000,1);session.barrier(77);release();
  for(let i=0;i<1000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Rejected scenario did not drain');
  return {saved,writes,barrier:session.sync()};
}
/** Expose the existing one-shot loss when an earlier wallet draft is rejected. */
async function rejectedTransient(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  player.delivery.cash=26_000;player.delivery.level=levelForCash(26_000);
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:0,base:3_000,elapsed:1};
  player.delivery.flight={seconds:8,peakHeight:20,lastAirborneAt:0};
  const initial=progressFrom(player.delivery,[],{},[],0,0);
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={async stageTicket(){return 'accepted' as const;},async stageDelivery(){return 'accepted' as const;},
    async stageAchievement(){return 'accepted' as const;},async submit(intent:EconomyIntent):Promise<DriverOutcome>{
    writes.push(structuredClone(intent));
    if(writes.length===1){started();await held;return {ok:false,reason:'invalid'};}
    let awards:AchievementId[]=[];saved=advanceClock(saved,intent);
    if(intent.action.kind==='ticket')saved=ticketProgress(saved,intent.action);
    else if(intent.action.kind==='progress')saved=structuredClone(intent.action.progress);
    else if(intent.action.kind==='delivery'||intent.action.kind==='achievement')({progress:saved,awards}=settledPhysical(saved,intent.action));
    else throw new Error('Speculative spending was replayed');
    return receipt(saved,intent,awards);
  },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.update(player,()=>{player.delivery.cash-=1_000;});await began;
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const cop=makeEntity('police','model-3',0,0);cop.police=newPolice();cop.police.targetId=player.id;cop.police.lastSeen=world.time;world.entities.push(cop);
  Object.assign(car,{x:0,z:6,y:0,speed:0,vy:0,supportId:'ground'});
  updatePolice(world,.05,(p,apply,evidence)=>session.update(p,apply,null,evidence));
  const patrolReset=cop.police.targetId===null;world.entities=world.entities.filter(entity=>entity!==cop);
  const target=CUSTOMERS[0];Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z)??0,speed:0,vy:0,supportId:'ground'});
  const hooks=session.hooks();
  step(world,new Map(),.05,{economy:{...hooks,update:(p,apply)=>session.update(p,apply,{atMs:1,multiplier:1}),resolveDeliveryPayout:(_p,component)=>component.amount}});
  const roof=BUILDINGS[0];Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,supportId:'roof:0'});
  session.update(player,()=>updateAchievements(player,car,false));
  Object.assign(car,{x:0,z:0,y:0,supportId:'ground'});
  const draft=structuredClone(Reflect.get(session,'draft') as {delivery:{tickets:number;completed:number};achievements:{unlocked:string[]}});
  session.contributeMars(20_000,1);release();
  for(let i=0;i<1000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Rejected transient scenario did not drain');
  return {saved,writes,draft,patrolReset};
}
async function backpressure(hold:'history'|'fence'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Fixture purchase failed');
  player.delivery.cash=purchase.cash;player.delivery.lifetimeIncome=purchase.eligibleIncome;player.delivery.activeUntil=100;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let release=()=>{},closes=0;const held=new Promise<void>(resolve=>{release=resolve;});
  const stages:CabIncomeStage[]=[];
  const attempted:number[]=[];
  const ledger={async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},async stageCab(stage:CabIncomeStage){attempted.push(stage.sequence);if(hold==='fence')await held;stages.push(structuredClone(stage));return 'accepted' as const;},
    async prepareCab(){if(hold==='history')await held;return {room:[],global:[]};},async submit(){throw new Error('A stopped session must not project new income');},
    async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){closes++;throw new Error('Injected close failure');}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  const cab=makeEntity('cab','cybercab',0,0);Object.assign(cab,{owner:player.id,cab:{assetId:'cab-a'},npc:true,autopilot:true});world.entities.push(cab);
  session.observeCabs(1_000);session.observeCabs(1_100);
  const intervals=Reflect.get(session,'cabIntervals') as CabIncomeStage['intervals'];
  for(let i=0;i<8;i++){
    intervals.push({assetId:'cab-a',startMs:i*20,endMs:(i+1)*20});
    Reflect.apply(Reflect.get(session,'flushCabIncome') as ()=>void,session,[]);
  }
  for(let i=1;i<=40;i++)session.observeCabs(1_100+i*100);
  for(let i=0;i<1000&&attempted.length<(hold==='history'?8:1);i++)await new Promise(resolve=>setTimeout(resolve,1));
  const beforeRelease={attempted:[...attempted],accepted:stages.length};
  const failed=Reflect.get(session,'failed') as boolean,open=(Reflect.get(session,'cabOpen') as Map<string,unknown>).size;
  release();
  for(let i=0;i<1000&&(Reflect.get(session,'staging') as Set<unknown>).size;i++)await new Promise(resolve=>setTimeout(resolve,1));
  return {closes,failed,open,stages,beforeRelease};
}
async function cadence(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Fixture purchase failed');
  player.delivery.activeUntil=100;
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  const stages:CabIncomeStage[]=[];let saved=structuredClone(initial);
  const ledger={async assignCab(){return 'accepted' as const;},async stageTicket(){return 'accepted' as const;},async stageCab(stage:CabIncomeStage){stages.push(structuredClone(stage));return 'accepted' as const;},
    async prepareCab(){return {room:[],global:[]};},async submit(intent:EconomyIntent){
      if(intent.action.kind!=='cab-income')throw new Error('Unexpected action');
      const result=settleCybercabIntervals(saved.cybercabs!,saved.cash,saved.eligibleIncome,intent.action.intervals,{room:[],global:[]});
      if(!result.ok)throw new Error('Fixture settlement failed');
      const settled=settledCab(saved,result);saved=settled.progress;
      return receipt(saved,intent,settled.awards);
    },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  const cab=makeEntity('cab','cybercab',0,0);Object.assign(cab,{owner:player.id,cab:{assetId:'cab-a'},npc:true,autopilot:true});world.entities.push(cab);
  session.observeCabs(1_000);for(let i=1;i<=9;i++)session.observeCabs(1_000+i*100);
  const before={open:(Reflect.get(session,'cabOpen') as Map<string,unknown>).size,stages:stages.length};
  session.observeCabs(2_000);
  for(let i=0;i<100&&stages.length<1;i++)await new Promise(resolve=>setTimeout(resolve,1));
  session.observeCabs(2_100);session.observeCabs(2_401);session.observeCabs(2_501);session.pauseCabs();
  for(let i=0;i<100&&stages.length<3;i++)await new Promise(resolve=>setTimeout(resolve,1));
  return {before,stages};
}
async function marketHandoff(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
  if(!purchase.ok)throw new Error('Fixture purchase failed');
  player.delivery.cash=10_120;player.delivery.level=levelForCash(player.delivery.cash);player.delivery.activeUntil=100;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,base:3_000};
  const initial=progressFrom(player.delivery,[],{},[],0,purchase.eligibleIncome);initial.cybercabs=purchase.fleet;
  let saved=structuredClone(initial),release=()=>{},started=()=>{},held=true;
  const blocked=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const stages:CabIncomeStage[]=[],messages:{type:string}[]=[];
  const ledger={async assignCab(){return 'accepted' as const;},async stageCab(stage:CabIncomeStage){stages.push(structuredClone(stage));return 'accepted' as const;},
    async prepareCab(){return {room:[],global:[]};},async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      if(held){held=false;started();await blocked;}
      let awards:AchievementId[]=[];
      if(intent.action.kind==='progress')saved={...structuredClone(intent.action.progress),cybercabs:saved.cybercabs};
      else if(intent.action.kind==='cab-income'){
        const result=settleCybercabIntervals(saved.cybercabs!,saved.cash,saved.eligibleIncome,intent.action.intervals,{room:[],global:[]});
        if(!result.ok)throw new Error('Handoff cab settlement failed');
        ({progress:saved,awards}=settledCab(saved,result));
      }else throw new Error('Unexpected handoff action');
      saved.level=levelForCash(saved.cash);
      return receipt(saved,intent,awards);
    },async acknowledge(){return true;}};
  const socket={send(value:string){messages.push(JSON.parse(value));},close(){}} as unknown as WebSocket;
  const session=new EconomySession({} as never,ledger as never,world,player,socket,'driver','old','room',0,0,initial,new Map(),new Set(),
    {assetId:'blue',catalogId:'pacific-blue-paint'});
  const personal=world.entities.find(e=>e.id===player.entityId)!;
  const cab=makeEntity('cab','cybercab',0,0);Object.assign(cab,{owner:player.id,cab:{assetId:'cab-a'},npc:true,autopilot:true});world.entities.push(cab);
  const initialPaint=personal.marketPaint,unpaintedCab=!Object.hasOwn(cab,'marketPaint');
  session.observeCabs(1_000);session.observeCabs(1_100);
  session.update(player,()=>{player.delivery.cash--;});await began;
  let pauseDone=false,actionApplied=false,buyAccepted=true;
  const paused=session.pauseForMarket().then(()=>{pauseDone=true;});
  await new Promise(resolve=>setTimeout(resolve,20));
  session.update(player,()=>{actionApplied=true;player.delivery.cash--;});session.buyCab(ok=>{buyAccepted=ok;});
  session.observeCabs(1_200);
  const waitedForHead=!pauseDone;release();await paused;
  const beforeInstall=messages.length;
  const traded={...structuredClone(saved),cash:9_000,level:levelForCash(9_000)};
  session.installMarket('driver','new',2,2,traded,{assetId:'gold',catalogId:'sunrise-gold-paint'});
  const installSilent=messages.length===beforeInstall,installedPaint=personal.marketPaint;
  await session.resumeMarket();
  const rerouted=saved.order.customer!==4,rerouteCash=saved.cash;
  const switched=chooseVehicle(world,player.id,'model-3');session.restoreCurrentVehicle();
  const selected=world.entities.find(e=>e.id===player.entityId)!;
  const switchedPaint=selected.marketPaint;session.setMarketPaint(null);
  const cleared=!Object.hasOwn(selected,'marketPaint');
  session.observeCabs(2_000);for(let i=1;i<=10;i++)session.observeCabs(2_000+i*100);
  for(let i=0;i<1000&&(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing')||(Reflect.get(session,'staging') as Set<unknown>).size)throw new Error('Resumed cab failed to drain');
  return {initialPaint,unpaintedCab,waitedForHead,actionApplied,buyAccepted,installSilent,installedPaint,rerouted,rerouteCash,switched,switchedPaint,cleared,
    stages:stages.map(({fence,sequence,intervals})=>({fence,sequence,intervals}))};
}
async function roofRepair(mode:'restore'|'switch'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const roof=CUSTOMERS.findIndex(customer=>customer.rooftop),car=world.entities.find(entity=>entity.id===player.entityId)!;
  player.delivery.cash=10_000;player.delivery.level=1;player.delivery.completed=7;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:roof,elapsed:37,base:900};
  Object.assign(car,{kind:'tesla-semi',tankLevel:1});car.upgrades.rocket=true;
  const initial=progressFrom(player.delivery,['deliveries-1','regular','deliveries-5','region-oakland'],{},[],0,0),writes:EconomyIntent[]=[];
  let saved=structuredClone(initial);
  const ledger={async submit(intent:EconomyIntent):Promise<DriverOutcome>{
    writes.push(structuredClone(intent));
    if(intent.action.kind!=='progress')throw new Error('Unexpected roof repair action');
    saved=structuredClone(intent.action.progress);
    return receipt(saved,intent,[]);
  },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  if(mode==='restore')await session.ensureAccessibleOrder();
  else step(world,new Map(),.05,{economy:session.hooks()});
  for(let i=0;i<1000&&(Reflect.get(session,'processing')||session.pending);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(session.pending)throw new Error('Roof repair failed to drain');
  return {initial,saved,writes,visible:player.delivery.order};
}
async function roofOnFoot(mode:'ticket'|'replay'|'locked'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const person=world.entities.find(entity=>entity.id===player.entityId)!;
  const roof=CUSTOMERS.findIndex(customer=>customer.rooftop&&(mode==='locked'?customer.id.includes('oakland'):customer.id.includes('sf')));
  player.delivery.cash=mode==='locked'?10_020:50_020;player.delivery.level=levelForCash(player.delivery.cash);player.delivery.completed=7;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:roof,elapsed:37,base:900};
  Object.assign(person,{kind:'person',x:0,z:6,y:0,speed:0,vy:0,supportId:'ground'});
  const initial=progressFrom(player.delivery,[],{},[],0,0),writes:EconomyIntent[]=[];
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const ledger={async stageTicket(){return 'accepted' as const;},async submit(intent:EconomyIntent):Promise<DriverOutcome>{
    writes.push(structuredClone(intent));
    if(mode==='replay'&&writes.length===1){started();await held;return {ok:false,reason:'invalid'};}
    saved=advanceClock(saved,intent);
    if(intent.action.kind==='ticket')saved=ticketProgress(saved,intent.action);
    else if(intent.action.kind==='progress')saved=structuredClone(intent.action.progress);
    else throw new Error('Unexpected on-foot action');
    const result=receipt(saved,intent,[]);saved=structuredClone(result.progress);return result;
  },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  await session.ensureAccessibleOrder();
  if(mode==='replay'){session.update(player,()=>{player.delivery.cash--;});await began;}
  const cop=makeEntity('police','model-3',0,0);cop.police=newPolice();cop.police.targetId=player.id;cop.police.lastSeen=world.time;world.entities.push(cop);
  updatePolice(world,.05,(p,apply,evidence)=>session.update(p,apply,null,evidence));
  if(cop.police.targetId!==null)throw new Error('Ticket did not stop the on-foot driver');
  release();
  for(let i=0;i<2000&&(Reflect.get(session,'processing')||session.pending);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(session.pending||Reflect.get(session,'failed'))throw new Error('On-foot ticket failed to drain');
  return {initial,saved,writes,visible:player.delivery.order};
}
// Exercise real wallet actions with an on-foot driver and an existing rooftop job.
async function roofOnFootSpend(mode:'buy'|'paint'|'contribute'|'luxury'|'locked'){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const person=world.entities.find(entity=>entity.id===player.entityId)!;
  const roof=CUSTOMERS.findIndex(customer=>customer.rooftop&&customer.id.includes(mode==='locked'?'oakland':'sf'));
  const cash=mode==='buy'?50_020:mode==='luxury'?2_000_020:10_020;
  player.delivery.cash=cash;player.delivery.level=levelForCash(cash);player.delivery.completed=7;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:roof,elapsed:37,base:900};
  Object.assign(person,{kind:'person',x:0,z:6,y:0,speed:0,vy:0,supportId:'ground'});
  if(mode==='luxury')Object.assign(person,{x:LUXURY_SHOWROOM.arrival.x,z:LUXURY_SHOWROOM.arrival.z});
  const initial=progressFrom(player.delivery,[],{},[],0,0),writes:EconomyIntent[]=[],messages:unknown[]=[];
  if(mode==='paint'){
    const purchase=purchaseCybercab(emptyCybercabFleet(),35_000,0,'cab-a');
    if(!purchase.ok)throw new Error('Fixture cab purchase failed');initial.cybercabs=purchase.fleet;
  }
  let saved=structuredClone(initial),reply:boolean|undefined;
  const ledger={async submit(intent:EconomyIntent):Promise<DriverOutcome>{
    writes.push(structuredClone(intent));const action=intent.action;let awards:AchievementId[]=[];
    if(action.kind==='cab-buy'||action.kind==='cab-paint'){
      const result=action.kind==='cab-buy'?purchaseCybercab(saved.cybercabs??emptyCybercabFleet(),saved.cash,saved.eligibleIncome,action.assetId):
        paintCybercab(saved.cybercabs??emptyCybercabFleet(),saved.cash,saved.eligibleIncome,action.assetId,action.paint);
      if(!result.ok)throw new Error(`Fixture cab action failed: ${result.reason}`);
      saved={...saved,cash:result.cash,eligibleIncome:result.eligibleIncome,cybercabs:result.fleet};
    }else if(action.kind==='contribute')saved={...saved,cash:saved.cash-action.amount};
    else if(action.kind==='luxury'){
      const entry=luxuryVehicle(action.vehicle);if(!entry)throw new Error('Fixture luxury vehicle missing');
      const earned=luxuryPurchaseAwards(action.vehicle,saved.ownedLuxury,saved.unlocked);
      const reward=earned.reduce((sum,award)=>sum+award.reward,0);awards=earned.map(award=>award.id);
      saved={...saved,cash:saved.cash-entry.price+reward,eligibleIncome:saved.eligibleIncome+reward,
        ownedLuxury:[...saved.ownedLuxury,action.vehicle],unlocked:[...saved.unlocked,...awards]};
    }else throw new Error('Unexpected on-foot spend');
    if('order' in action&&action.order)saved.order=structuredClone(action.order);
    saved.level=levelForCash(saved.cash);const result=receipt(saved,intent,awards);saved=structuredClone(result.progress);return result;
  },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(value:string){messages.push(JSON.parse(value));},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  if(mode==='buy')session.buyCab(ok=>{reply=ok;});
  else if(mode==='paint')session.paintCab('cab-a','ember',ok=>{reply=ok;});
  else if(mode==='luxury')session.luxury('buy','ducati-panigale-v4',1);
  else session.contributeMars(100,1);
  for(let i=0;i<2000&&(Reflect.get(session,'processing')||session.pending);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(session.pending||Reflect.get(session,'failed'))throw new Error('On-foot spend failed to drain');
  return {initial,saved,writes,messages,reply,visible:player.delivery.order};
}
export default {async fetch(request:Request){
  const path=new URL(request.url).pathname;
  return Response.json(path==='/history'?await transient('history'):path==='/profile'?await transient('profile'):
    path==='/spend-history'?await scenario('history'):path==='/rejected'?await rejected():path==='/rejected-transient'?await rejectedTransient():
      path==='/backpressure'?await backpressure('history'):path==='/backpressure-fence'?await backpressure('fence'):
        path==='/cadence'?await cadence():path==='/market-handoff'?await marketHandoff():
          path==='/roof-restore'?await roofRepair('restore'):path==='/roof-switch'?await roofRepair('switch'):
            path==='/roof-foot-ticket'?await roofOnFoot('ticket'):path==='/roof-foot-replay'?await roofOnFoot('replay'):
              path==='/roof-foot-locked'?await roofOnFoot('locked'):
                path.startsWith('/roof-spend-')?await roofOnFootSpend(path.slice('/roof-spend-'.length) as 'buy'|'paint'|'contribute'|'luxury'|'locked'):await scenario());
}};
