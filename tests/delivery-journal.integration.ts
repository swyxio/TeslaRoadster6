// Durable delivery stops, real local Durable Objects and fault injection.
// pnpm exec tsx tests/delivery-journal.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { advanceDeliverySearch, applyDeliveryStop, CUSTOMERS, initialDelivery, isOrderAccessible, payoutFor, pickupBonusFor, rerouteInaccessibleOrder, RESTAURANTS, type DeliveryStop, type Order } from '../shared/delivery';
import { DELIVERY_SEARCH_VERSION } from '../shared/delivery-scheduler';
import { initialAchievements } from '../shared/achievements';
import { applyTicketEvidence } from '../shared/police';
import { applyAcceptedDelivery } from '../worker/achievement-progress';
import { terrainHeight } from '../shared/map';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { AchievementStage, DeliveryStage, TicketStage } from '../worker/room-economy';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(50);}throw new Error(`Timed out: ${label}`);
}
async function port(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGKILL');}catch{}
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler shutdown');
}
const dir=await mkdtemp(join(tmpdir(),'tesland-delivery-journal-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-delivery-journal-test',main:resolve('tests/fixtures/delivery-journal-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','RoomEconomy','DriverProfile','GlobalIncome','GlobalEarningsEvent']}]}));
let child:ChildProcess|undefined,logs='';
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',60_000);}
async function rpc<T>(op:string,fields:Record<string,unknown>={},timeout=5000):Promise<T>{
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,...fields}),signal:AbortSignal.timeout(timeout)});
  const body=await response.text();if(!response.ok)throw new Error(`${op}: ${response.status} ${body}\n${logs}`);return JSON.parse(body) as T;
}
type Profile={revision:number;sequence:number;progress:DriverProgress};
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}
function pose(customer:number):DeliveryStop {
  const {x,z}=CUSTOMERS[customer],y=terrainHeight(x,z);assert.notEqual(y,null);
  return {x,y:y!,z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false};
}
function entry(){return {room:`delivery-${randomUUID().slice(0,8)}`,driverId:randomUUID(),fence:randomUUID()};}
function order(){return {...initialDelivery({x:0,z:0}).order,stage:'dropoff' as const,customer:4,elapsed:40,base:1000,estimate:60};}
function stage(e:ReturnType<typeof entry>,walletOrder:number,clock:number,stop:DeliveryStop,multiplier:1|1.5|2|3|null=1,atMs=Date.now()-2_000):DeliveryStage {
  return {eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,walletOrder,clock,action:{kind:'delivery',stop,atMs,multiplier}};
}
function intent(s:DeliveryStage,revision:number,sequence:number):EconomyIntent {
  return {eventId:s.eventId,driverId:s.driverId,fence:s.fence,roomId:s.roomId,revision,sequence,clock:s.clock,action:s.action};
}
async function acquire(e:ReturnType<typeof entry>){
  await rpc('producer',{...e,active:true});
  return rpc<{revision:number;sequence:number;progress:DriverProgress}>('acquire',{...e,progress:{cash:10_120,level:1,order:order(),deliveryClock:0,unlocked:['region-oakland']}});
}

try{
  child=start();await ready();
  // A rejected spend displayed a different target. A physical visit there is
  // a no-op, while the restored target pays once with all 45 active seconds.
  const e=entry(),initial=await acquire(e);
  const bad={...structuredClone(initial.progress),earned:-1};
  const rejected:EconomyIntent={eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,revision:0,sequence:1,clock:0,action:{kind:'progress',progress:bad}};
  const denied=await rpc<DriverOutcome>('commit',{...e,intent:rejected});assert.deepEqual(denied,{ok:false,reason:'invalid'});
  const wrong=stage(e,2,3,pose(0)),right=stage(e,3,5,pose(4));
  assert.equal(await rpc('stage',{...e,stage:wrong}),'accepted');assert.equal(await rpc('stage',{...e,stage:right}),'accepted');
  const later=intent(right,1,3),earlier=intent(wrong,0,2);
  assert.equal(await rpc('submit',{...e,intent:later}),null,'later delivery cannot overtake a staged stop');
  const noMatch=await rpc<DriverOutcome>('submit',{...e,intent:earlier});success(noMatch);
  assert.equal(noMatch.delivery?.matched,false);assert.equal(noMatch.progress.order.elapsed,43);
  assert.deepEqual(await rpc('sources',e),[],'nonmatching observations consume no source IDs');
  assert.equal(await rpc('ack',{...e,intent:earlier}),true);
  const paid=await rpc<DriverOutcome>('submit',{...e,intent:later});success(paid);
  const baseFare=payoutFor({...order(),elapsed:45});
  assert.equal(paid.delivery?.matched,true);assert.equal(paid.delivery?.earnings[0].amount,baseFare);
  assert.equal(paid.progress.completed,1);assert.ok(paid.awards.includes('deliveries-1'));
  assert.equal(paid.progress.cash,10_120+baseFare+350+100,'first early-delivery tier commits with the fare');
  assert.deepEqual(paid.progress.achievementTiers?.deliveries,{count:1,claimed:1});
  assert.deepEqual(paid.progress.achievementTiers?.['early-deliveries'],{count:1,claimed:1});
  assert.deepEqual(await rpc('sources',e),['earned-source:delivery:1:dropoff']);
  assert.deepEqual(await rpc('submit',{...e,intent:later}),paid,'a lost response cannot pay twice');

  // The journal selects the next job from immutable event-time capability;
  // old accepted stops lacking the new field remain valid but conservative.
  for(const roofEligible of [true,false,undefined]){
    const driver=entry();await rpc('producer',{...driver,active:true});
    const progress={cash:10_120,level:1,completed:6,order:{...order(),customer:0},deliveryClock:0,unlocked:['region-oakland']};
    await rpc('acquire',{...driver,progress});
    const stop={...pose(0),kind:'roadster',canFly:true,...(roofEligible===undefined?{}:{roofEligible})};
    const observed=stage(driver,1,0,stop),submitted=intent(observed,0,1);
    assert.equal(await rpc('stage',{...driver,stage:observed}),'accepted');
    const result=await rpc<DriverOutcome>('submit',{...driver,intent:submitted});success(result);
    assert.equal(result.progress.completed,7);
    assert.equal(CUSTOMERS[result.progress.order.customer].rooftop,roofEligible===true,`captured roof capability ${roofEligible}`);
  }
  // A newly assigned off-lane order keeps its numeric customer identity and
  // accepted delivery through a Worker restart, without a capability field.
  const offroad=entry();await rpc('producer',{...offroad,active:true});
  const priorCustomer=CUSTOMERS.findIndex(place=>place.id==='customer-south-san-francisco-10');
  const offroadCustomer=CUSTOMERS.findIndex(place=>place.id==='customer-south-san-francisco-11');
  assert.ok(priorCustomer>=0&&offroadCustomer>=0);
  const offroadProgress={cash:52_500,level:2,completed:5,order:{...order(),restaurant:0,customer:priorCustomer},deliveryClock:0,unlocked:['region-oakland']};
  await rpc('acquire',{...offroad,progress:offroadProgress});
  const priorStop=stage(offroad,1,0,pose(priorCustomer));
  assert.equal(await rpc('stage',{...offroad,stage:priorStop}),'accepted');
  const assigned=await rpc<DriverOutcome>('submit',{...offroad,intent:intent(priorStop,0,1)});success(assigned);
  assert.equal(assigned.progress.order.customer,offroadCustomer,'durable assignment uses the off-lane catalog stop');
  const offroadPickup=RESTAURANTS[assigned.progress.order.restaurant],pickupHeight=terrainHeight(offroadPickup.x,offroadPickup.z);assert.notEqual(pickupHeight,null);
  const pickupStop=stage(offroad,2,1,{x:offroadPickup.x,y:pickupHeight!,z:offroadPickup.z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false});
  assert.equal(await rpc('stage',{...offroad,stage:pickupStop}),'accepted');
  const collected=await rpc<DriverOutcome>('submit',{...offroad,intent:intent(pickupStop,assigned.revision,2)});success(collected);
  assert.equal(collected.progress.order.stage,'dropoff');assert.equal(collected.progress.order.customer,offroadCustomer);
  const delivered=stage(offroad,3,2,pose(offroadCustomer));
  await rpc('hold-stage',offroad);const offroadFlight=rpc('stage',{...offroad,stage:delivered},30_000);void offroadFlight.catch(()=>{});
  await until(()=>rpc<boolean>('stage-held',offroad),'off-lane stop accepted before lost reply');
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',offroad,15_000);
  const offroadRecovered=await rpc<Profile>('profile',offroad);
  assert.equal(offroadRecovered.progress.completed,7);
  const offroadSources=await rpc<string[]>('sources',offroad);
  assert.equal(offroadSources.filter(source=>source==='earned-source:delivery:7:dropoff').length,1);
  await rpc('freeze',offroad,15_000);
  assert.deepEqual((await rpc<Profile>('profile',offroad)).progress,offroadRecovered.progress);
  assert.deepEqual(await rpc('sources',offroad),offroadSources,'recovery does not pay the stop twice');
  // Ticket replay also preserves event-time eligibility after a balance drop.
  for(const roofEligible of [true,false,undefined]){
    const driver=entry();await rpc('producer',{...driver,active:true});
    const roof=CUSTOMERS.findIndex(customer=>customer.rooftop);
    const prior={...order(),customer:roof};
    const progress={cash:50_020,level:2,completed:7,order:prior,deliveryClock:0,unlocked:['region-oakland']};
    const acquired=await rpc<{progress:DriverProgress}>('acquire',{...driver,progress});
    const ticket:TicketStage={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,walletOrder:1,clock:0,
      action:{kind:'ticket',evidence:{seconds:0,peakHeight:0,at:1,x:0,z:0,canFly:true,...(roofEligible===undefined?{}:{roofEligible})},orderBefore:acquired.progress.order,completedBefore:7}};
    assert.equal(await rpc('stage-ticket',{...driver,stage:ticket}),'accepted');
    const submitted:EconomyIntent={...ticket,revision:0,sequence:1,action:ticket.action};
    const result=await rpc<DriverOutcome>('submit',{...driver,intent:submitted});success(result);
    assert.equal(result.progress.cash,49_960);
    assert.equal(CUSTOMERS[result.progress.order.customer].rooftop,roofEligible===true,`ticket roof capability ${roofEligible}`);
    assert.equal(result.progress.order.stage,'dropoff');
  }

  // A speeding stop uses the same durable journal and is charged only once,
  // including when the room has to replay a lost response.
  {
    const driver=entry(),acquired=await acquire(driver);
    const ticket:TicketStage={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,walletOrder:1,clock:0,
      action:{kind:'ticket',evidence:{seconds:0,peakHeight:0,at:1,x:-800,z:3300,canFly:true,cause:'speeding',speedKph:150},orderBefore:acquired.progress.order,completedBefore:0}};
    assert.equal(await rpc('stage-ticket',{...driver,stage:ticket}),'accepted');
    const submitted:EconomyIntent={...ticket,revision:0,sequence:1,action:ticket.action};
    const result=await rpc<DriverOutcome>('submit',{...driver,intent:submitted});success(result);
    assert.equal(result.progress.cash,acquired.progress.cash-100);
    assert.equal(result.progress.tickets,1);
    assert.deepEqual(await rpc('submit',{...driver,intent:submitted}),result,'replay cannot charge the speeding fine twice');
    await rpc('freeze',driver,15_000);
    const saved=await rpc<Profile>('profile',driver);
    assert.equal(saved.progress.cash,acquired.progress.cash-100);assert.equal(saved.progress.tickets,1);
  }

  // On-foot evidence survives durable replay: preserve accessible roofs, but
  // still reroute a destination that the balance drop locks geographically.
  for(const locked of [false,true]){
    const driver=entry();await rpc('producer',{...driver,active:true});
    const roof=CUSTOMERS.findIndex(customer=>customer.rooftop&&customer.id.includes(locked?'oakland':'sf'));
    const progress={cash:locked?10_020:50_020,level:locked?1:2,completed:7,order:{...order(),customer:roof},deliveryClock:0,unlocked:['region-oakland']};
    const acquired=await rpc<{progress:DriverProgress}>('acquire',{...driver,progress});
    const ticket:TicketStage={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,walletOrder:1,clock:0,
      action:{kind:'ticket',evidence:{seconds:0,peakHeight:0,at:1,x:0,z:0,canFly:false,roofEligible:false,onFoot:true},orderBefore:acquired.progress.order,completedBefore:7}};
    assert.equal(await rpc('stage-ticket',{...driver,stage:ticket}),'accepted');
    await rpc('freeze',driver,15_000);
    const result=await rpc<Profile>('profile',driver);
    assert.equal(result.progress.cash,progress.cash-60);assert.equal(result.progress.order.stage,'dropoff');
    if(locked)assert.equal(CUSTOMERS[result.progress.order.customer].rooftop,false);
    else assert.equal(result.progress.order.customer,roof);
  }

  // Every ordinary submission waits behind an accepted physical stage. Freeze
  // resolves the observation and a later ticket in order with the same clock.
  const ordered=entry(),saved=await acquire(ordered),candidate=stage(ordered,1,5,pose(0));
  assert.equal(await rpc('stage',{...ordered,stage:candidate}),'accepted');
  const ticket:TicketStage={eventId:randomUUID(),driverId:ordered.driverId,fence:ordered.fence,roomId:ordered.room,walletOrder:2,clock:7,
    action:{kind:'ticket',evidence:{seconds:8,peakHeight:20,at:1,x:0,z:0,canFly:false},orderBefore:saved.progress.order,completedBefore:0}};
  assert.equal(await rpc('stage-ticket',{...ordered,stage:ticket}),'accepted');
  const ticketIntent:EconomyIntent={...ticket,sequence:2,revision:1,action:ticket.action};
  assert.equal(await rpc('submit',{...ordered,intent:ticketIntent}),null);
  const ordinary:EconomyIntent={eventId:randomUUID(),driverId:ordered.driverId,fence:ordered.fence,roomId:ordered.room,revision:2,sequence:3,clock:8,action:{kind:'progress',progress:saved.progress}};
  assert.equal(await rpc('submit',{...ordered,intent:ordinary}),null,'ordinary progress cannot overtake stages');
  await rpc('freeze',ordered,15_000);
  const orderedResult=await rpc<Profile>('profile',ordered);
  assert.equal(orderedResult.progress.order.elapsed,47);assert.equal(orderedResult.progress.deliveryClock,7);assert.equal(orderedResult.progress.tickets,1);

  // A buggy concurrent producer cannot insert an earlier physical stage after
  // a later write already entered the journal. The late stage fails closed.
  const concurrent=entry(),concurrentProfile=await acquire(concurrent);
  const ahead:EconomyIntent={eventId:randomUUID(),driverId:concurrent.driverId,fence:concurrent.fence,roomId:concurrent.room,
    revision:99,sequence:3,clock:8,action:{kind:'progress',progress:concurrentProfile.progress}};
  assert.equal(await rpc('submit',{...concurrent,intent:ahead}),null);
  const tooLate=stage(concurrent,2,5,pose(4));
  assert.equal(await rpc('stage',{...concurrent,stage:tooLate}),'conflict');
  await rpc('freeze',concurrent,15_000);
  assert.equal((await rpc<Profile>('profile',concurrent)).progress.completed,0);

  // Unknown event-time rate remains pending behind a room win reservation.
  const rate=entry();await acquire(rate);const at=Date.now()-2_000;
  await rpc('room-pending',{...rate,eventId:'delayed-win',at:at-1_000});
  const timed=stage(rate,1,5,pose(4),null,at),timedIntent=intent(timed,0,1);
  assert.equal(await rpc('stage',{...rate,stage:timed}),'accepted');
  assert.equal(await rpc('submit',{...rate,intent:timedIntent}),null);
  assert.equal((await rpc<Profile>('profile',rate)).progress.completed,0);
  await rpc('room-resolve',{...rate,eventId:'delayed-win'});
  const boosted=await rpc<DriverOutcome>('submit',{...rate,intent:timedIntent});success(boosted);
  assert.equal(boosted.delivery?.earnings[0].multiplier,1.5);
  assert.equal(boosted.delivery?.earnings[0].amount,Math.round(baseFare*1.5));

  // Multiple overlapping wins require every room-history page. A failed
  // second page cannot be cached as complete or produce any payout.
  const pages=entry();await acquire(pages);const firstWin=Date.now()-100_000;
  for(let i=0;i<101;i++)await rpc('room-win',{...pages,eventId:`win-${i}`,at:firstWin+i*10});
  await rpc('history-fault',{...pages,enabled:true});
  const pageStage=stage(pages,1,5,pose(4),null,firstWin+2_000),pageIntent=intent(pageStage,0,1);
  assert.equal(await rpc('stage',{...pages,stage:pageStage}),'accepted');
  assert.equal(await rpc('submit',{...pages,intent:pageIntent}),null);
  assert.ok(await rpc<number>('history-failures',pages)>0);
  assert.equal((await rpc<Profile>('profile',pages)).progress.completed,0);
  assert.equal((await rpc<{cabEvents?:unknown}>('record',{...pages,eventId:pageStage.eventId})).cabEvents,undefined);
  await rpc('history-fault',{...pages,enabled:false});
  const complete=await rpc<DriverOutcome>('submit',{...pages,intent:pageIntent});success(complete);
  assert.equal(complete.delivery?.earnings[0].multiplier,1.5);
  assert.equal((await rpc<{cabEvents:{room:unknown[]}}>('record',{...pages,eventId:pageStage.eventId})).cabEvents.room.length,101);

  // Kill the process after profile commit but before the room receives its
  // reply; cached history and receipt must replay without a duplicate payout.
  const lost=entry();await acquire(lost);const lostAt=Date.now()-2_000;
  await rpc('room-win',{...lost,eventId:'published-win',at:lostAt-1_000});
  const observation=stage(lost,1,5,pose(4),null,lostAt),lostIntent=intent(observation,0,1);
  assert.equal(await rpc('stage',{...lost,stage:observation}),'accepted');await rpc('hold-profile',lost);
  const flight=rpc('submit',{...lost,intent:lostIntent},30_000);void flight.catch(()=>{});
  await until(()=>rpc<boolean>('profile-held',lost),'profile committed before lost reply');
  const before=await rpc<Profile>('profile',lost),journal=await rpc<{cabEvents?:unknown}>('record',{...lost,eventId:observation.eventId});
  assert.ok(journal.cabEvents,'complete event history is saved before commit');
  assert.equal(before.progress.completed,1);assert.equal((await rpc<string[]>('sources',lost)).length,1);
  await stop(child);child=undefined;child=start();await ready();
  await rpc('freeze',lost,15_000);
  const after=await rpc<Profile>('profile',lost);
  assert.equal(after.progress.cash,before.progress.cash);assert.equal(after.progress.eligibleIncome,before.progress.eligibleIncome);
  assert.deepEqual(await rpc('sources',lost),['earned-source:delivery:1:dropoff']);
  const newFence=randomUUID();await rpc('acquire',{...lost,fence:newFence});
  assert.equal((await rpc<Profile>('profile',lost)).progress.cash,before.progress.cash);

  // Both physical stops are accepted while historical settlement is held.
  // Kill the profile only after a non-final assignment checkpoint is durable.
  const assignmentCrash=entry(),assignmentInitial=await acquire(assignmentCrash),assignmentAt=Date.now()-2_000;
  await rpc('room-pending',{...assignmentCrash,eventId:'assignment-win',at:assignmentAt-1_000});
  const firstStop=stage(assignmentCrash,1,5,pose(4),null,assignmentAt);
  const preview=initialDelivery(firstStop.action.stop),priorOrder={...assignmentInitial.progress.order,elapsed:45};
  Object.assign(preview,{cash:assignmentInitial.progress.cash,lifetimeIncome:assignmentInitial.progress.eligibleIncome,
    earned:assignmentInitial.progress.earned,completed:assignmentInitial.progress.completed,level:assignmentInitial.progress.level,order:priorOrder});
  const previewParts=applyDeliveryStop(preview,firstStop.action.stop,part=>Math.round(part.amount*1.5));assert.ok(previewParts);
  const previewAwards=initialAchievements();previewAwards.unlocked=[...assignmentInitial.progress.unlocked];
  applyAcceptedDelivery(preview,previewAwards,assignmentInitial.progress.achievementTiers!,priorOrder,false,CUSTOMERS[4].id,true);
  for(let i=0;i<10_000&&preview.order.search;i++)advanceDeliverySearch(preview,false);
  assert.equal(preview.order.search,undefined);
  const pickup=RESTAURANTS[preview.order.restaurant],pickupY=terrainHeight(pickup.x,pickup.z);assert.notEqual(pickupY,null);
  const pickupPose:DeliveryStop={x:pickup.x,y:pickupY!,z:pickup.z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false};
  const laterStop=stage(assignmentCrash,2,6,pickupPose,2,assignmentAt+500);
  assert.equal(await rpc('stage',{...assignmentCrash,stage:firstStop}),'accepted');
  assert.equal(await rpc('submit',{...assignmentCrash,intent:intent(firstStop,0,1)}),null,'unknown rate stays pending');
  assert.equal(await rpc('stage',{...assignmentCrash,stage:laterStop}),'accepted');
  await rpc('hold-assignment',assignmentCrash);await rpc('room-resolve',{...assignmentCrash,eventId:'assignment-win'});
  const assignmentFlight=rpc('submit',{...assignmentCrash,intent:intent(firstStop,0,1)},30_000);void assignmentFlight.catch(()=>{});
  await until(()=>rpc<boolean>('assignment-held',assignmentCrash),'assignment checkpoint held');
  const checkpoint=await rpc<{done:boolean;version:number;searchVersion:number}>('assignment',{...assignmentCrash,eventId:firstStop.eventId});
  assert.equal(checkpoint.done,false);assert.ok(checkpoint.version>=1);assert.equal(checkpoint.searchVersion,DELIVERY_SEARCH_VERSION);
  assert.equal((await rpc<Profile>('profile',assignmentCrash)).progress.completed,0,'payout is not committed before assignment');
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',assignmentCrash,15_000);
  const assignmentRecovered=await rpc<Profile>('profile',assignmentCrash);
  assert.equal(assignmentRecovered.progress.completed,1);assert.equal(assignmentRecovered.progress.order.stage,'dropoff');
  assert.equal(assignmentRecovered.progress.order.search,undefined);
  assert.equal(assignmentRecovered.progress.earned,Math.round(baseFare*1.5)+2*pickupBonusFor({...preview.order,elapsed:1}));
  assert.equal(assignmentRecovered.progress.achievementTiers?.pickups.count,1);
  assert.deepEqual((await rpc<string[]>('sources',assignmentCrash)).sort(),['earned-source:delivery:1:dropoff','earned-source:delivery:2:pickup']);
  assert.equal(await rpc('assignment',{...assignmentCrash,eventId:firstStop.eventId}),null,'completed checkpoint is removed');

  // A checkpoint written before candidate ordering changed must discard its
  // old rank and leg on restart, without repeating the accepted payout.
  for(const [index,version] of [undefined,0].entries()){
    // A fresh Worker clears the previous case's prepared-search cache, so the
    // second case also reaches a non-final assignment checkpoint.
    if(index){await stop(child);child=undefined;child=start();await ready();}
    const legacyCrash=entry();await rpc('producer',{...legacyCrash,active:true});
    await rpc('acquire',{...legacyCrash,progress:offroadProgress});
    const legacyStop=stage(legacyCrash,1,0,pose(priorCustomer));
    assert.equal(await rpc('stage',{...legacyCrash,stage:legacyStop}),'accepted');
    // The room can already have observed a pickup from the old assignment.
    // If recovery chooses a different restaurant, that observation must not pay.
    const currentPickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-la-guera');assert.ok(currentPickup);
    const oldPickup=RESTAURANTS.find(place=>Math.hypot(place.x-currentPickup.x,place.z-currentPickup.z)>100);assert.ok(oldPickup);
    const oldPickupY=terrainHeight(oldPickup.x,oldPickup.z);assert.notEqual(oldPickupY,null);
    const laterPickup=stage(legacyCrash,2,1,{x:oldPickup.x,y:oldPickupY!,z:oldPickup.z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false});
    assert.equal(await rpc('stage',{...legacyCrash,stage:laterPickup}),'accepted');
    await rpc('hold-assignment',legacyCrash);
    const legacyFlight=rpc('submit',{...legacyCrash,intent:intent(legacyStop,0,1)},30_000);void legacyFlight.catch(()=>{});
    await until(()=>rpc<boolean>('assignment-held',legacyCrash),`legacy assignment checkpoint held (${version??'unversioned'})`);
    await rpc('legacy-assignment',{...legacyCrash,eventId:legacyStop.eventId,version});
    const oldCheckpoint=await rpc<{searchVersion?:number;delivery:{order:{search:{cursor:unknown}}}}>('assignment',{...legacyCrash,eventId:legacyStop.eventId});
    assert.equal(oldCheckpoint.searchVersion,version);
    assert.deepEqual(oldCheckpoint.delivery.order.search.cursor,{pair:128,leg:1,heading:0,...(version===undefined?{}:{version})});
    await stop(child);child=undefined;child=start();await ready();await rpc('freeze',legacyCrash,15_000);
    const legacyRecovered=await rpc<Profile>('profile',legacyCrash);
    assert.equal(legacyRecovered.progress.completed,6);
    assert.equal(RESTAURANTS[legacyRecovered.progress.order.restaurant].id,'south-san-francisco-la-guera');
    assert.equal(legacyRecovered.progress.order.customer,offroadCustomer,'the current ranking starts from its first pair');
    assert.equal(legacyRecovered.progress.order.stage,'pickup','an observation at the old pickup does not collect the reassigned order');
    assert.deepEqual((await rpc<string[]>('sources',legacyCrash)).sort(),['earned-source:delivery:6:checkpoint','earned-source:delivery:6:dropoff']);
    await rpc('freeze',legacyCrash,15_000);
    assert.deepEqual((await rpc<Profile>('profile',legacyCrash)).progress,legacyRecovered.progress,'recovery pays only once');
    assert.equal(await rpc('assignment',{...legacyCrash,eventId:legacyStop.eventId}),null);
  }

  // A pre-routing-update leg-one checkpoint must be revalidated after a restart;
  // replaying the accepted stop still pays only once.
  const legacyCrash=entry(),legacyInitial=await acquire(legacyCrash);
  const legacyPose={...pose(4),x:pose(4).x+.123456};
  const legacyPreview=initialDelivery(legacyPose),legacyPrior={...legacyInitial.progress.order,elapsed:45};
  Object.assign(legacyPreview,{cash:legacyInitial.progress.cash,lifetimeIncome:legacyInitial.progress.eligibleIncome,
    earned:legacyInitial.progress.earned,completed:legacyInitial.progress.completed,level:legacyInitial.progress.level,order:legacyPrior});
  assert.ok(applyDeliveryStop(legacyPreview,legacyPose));
  const legacyAwards=initialAchievements();legacyAwards.unlocked=[...legacyInitial.progress.unlocked];
  applyAcceptedDelivery(legacyPreview,legacyAwards,legacyInitial.progress.achievementTiers!,legacyPrior,false,CUSTOMERS[4].id,true);
  for(let i=0;i<10_000&&legacyPreview.order.search;i++)advanceDeliverySearch(legacyPreview,false);
  assert.equal(legacyPreview.order.search,undefined);
  const legacyStop=stage(legacyCrash,1,5,legacyPose,1,assignmentAt);
  assert.equal(await rpc('stage',{...legacyCrash,stage:legacyStop}),'accepted');
  await rpc('hold-assignment',legacyCrash);
  const legacyFlight=rpc('submit',{...legacyCrash,intent:intent(legacyStop,0,1)},30_000);void legacyFlight.catch(()=>{});
  await until(()=>rpc<boolean>('assignment-held',legacyCrash),'legacy assignment checkpoint held');
  await rpc('legacy-assignment',{...legacyCrash,eventId:legacyStop.eventId});
  const oldCheckpoint=await rpc<{searchVersion?:number;delivery:{order:{search:{cursor:unknown}}}}>('assignment',{...legacyCrash,eventId:legacyStop.eventId});
  assert.equal(oldCheckpoint.searchVersion,undefined);
  assert.deepEqual(oldCheckpoint.delivery.order.search.cursor,{pair:128,leg:1,heading:0});
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',legacyCrash,15_000);
  const legacyRecovered=await rpc<Profile>('profile',legacyCrash);
  assert.equal(legacyRecovered.progress.completed,1);
  assert.equal(legacyRecovered.progress.order.restaurant,legacyPreview.order.restaurant);
  assert.equal(legacyRecovered.progress.order.customer,legacyPreview.order.customer);
  assert.deepEqual(await rpc('sources',legacyCrash),['earned-source:delivery:1:dropoff']);
  await rpc('freeze',legacyCrash,15_000);
  assert.deepEqual((await rpc<Profile>('profile',legacyCrash)).progress,legacyRecovered.progress,'recovery pays only once');
  assert.equal(await rpc('assignment',{...legacyCrash,eventId:legacyStop.eventId}),null);

  // A completed checkpoint may also outlive its routing rules: interruption can occur
  // after assignment finishes but before the accepted payout commits.
  for(const [index,version] of [undefined,0,DELIVERY_SEARCH_VERSION].entries()){
    // Clear the prepared-search cache for each injected completed checkpoint.
    if(index){await stop(child);child=undefined;child=start();await ready();}
    const completedCrash=entry();await acquire(completedCrash);
    await rpc('room-win',{...completedCrash,eventId:'completed-checkpoint-win',at:assignmentAt-1_000});
    const completedStop=stage(completedCrash,1,5,legacyPose,null,assignmentAt);
    assert.equal(await rpc('stage',{...completedCrash,stage:completedStop}),'accepted');
    await rpc('hold-completed-assignment',completedCrash);
    const completedFlight=rpc('submit',{...completedCrash,intent:intent(completedStop,0,1)},30_000);void completedFlight.catch(()=>{});
    await until(()=>rpc<boolean>('assignment-held',completedCrash),`completed assignment checkpoint held (${version??'unversioned'})`);
    const beforeLegacy=await rpc<{done:boolean;context:string}>('assignment',{...completedCrash,eventId:completedStop.eventId});
    assert.equal(beforeLegacy.done,true);
    const savedRestaurant=(legacyPreview.order.restaurant+1)%RESTAURANTS.length;
    const savedCustomer=(legacyPreview.order.customer+1)%CUSTOMERS.length;
    await rpc('legacy-completed-assignment',{...completedCrash,eventId:completedStop.eventId,restaurant:savedRestaurant,customer:savedCustomer,version});
    const savedCheckpoint=await rpc<{done:boolean;context:string;searchVersion?:number;delivery:{order:Order}}>('assignment',{...completedCrash,eventId:completedStop.eventId});
    assert.equal(savedCheckpoint.done,true);assert.equal(savedCheckpoint.context,beforeLegacy.context);assert.equal(savedCheckpoint.searchVersion,version);
    assert.equal(savedCheckpoint.delivery.order.restaurant,savedRestaurant);assert.equal(savedCheckpoint.delivery.order.customer,savedCustomer);
    await stop(child);child=undefined;child=start();await ready();await rpc('freeze',completedCrash,15_000);
    const completedRecovered=await rpc<Profile>('profile',completedCrash);
    assert.equal(completedRecovered.progress.completed,1);
    assert.equal(completedRecovered.progress.cash,10_120+Math.round(baseFare*1.5)+350+100,'the captured room multiplier survives recovery');
    assert.equal(completedRecovered.progress.order.restaurant,version===DELIVERY_SEARCH_VERSION?savedRestaurant:legacyPreview.order.restaurant);
    assert.equal(completedRecovered.progress.order.customer,version===DELIVERY_SEARCH_VERSION?savedCustomer:legacyPreview.order.customer);
    assert.deepEqual(await rpc('sources',completedCrash),['earned-source:delivery:1:dropoff']);
    await rpc('freeze',completedCrash,15_000);
    assert.deepEqual((await rpc<Profile>('profile',completedCrash)).progress,completedRecovered.progress,'completed checkpoint replay pays once');
    assert.equal(await rpc('assignment',{...completedCrash,eventId:completedStop.eventId}),null);
  }

  // A ticket relocks an already-collected Oakland order. The later physical
  // dropoff is accepted while the replacement assignment is checkpointed.
  const relock=entry(),relockInitial=await acquire(relock);
  await rpc('persistent-producer',{...relock,active:true});
  const ticketEvidence={seconds:16,peakHeight:20,at:1,x:450,z:0,canFly:false};
  const relockTicket:TicketStage={eventId:randomUUID(),driverId:relock.driverId,fence:relock.fence,roomId:relock.room,walletOrder:1,clock:5,
    action:{kind:'ticket',evidence:ticketEvidence,orderBefore:relockInitial.progress.order,completedBefore:0}};
  const relockIntent:EconomyIntent={eventId:relockTicket.eventId,driverId:relock.driverId,fence:relock.fence,roomId:relock.room,
    revision:0,sequence:1,clock:relockTicket.clock,action:relockTicket.action};
  const relockPreview=initialDelivery(ticketEvidence);
  Object.assign(relockPreview,{cash:relockInitial.progress.cash,level:relockInitial.progress.level,tickets:relockInitial.progress.tickets,
    completed:relockInitial.progress.completed,order:{...relockInitial.progress.order,elapsed:45}});
  applyTicketEvidence(relockPreview,ticketEvidence);
  assert.equal(relockPreview.level,0);assert.equal(relockPreview.cash,9_976);
  assert.equal(rerouteInaccessibleOrder(relockPreview,ticketEvidence,false),true);
  for(let i=0;i<10_000&&relockPreview.order.search;i++)advanceDeliverySearch(relockPreview,false);
  assert.equal(relockPreview.order.search,undefined);
  assert.equal(relockPreview.order.stage,'dropoff');assert.equal(relockPreview.order.elapsed,45);
  assert.ok(isOrderAccessible(relockPreview.order,0,false));
  assert.notEqual(relockPreview.order.customer,relockInitial.progress.order.customer);
  const replacementStop=stage(relock,2,6,pose(relockPreview.order.customer),2);
  const replacementIntent=intent(replacementStop,1,2);
  assert.equal(await rpc('stage-ticket',{...relock,stage:relockTicket}),'accepted');
  await rpc('hold-assignment',relock);
  const ticketFlight=rpc('submit',{...relock,intent:relockIntent},30_000);void ticketFlight.catch(()=>{});
  await until(()=>rpc<boolean>('assignment-held',relock),'ticket assignment checkpoint held');
  const relockCheckpoint=await rpc<{done:boolean;version:number}>('assignment',{...relock,eventId:relockTicket.eventId});
  assert.equal(relockCheckpoint.done,false);assert.ok(relockCheckpoint.version>=1);
  const beforeTicketCommit=await rpc<Profile>('profile',relock);
  assert.equal(beforeTicketCommit.progress.tickets,0);assert.equal(beforeTicketCommit.progress.cash,10_120);
  assert.equal(await rpc('stage',{...relock,stage:replacementStop}),'accepted');
  await stop(child);child=undefined;child=start();await ready();
  const resolvedTicket=await rpc<DriverOutcome>('submit',{...relock,intent:relockIntent},15_000);success(resolvedTicket);
  assert.equal(resolvedTicket.progress.tickets,1);assert.equal(resolvedTicket.progress.cash,9_976);
  assert.equal(resolvedTicket.progress.level,0);assert.equal(resolvedTicket.progress.order.stage,'dropoff');
  assert.deepEqual(resolvedTicket.progress.order,relockPreview.order);
  assert.ok(resolvedTicket.assignment,'the recovered ticket reports the resolved assignment');
  assert.deepEqual(await rpc('sources',relock),[],'rerouting a collected order grants no pickup');
  const replacementPaid=await rpc<DriverOutcome>('submit',{...relock,intent:replacementIntent},15_000);success(replacementPaid);
  const replacementFare=2*payoutFor({...relockPreview.order,elapsed:46});
  assert.equal(replacementPaid.delivery?.matched,true);
  assert.equal(replacementPaid.progress.completed,1);assert.equal(replacementPaid.progress.tickets,1);
  assert.equal(replacementPaid.progress.earned,replacementFare);
  assert.deepEqual(await rpc('sources',relock),['earned-source:delivery:1:dropoff']);
  assert.deepEqual(await rpc('submit',{...relock,intent:replacementIntent},15_000),replacementPaid,'replaying the recovered dropoff pays once');
  await rpc('freeze',relock,15_000);
  assert.deepEqual((await rpc<Profile>('profile',relock)).progress,replacementPaid.progress);
  assert.deepEqual(await rpc('sources',relock),['earned-source:delivery:1:dropoff']);
  assert.equal(await rpc('assignment',{...relock,eventId:relockTicket.eventId}),null);

  // Acceptance survives a lost stage reply; a late stale producer cannot
  // insert after freeze sealed the old profile fence.
  const held=entry();await acquire(held);const staged=stage(held,1,5,pose(4));
  await rpc('hold-stage',held);const stagedFlight=rpc('stage',{...held,stage:staged},30_000);void stagedFlight.catch(()=>{});
  await until(()=>rpc<boolean>('stage-held',held),'stage accepted before lost reply');
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',held,15_000);
  assert.equal((await rpc<Profile>('profile',held)).progress.completed,1);
  const stale=entry();await acquire(stale);const staleStage=stage(stale,1,5,pose(4));
  await rpc('hold-fence',stale);const late=rpc<string>('stage',{...stale,stage:staleStage},20_000);
  await until(()=>rpc<boolean>('fence-held',stale),'stale fence check held');
  await rpc('freeze',stale,15_000);await rpc('release-fence',stale);
  assert.equal(await late,'superseded');
  assert.ok(!(await rpc<string[]>('keys',stale)).some(key=>key.startsWith(`delivery-stage:${stale.driverId}:`)));

  // A physical achievement after a rejected predecessor survives a crash at
  // accepted-stage reply. Replaying on a new fence cannot credit it twice.
  const achievement=entry();await rpc('producer',{...achievement,active:true});
  const achievementInitial=await rpc<{progress:DriverProgress}>('acquire',{...achievement,progress:{cash:49_500,level:1,order:order(),deliveryClock:0,unlocked:['region-oakland']}});
  const invalid:EconomyIntent={eventId:randomUUID(),driverId:achievement.driverId,fence:achievement.fence,roomId:achievement.room,
    revision:0,sequence:1,clock:0,action:{kind:'progress',progress:{...achievementInitial.progress,earned:-1}}};
  assert.deepEqual(await rpc('commit',{...achievement,intent:invalid}),{ok:false,reason:'invalid'});
  const evidence:AchievementStage={eventId:randomUUID(),driverId:achievement.driverId,fence:achievement.fence,roomId:achievement.room,
    walletOrder:2,clock:5,action:{kind:'achievement',evidence:{kind:'roof',roof:'ordinary'}}};
  await rpc('hold-stage',achievement);const evidenceFlight=rpc('stage-achievement',{...achievement,stage:evidence},30_000);void evidenceFlight.catch(()=>{});
  await until(()=>rpc<boolean>('stage-held',achievement),'achievement stage accepted before lost reply');
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',achievement,15_000);
  const awarded=await rpc<Profile>('profile',achievement);
  assert.equal(awarded.progress.cash,51_000);assert.equal(awarded.progress.eligibleIncome,1_500);
  assert.equal(awarded.progress.order.elapsed,45);assert.ok(awarded.progress.unlocked.includes('roof-rider'));
  assert.ok(awarded.progress.unlocked.includes('region-peninsula'),'achievement unlocks the balance cascade');
  const nextFence=randomUUID(),reattached=await rpc<Profile>('acquire',{...achievement,fence:nextFence});
  const repeated:AchievementStage={...evidence,eventId:randomUUID(),fence:nextFence,walletOrder:reattached.sequence+1,clock:6};
  assert.equal(await rpc('stage-achievement',{...achievement,stage:repeated}),'accepted');
  const repeatedIntent:EconomyIntent={eventId:repeated.eventId,driverId:repeated.driverId,fence:repeated.fence,roomId:repeated.roomId,
    revision:reattached.revision,sequence:reattached.sequence+1,clock:repeated.clock,action:repeated.action};
  const repeatedResult=await rpc<DriverOutcome>('submit',{...achievement,intent:repeatedIntent});success(repeatedResult);
  assert.deepEqual(repeatedResult.awards,[]);assert.equal(repeatedResult.progress.cash,51_000);
  console.log('delivery and achievement journal rejection, ordering, rate, crash and fencing integration passed');
}finally{
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}
