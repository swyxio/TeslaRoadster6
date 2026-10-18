// Local characterization of an arrival behind a rejected balance change.
import { EconomySession } from '../../worker/economy-session';
import { applyAcceptedDelivery, applyTierProgress } from '../../worker/achievement-progress';
import { progressFrom, type DriverOutcome, type EconomyIntent } from '../../worker/driver-profile';
import { addPlayer, createEmptyWorld, NEUTRAL, step } from '../../shared/game';
import { advanceDeliverySearch, applyDeliveryStop, captureDeliveryStop, CUSTOMERS, initialDelivery, levelForCash, orderTarget, payoutFor, pickupBonusFor, RESTAURANTS, rerouteInaccessibleOrder, updateDelivery } from '../../shared/delivery';
import { applyAchievementAwards, initialAchievements } from '../../shared/achievements';
import { normalizeAchievementTiers } from '../../shared/achievement-tiers';
import { terrainHeight } from '../../shared/map';

// Fake profile settlement follows the production contract: its receipt is
// written only after the assignment has been resolved.
function finishAssignment(delivery:ReturnType<typeof initialDelivery>){
  const pending=!!delivery.order.search;
  for(let i=0;i<10_000&&delivery.order.search;i++)advanceDeliverySearch(delivery,delivery.order.search.canFly);
  if(delivery.order.search)throw new Error('Fixture assignment did not finish');
  if(pending&&delivery.lastReroute){const {reason,origin,level}=delivery.lastReroute;return {reason,origin,level};}
}

async function scenario(visit:'committed'|'speculative') {
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  player.delivery.cash=10_120;player.delivery.level=levelForCash(player.delivery.cash);
  player.delivery.activeUntil=100;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,base:3_000,elapsed:40};
  player.achievements.unlocked.push('region-oakland');
  const initial=progressFrom(player.delivery,player.achievements.unlocked,{},[],0,0);
  initial.achievementTiers=normalizeAchievementTiers(undefined,initial.completed,initial.unlocked);
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={
    async stageDelivery(){return 'accepted' as const;},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){started();await held;return {ok:false,reason:'reserved'};}
      let assignment:Extract<DriverOutcome,{ok:true}>['assignment'];
      if(intent.action.kind==='delivery'){
        const action=intent.action,delivery=initialDelivery(action.stop),clock=intent.clock??0;
        Object.assign(delivery,{cash:saved.cash,lifetimeIncome:saved.eligibleIncome,earned:saved.earned,completed:saved.completed,
          level:saved.level,order:{...saved.order,elapsed:saved.order.elapsed+clock-(saved.deliveryClock??0)},tickets:saved.tickets});
        const order={...delivery.order},dropoff=order.stage==='dropoff',customer=CUSTOMERS[order.customer]?.id,rooftop=dropoff&&orderTarget(order).rooftop;
        const parts=applyDeliveryStop(delivery,action.stop,part=>Math.round(part.amount*(action.multiplier??1)));
        const state=initialAchievements();state.unlocked=[...saved.unlocked];
        const tiers=parts?applyAcceptedDelivery(delivery,state,saved.achievementTiers!,order,rooftop,dropoff?customer:undefined,!!delivery.lastReward).progress:saved.achievementTiers;
        assignment=finishAssignment(delivery);
        saved={...saved,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,earned:delivery.earned,completed:delivery.completed,
          level:delivery.level,order:delivery.order,unlocked:state.unlocked,achievementTiers:tiers,deliveryClock:clock};
      }else if(intent.action.kind==='progress')saved=structuredClone(intent.action.progress);
      else throw new Error(`Unexpected ${intent.action.kind}`);
      return {ok:true,revision:intent.revision+1,progress:structuredClone(saved),awards:[],...(assignment?{assignment}:{})};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  session.contributeMars(1_000,1);await began;
  const speculativeDelivery=structuredClone((Reflect.get(session,'draft') as {delivery:ReturnType<typeof initialDelivery>}).delivery);
  finishAssignment(speculativeDelivery);
  const speculative=speculativeDelivery.order;
  if(speculative.customer===initial.order.customer)throw new Error('The rejected predecessor did not reroute the order');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  // Keep five seconds of active order time independent of either target.
  world.time=5;Object.assign(car,{x:450,z:60,y:0,speed:0,vy:0,supportId:'ground'});
  session.update(player,()=>{session.deliveryStart(player,car,false);const active=player.delivery.activeSeconds;
    const payouts=updateDelivery(world,player,car,NEUTRAL,5);session.deliveryEnd(player,player.delivery.activeSeconds-active,payouts);return payouts;},{atMs:1_000,multiplier:2});
  const target=CUSTOMERS[visit==='committed'?initial.order.customer:speculative.customer];
  Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z)??0,speed:0,vy:0,supportId:'ground'});
  const hooks=session.hooks();
  step(world,new Map(),.05,{economy:{...hooks,update:(p,apply)=>session.update(p,apply,{atMs:2_000,multiplier:2}),
    resolveDeliveryPayout:(_p,component)=>2*component.amount}});
  const draft=structuredClone(Reflect.get(session,'draft') as {delivery:{completed:number;order:typeof initial.order}});
  // The player leaves before the predecessor resolves.
  Object.assign(car,{x:0,z:0,y:0,speed:0,vy:0,supportId:'ground'});
  release();
  for(let i=0;i<2_000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('The fixture queue did not drain');
  return {initial,speculative,draft,saved,writes,expectedFare:2*payoutFor({...initial.order,elapsed:45.05})};
}

async function unknownRateScenario(knownRate=false){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
  const spawn={x:car.x,y:car.y,z:car.z,yaw:car.yaw};
  player.delivery.cash=10_120;player.delivery.level=levelForCash(player.delivery.cash);player.delivery.activeUntil=100;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,base:3_000,elapsed:40};
  player.achievements.unlocked.push('region-oakland');
  const initial=progressFrom(player.delivery,player.achievements.unlocked,{},[],0,0);
  initial.achievementTiers=normalizeAchievementTiers(undefined,initial.completed,initial.unlocked);
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[],messages:unknown[]=[];
  const ledger={
    async stageDelivery(){return 'accepted' as const;},
    async stageSupply(){return 'accepted' as const;},
    async submit(intent:EconomyIntent):Promise<DriverOutcome>{
      writes.push(structuredClone(intent));
      if(writes.length===1){started();await held;}
      if(intent.action.kind==='supply'){
        const clock=intent.clock??0;
        const delivery=initialDelivery({x:0,z:0});
        Object.assign(delivery,{cash:saved.cash+5,lifetimeIncome:saved.eligibleIncome+5,level:levelForCash(saved.cash+5)});
        const achievements=initialAchievements();achievements.unlocked=[...saved.unlocked];
        const tiers=applyTierProgress(delivery,saved.achievementTiers!,['supply-pickups']);
        const awards=applyAchievementAwards(delivery,achievements,[]);
        saved={...saved,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,level:delivery.level,
          unlocked:achievements.unlocked,achievementTiers:tiers,deliveryClock:clock,
          order:{...saved.order,elapsed:saved.order.elapsed+clock-(saved.deliveryClock??0)}};
        return {ok:true,revision:intent.revision+1,progress:structuredClone(saved),awards};
      }
      if(intent.action.kind!=='delivery')throw new Error(`Unexpected ${intent.action.kind}`);
      const action=intent.action,delivery=initialDelivery(action.stop),clock=intent.clock??0;
      Object.assign(delivery,{cash:saved.cash,lifetimeIncome:saved.eligibleIncome,earned:saved.earned,completed:saved.completed,
        level:saved.level,order:{...saved.order,elapsed:saved.order.elapsed+clock-(saved.deliveryClock??0)},tickets:saved.tickets});
      const order={...delivery.order},dropoff=order.stage==='dropoff',customer=CUSTOMERS[order.customer]?.id,rooftop=dropoff&&orderTarget(order).rooftop;
      const parts=applyDeliveryStop(delivery,action.stop,part=>Math.round(part.amount*(action.multiplier??2)));
      const achievements=initialAchievements();achievements.unlocked=[...saved.unlocked];
      const tier=parts?applyAcceptedDelivery(delivery,achievements,saved.achievementTiers!,order,rooftop,dropoff?customer:undefined,!!delivery.lastReward):undefined;
      const awards=tier?.awards??[];
      const assignment=finishAssignment(delivery);
      saved={...saved,cash:delivery.cash,eligibleIncome:delivery.lifetimeIncome,earned:delivery.earned,completed:delivery.completed,
        level:delivery.level,order:delivery.order,unlocked:achievements.unlocked,achievementTiers:tier?.progress??saved.achievementTiers,deliveryClock:clock};
      return {ok:true,revision:intent.revision+1,progress:structuredClone(saved),awards,...(assignment?{assignment}:{}),
        delivery:{matched:!!parts,earnings:[],lastReward:delivery.lastReward,lastPayout:delivery.lastPayout}};
    },
    async acknowledge(){return true;},
  };
  const session=new EconomySession({} as never,ledger as never,world,player,{send(value:string){messages.push(JSON.parse(value));},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  const first=CUSTOMERS[4];Object.assign(car,{x:first.x,z:first.z,y:terrainHeight(first.x,first.z),speed:0,vy:0,supportId:'ground'});
  world.time=1;
  session.update(player,()=>{session.deliveryStart(player,car,false);const before=player.delivery.activeSeconds;
    const result=updateDelivery(world,player,car,NEUTRAL,.05,false,false,knownRate?part=>2*part.amount:()=>null,false);
    session.deliveryEnd(player,player.delivery.activeSeconds-before,result);return result;},knownRate?{atMs:1_000,multiplier:2}:null,undefined,1_000);
  await began;
  const stop=captureDeliveryStop(car);
  // Both the affected driver and another player keep receiving physical input
  // while historical settlement is held. No room-wide simulation lock is used.
  Object.assign(car,{...spawn,speed:0,vy:0,supportId:'ground',autopilot:false});
  const other=addPlayer(world,'other','Other'),otherCar=world.entities.find(entity=>entity.id===other.entityId)!;
  const firstPose={x:car.x,z:car.z},otherPose={x:otherCar.x,z:otherCar.z},firstClock=Reflect.get(session,'deliveryClock') as number;
  const hooks=session.hooks(),inputs=new Map([[player.id,{...NEUTRAL,throttle:1}],[other.id,{...NEUTRAL,throttle:1}]]);
  for(let i=0;i<8;i++)step(world,inputs,.05,{economy:{...hooks,achievement:undefined,canCollect:()=>false,
    update:(p,apply,ticket)=>p.id===player.id?session.update(p,apply,null,ticket,1_000):apply(),
    deliveryStart:(p,e,paused)=>{if(p.id===player.id)session.deliveryStart(p,e,paused);},
    deliveryEnd:(p,active,payouts)=>{if(p.id===player.id)session.deliveryEnd(p,active,payouts);},
    decisionsAvailable:p=>p.id!==player.id||session.decisionsAvailable,
    resolveDeliveryPayout:(p,part)=>p.id===player.id?null:part.amount}});
  const driverMoved=Math.hypot(car.x-firstPose.x,car.z-firstPose.z)>0,otherMoved=Math.hypot(otherCar.x-otherPose.x,otherCar.z-otherPose.z)>0;
  const afterDrivingClock=Reflect.get(session,'deliveryClock') as number;
  // An independent pickup is still staged while the delivery rate is held.
  const pickup={id:'repair-test',kind:'repair' as const,x:car.x,z:car.z,active:true};car.health=25;
  session.pickup(player,car,pickup);
  const preview=initialDelivery(car);Object.assign(preview,{cash:initial.cash,lifetimeIncome:initial.eligibleIncome,earned:initial.earned,
    completed:initial.completed,level:initial.level,order:{...initial.order,elapsed:initial.order.elapsed+.05}});
  const previousOrder={...preview.order},expectedFare=2*payoutFor(previousOrder),earlyDelivery=previousOrder.elapsed<previousOrder.estimate;
  applyDeliveryStop(preview,stop,part=>2*part.amount);
  const awards=initialAchievements();awards.unlocked=[...initial.unlocked];
  applyAcceptedDelivery(preview,awards,initial.achievementTiers!,previousOrder,false,first.id,true);
  finishAssignment(preview);
  const pickupOrder={...preview.order,elapsed:afterDrivingClock-firstClock+(knownRate?0:.05)};
  const next=RESTAURANTS[preview.order.restaurant],expectedPickup=Math.round(1.5*pickupBonusFor(pickupOrder));
  const earlyPickup=pickupOrder.elapsed<pickupOrder.pickupEstimate;
  Object.assign(car,{x:next.x,z:next.z,y:terrainHeight(next.x,next.z),speed:0,vy:0,supportId:'ground'});world.time=2;
  session.update(player,()=>{session.deliveryStart(player,car,false);const before=player.delivery.activeSeconds,paused=!!player.delivery.order.search;
    const result=updateDelivery(world,player,car,NEUTRAL,.05,false,false,part=>Math.round(1.5*part.amount),false);
    session.deliveryEnd(player,paused?0:player.delivery.activeSeconds-before,result);return result;},{atMs:2_000,multiplier:1.5});
  session.contributeMars(1_000,7);
  const deferredSpend=messages.some(value=>typeof value==='object'&&value!==null&&Reflect.get(value,'type')==='marsResult'&&Reflect.get(value,'ok')===false);
  release();
  for(let i=0;i<2_000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Historical-rate queue did not drain');
  return {saved,writes,initial,expectedFare,expectedPickup,earlyDelivery,earlyPickup,deferredSpend,driverMoved,otherMoved,health:car.health};
}

async function backlogScenario(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
  player.delivery.activeUntil=100;
  const initial=progressFrom(player.delivery,[],{},[],0,0);
  let closed=false;
  const ledger={async stageDelivery(){return 'accepted' as const;},async submit(){return new Promise<DriverOutcome>(()=>{});}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){closed=true;}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  for(let i=0;i<40;i++){
    const target=RESTAURANTS[i%2];
    Object.assign(car,{x:target.x,z:target.z,y:terrainHeight(target.x,target.z),speed:0,vy:0,supportId:'ground'});
    session.update(player,()=>{session.deliveryStart(player,car,false);const before=player.delivery.activeSeconds;
      const result=updateDelivery(world,player,car,NEUTRAL,.05,false,false,()=>null);
      session.deliveryEnd(player,player.delivery.activeSeconds-before,result);return result;},null,undefined,1_000+i);
  }
  return {closed,queued:(Reflect.get(session,'queue') as unknown[]).length};
}

async function unavailableRetryScenario(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
  player.delivery.cash=0;player.delivery.level=0;player.delivery.activeUntil=100;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,elapsed:12};
  if(!rerouteInaccessibleOrder(player.delivery,{x:0,z:1e9}))throw new Error('Expected synthetic no-candidate result');
  finishAssignment(player.delivery);
  const initial=progressFrom(player.delivery,[],{},[],0,0);
  let saved=structuredClone(initial),release=()=>{},started=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});
  const writes:EconomyIntent[]=[];
  const ledger={async submit(intent:EconomyIntent):Promise<DriverOutcome>{
    writes.push(structuredClone(intent));started();await held;
    if(intent.action.kind!=='progress')throw new Error('Expected a progress write');
    saved=structuredClone(intent.action.progress);
    const delivery=initialDelivery({x:0,z:0});Object.assign(delivery,{order:structuredClone(saved.order),completed:saved.completed,level:saved.level});
    const assignment=finishAssignment(delivery);saved.order=delivery.order;
    return {ok:true,revision:intent.revision+1,progress:structuredClone(saved),awards:[],...(assignment?{assignment}:{})};
  },async acknowledge(){return true;}};
  const session=new EconomySession({} as never,ledger as never,world,player,{send(){},close(){}} as never,
    'driver','fence','room',0,0,initial,new Map(),new Set());
  const hooks=session.hooks(),inputs=new Map([[player.id,{...NEUTRAL,throttle:1}]]);
  Object.assign(car,{x:450,z:60,y:0,speed:0,vy:0,supportId:'ground'});world.time=1;
  step(world,inputs,.05,{economy:{...hooks,achievement:undefined,canCollect:()=>false}});
  const whileLocked={order:{...player.delivery.order},reason:player.delivery.lastReroute?.reason,
    clock:Reflect.get(session,'deliveryClock') as number,writes:writes.length};
  Object.assign(car,{x:-120,z:60,y:0,speed:0,vy:0,supportId:'ground'});world.time=2;
  step(world,inputs,.05,{economy:{...hooks,achievement:undefined,canCollect:()=>false}});
  await began;
  const whileHeld={order:{...player.delivery.order},reason:player.delivery.lastReroute?.reason};
  release();
  for(let i=0;i<2_000&&Reflect.get(session,'processing');i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(Reflect.get(session,'processing'))throw new Error('Retry queue did not drain');
  return {initial,whileLocked,whileHeld,saved,live:{order:player.delivery.order,reason:player.delivery.lastReroute?.reason},writes};
}

export default {async fetch(request:Request){
  try{const path=new URL(request.url).pathname;return Response.json(path==='/unknown'?await unknownRateScenario():path==='/known'?await unknownRateScenario(true):path==='/backlog'?await backlogScenario():path==='/unavailable-retry'?await unavailableRetryScenario():await scenario(path==='/speculative'?'speculative':'committed'));}
  catch(error){return new Response(String(error),{status:500});}
}};
