// Local Wrangler integration of durable cab intervals with complete event history.
// pnpm exec tsx tests/cybercab-events.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { CabIncomeStage, TicketStage } from '../worker/room-economy';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-events-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-cab-events-test',main:resolve('tests/fixtures/cybercab-events-worker.ts'),compatibility_date:'2026-10-17',
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
type RecordState={revision:number;sequence:number;progress:DriverProgress};
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}

try{
  child=start();await ready();
  const room=`cab-events-${randomUUID().slice(0,8)}`,driverId=randomUUID(),fence=randomUUID();
  const common={room,driverId};
  // 101 contiguous 30-minute events force two global history pages. The room
  // win straddles the first global start: room-only, combined, global-only,
  // and unboosted portions all occur within this staged batch.
  const duration=1_800_000,first=Date.now()-103*duration-1_000_000,last=first+101*duration;
  const startMs=first-600_001,endMs=last+241;
  await rpc('seed-global',{at:first,count:101});
  await rpc('room-win',{room,at:first-300_000});
  await rpc('producer',{room,active:true});
  await rpc('acquire',{...common,fence});
  const buy:EconomyIntent={eventId:randomUUID(),driverId,fence,roomId:room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
  const bought=await rpc<DriverOutcome>('buy',{...common,intent:buy});success(bought);
  assert.equal(bought.progress.eligibleIncome,5_000);
  await until(async()=>await rpc<number>('total')===5_000,'initial income outbox');

  const stage:CabIncomeStage={eventId:randomUUID(),driverId,fence,roomId:room,sequence:1,intervals:[
    {assetId:'cab-a',startMs,endMs:last},{assetId:'cab-a',startMs:last,endMs},
  ]};
  const intent:EconomyIntent={eventId:stage.eventId,driverId,fence,roomId:room,revision:1,sequence:2,action:{kind:'cab-income',intervals:stage.intervals}};
  assert.equal(await rpc('stage',{...common,stage}),'accepted');
  await rpc('global-fault',{enabled:true});
  assert.equal(await rpc('submit',{...common,intent}),null,'failed later history page does not pay');
  assert.ok((await rpc<{calls:number;failures:number}>('global-stats')).failures>=1,'the second page was reached');
  const failed=await rpc<RecordState>('profile',common),pending=await rpc<{cabEvents?:unknown;outcome:unknown}>('record',{...common,eventId:stage.eventId});
  assert.equal(failed.progress.cash,bought.progress.cash);assert.equal(failed.progress.eligibleIncome,5_000);
  assert.equal(failed.progress.cybercabs!.assets[0].gross,0);assert.equal(failed.sequence,1);
  assert.equal(pending.outcome,null);assert.equal(pending.cabEvents,undefined,'partial history is not persisted as complete');
  await pause(600);assert.equal(await rpc<number>('total'),5_000,'no partial payout reaches the global outbox');

  // After all pages succeed, crash after the profile transaction but before
  // its room receives the reply. The durable receipt and resolved windows
  // must reconcile on restart without paying the interval or milestone twice.
  await rpc('arm',common);await rpc('income-block',{blocked:true});await rpc('global-fault',{enabled:false});
  const submitting=rpc('submit',{...common,intent},30_000);void submitting.catch(()=>{});
  await until(()=>rpc<boolean>('held',common),'committed profile reply held');
  const afterCommit=await rpc<RecordState>('profile',common);
  const journal=await rpc<{outcome:unknown;cabEvents:{room:unknown[];global:unknown[]}}>('record',{...common,eventId:stage.eventId});
  assert.equal(journal.outcome,null);assert.equal(journal.cabEvents.room.length,1);assert.equal(journal.cabEvents.global.length,101);
  assert.equal(await rpc('stage',{...common,stage}),'accepted','stage retry after atomic conversion finds the same journal entry');
  assert.equal(await rpc('stage',{...common,stage:{...stage,sequence:2}}),'conflict','the converted stage retains its ordinal');
  assert.ok((await rpc<string[]>('keys',common)).includes(`pending:${driverId}:${stage.eventId}`));
  const weighted=2n*300_001n+3n*300_000n+6n*300_000n+4n*BigInt(101*duration-300_000)+2n*241n;
  const numerator=15_000n*weighted,gross=Number(numerator/7_200_000n),remainder=Number(numerator%7_200_000n);
  assert.deepEqual([afterCommit.progress.cybercabs!.assets[0].gross,afterCommit.progress.cybercabs!.assets[0].remainder,
    afterCommit.progress.cybercabs!.assets[0].lastEndMs,afterCommit.progress.cybercabs!.assets[0].revenueAwarded],
    [gross,remainder,endMs,true]);
  assert.equal(afterCommit.progress.cash,bought.progress.cash+gross+2_000);
  assert.equal(afterCommit.progress.eligibleIncome,5_000+gross+2_000);
  await until(async()=>await rpc<number>('income-failures')>0,'income outbox failure');
  assert.equal(await rpc<number>('total'),5_000,'failed outbox remains pending');
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>!(await rpc<string[]>('keys',common)).includes(`pending:${driverId}:${stage.eventId}`),'lost reply recovery');
  await until(async()=>!(await rpc<string[]>('keys',common)).some(key=>
    key===`intent:${stage.eventId}`||['pending:','unacked:','cleanup:','cab-stage:'].some(prefix=>key.startsWith(`${prefix}${driverId}:`))),
  'recovered journal cleanup');
  await until(async()=>await rpc<number>('total')===5_000+gross+2_000,'recovered global outbox');
  const recovered=await rpc<RecordState>('profile',common);
  assert.equal(recovered.progress.cash,afterCommit.progress.cash);
  assert.equal(recovered.progress.eligibleIncome,afterCommit.progress.eligibleIncome);
  assert.deepEqual(recovered.progress.cybercabs,afterCommit.progress.cybercabs);
  await pause(1_200);
  assert.equal((await rpc<RecordState>('profile',common)).progress.cash,afterCommit.progress.cash);
  assert.equal(await rpc<number>('total'),5_000+gross+2_000,'retry does not double-credit global income');

  // The actual session leaves its sub-checkpoint tail volatile. Once its stage
  // transaction is accepted, a crash before the reply must recover it once.
  const liveRoom=`cab-live-${randomUUID().slice(0,8)}`,liveDriver=randomUUID(),liveFence=randomUUID(),live={room:liveRoom,driverId:liveDriver};
  const tailRoom=`cab-tail-${randomUUID().slice(0,8)}`,tailDriver=randomUUID(),tailFence=randomUUID(),tail={room:tailRoom,driverId:tailDriver};
  for(const [entry,driver,fence] of [[live,liveDriver,liveFence],[tail,tailDriver,tailFence]] as const){
    await rpc('producer',{room:entry.room,active:true});await rpc('acquire',{...entry,fence});
    const buyCab:EconomyIntent={eventId:randomUUID(),driverId:driver,fence,roomId:entry.room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
    const purchased=await rpc<DriverOutcome>('buy',{...entry,intent:buyCab});success(purchased);
  }
  // Use fixed fixture timestamps so both intervals are auditable.
  const observedStart=Date.now()-5_000;
  for(const [entry,fence] of [[live,liveFence],[tail,tailFence]] as const){
    const profile=await rpc<RecordState>('profile',entry);
    await rpc('start-session',{...entry,fence,progress:profile.progress,start:observedStart});
    await rpc('session-ticks',{...entry,start:observedStart,count:9});
    assert.ok(!(await rpc<string[]>('keys',entry)).some(key=>key.startsWith(`cab-stage:${entry.driverId}:`)),
      '900 ms of observed activity is still an open, volatile tail');
  }
  await rpc('hold-stage',live);
  await rpc('session-ticks',{...live,start:observedStart+900,count:1});
  await until(()=>rpc<boolean>('stage-held',live),'one-second session stage accepted before its reply');
  assert.ok((await rpc<string[]>('keys',live)).some(key=>key.startsWith(`cab-stage:${liveDriver}:`)));
  await stop(child);child=undefined;child=start();await ready();
  await rpc('freeze',{...live,fence:liveFence},15_000);await rpc('freeze',{...tail,fence:tailFence},15_000);
  const liveRecovered=await rpc<RecordState>('profile',live),tailRecovered=await rpc<RecordState>('profile',tail);
  assert.equal(liveRecovered.progress.cybercabs!.assets[0].gross,4);
  assert.equal(liveRecovered.progress.cybercabs!.assets[0].remainder,1_200_000);
  assert.equal(liveRecovered.progress.cybercabs!.assets[0].lastEndMs,observedStart+1_000);
  assert.equal(tailRecovered.progress.cybercabs!.assets[0].gross,0,'the unaccepted open tail cannot be reconstructed after crash');
  await rpc('acquire',{...live,fence:randomUUID()});
  assert.equal((await rpc<RecordState>('profile',live)).progress.cybercabs!.assets[0].gross,4,'reconnect cannot double-credit the accepted stage');

  // Keep a rejecting wallet predecessor in flight, capture an actual police
  // stop, and crash after its durable stage but before the reply. Test both
  // sides of a cab history delay: wallet assignment, not observation time,
  // decides whether the cab credit precedes the fine and the level reroute.
  const ordered=[] as {room:string;driverId:string;fence:string;mode:'cab-first'|'ticket-first';start:number}[];
  for(const mode of ['cab-first','ticket-first'] as const){
    const room=`ticket-${randomUUID().slice(0,8)}`,driverId=randomUUID(),fence=randomUUID(),entry={room,driverId,fence,mode,start:Date.now()-5_000};
    ordered.push(entry);await rpc('producer',{room,active:true});await rpc('acquire',entry);
    const buyCab:EconomyIntent={eventId:randomUUID(),driverId,fence,roomId:room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
    const purchased=await rpc<DriverOutcome>('buy',{...entry,intent:buyCab});success(purchased);
    const progress=structuredClone(purchased.progress);progress.cash=10_109;progress.level=1;
    progress.order={...progress.order,stage:'dropoff',customer:4};
    const seed:EconomyIntent={eventId:randomUUID(),driverId,fence,roomId:room,revision:1,sequence:2,action:{kind:'progress',progress}};
    const seeded=await rpc<DriverOutcome>('buy',{...entry,intent:seed});success(seeded);
    await rpc('start-session',{...entry,progress:seeded.progress,revision:2,sequence:2});
    await rpc('hold-head',entry);await rpc('reject-head',entry);
    await until(()=>rpc<boolean>('head-held',entry),`${mode} rejected predecessor held`);
    if(mode==='ticket-first')await rpc('hold-prepare',entry);
    await rpc('session-ticks',{...entry,count:10});
    if(mode==='ticket-first')await until(()=>rpc<boolean>('prepare-held',entry),'cab history held before wallet assignment');
    else await until(async()=> (await rpc<string[]>('keys',entry)).some(key=>key.startsWith(`cab-order:${driverId}:`)),'cab wallet assignment persisted');
    await rpc('hold-ticket',entry);
    assert.deepEqual(await rpc('ticket',entry),{stopped:true});
    await until(()=>rpc<boolean>('ticket-held',entry),`${mode} ticket accepted before its reply`);
    assert.ok((await rpc<string[]>('keys',entry)).some(key=>key.startsWith(`ticket-stage:${driverId}:`)));
  }
  await stop(child);child=undefined;child=start();await ready();
  for(const entry of ordered){
    await rpc('freeze',entry,15_000);
    const saved=await rpc<RecordState>('profile',entry);
    assert.equal(saved.progress.cash,10_001,`${entry.mode}: rejected debit stays absent and cab/fine settle once`);
    assert.equal(saved.progress.tickets,1,`${entry.mode}: the physical stop survives restart`);
    assert.equal(saved.progress.cybercabs!.assets[0].gross,4);
    if(entry.mode==='cab-first')assert.equal(saved.progress.order.customer,4,'credit before the fine keeps the Oakland order eligible');
    else assert.notEqual(saved.progress.order.customer,4,'fine before the delayed credit reroutes the order');
    await rpc('acquire',{...entry,fence:randomUUID()});
    const replay=await rpc<RecordState>('profile',entry);
    assert.equal(replay.progress.cash,10_001);assert.equal(replay.progress.tickets,1,'fence handoff cannot duplicate the stop');
  }

  // A delayed retry after acknowledgement cannot recreate an already-paid
  // police stop with a new profile sequence.
  const retryRoom=`ticket-retry-${randomUUID().slice(0,8)}`,retryDriver=randomUUID(),retryFence=randomUUID(),retry={room:retryRoom,driverId:retryDriver,fence:retryFence};
  await rpc('producer',{room:retryRoom,active:true});
  const acquired=await rpc<{progress:DriverProgress}>('acquire',retry);
  const ticket:TicketStage={eventId:randomUUID(),driverId:retryDriver,fence:retryFence,roomId:retryRoom,walletOrder:1,
    action:{kind:'ticket',evidence:{seconds:8,peakHeight:20,at:1,x:0,z:0,canFly:false},orderBefore:acquired.progress.order,completedBefore:acquired.progress.completed}};
  const ticketIntent:EconomyIntent={eventId:ticket.eventId,driverId:retryDriver,fence:retryFence,roomId:retryRoom,revision:0,sequence:1,action:ticket.action};
  assert.equal(await rpc('stage-ticket',{...retry,stage:ticket}),'accepted');
  const charged=await rpc<DriverOutcome>('submit',{...retry,intent:ticketIntent});success(charged);
  assert.equal(charged.progress.tickets,1);assert.equal(await rpc('acknowledge',{...retry,intent:ticketIntent}),true);
  assert.equal(await rpc('stage-ticket',{...retry,stage:ticket}),'superseded');
  assert.ok(!(await rpc<string[]>('keys',retry)).some(key=>key.startsWith(`ticket-stage:${retryDriver}:`)));
  await rpc('freeze',retry,15_000);
  assert.equal((await rpc<RecordState>('profile',retry)).progress.tickets,1,'a stale stage retry cannot charge twice');

  // Stage order is independent of wallet sequence. A missing ordinal must not
  // be skipped, even after the durable high watermark survives a restart.
  const gapRoom=`cab-gap-${randomUUID().slice(0,8)}`,gapDriver=randomUUID(),gapFence=randomUUID(),gap={room:gapRoom,driverId:gapDriver};
  await rpc('persistent-producer',{room:gapRoom,active:true});await rpc('acquire',{...gap,fence:gapFence});
  const gapBuy:EconomyIntent={eventId:randomUUID(),driverId:gapDriver,fence:gapFence,roomId:gapRoom,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
  success(await rpc<DriverOutcome>('buy',{...gap,intent:gapBuy}));
  const batch=(sequence:number,startMs:number,endMs:number):CabIncomeStage=>({eventId:randomUUID(),driverId:gapDriver,fence:gapFence,roomId:gapRoom,sequence,intervals:[{assetId:'cab-a',startMs,endMs}]});
  const one=batch(1,0,240),two=batch(2,240,480),three=batch(3,480,720);
  assert.equal(await rpc('stage',{...gap,stage:two}),'conflict');
  assert.equal(await rpc('stage',{...gap,stage:one}),'accepted');
  assert.equal(await rpc('stage',{...gap,stage:three}),'conflict');
  await stop(child);child=undefined;child=start();await ready();
  assert.equal(await rpc('stage',{...gap,stage:three}),'conflict','restart cannot skip a missing stage');
  assert.equal((await rpc<RecordState>('profile',gap)).progress.cybercabs!.assets[0].lastEndMs,0);
  assert.ok(!(await rpc<string[]>('keys',gap)).includes(`cab-stage:${gapDriver}:${three.eventId}`));
  assert.equal(await rpc('stage',{...gap,stage:two}),'accepted');
  await rpc('freeze',{...gap,fence:gapFence},15_000);
  const gapResult=await rpc<RecordState>('profile',gap);
  assert.equal(gapResult.progress.cybercabs!.assets[0].lastEndMs,480);
  assert.equal(gapResult.progress.cybercabs!.assets[0].gross,2);
  // A freeze racing a staged request must settle an acceptance even when its
  // caller has not yet received the reply.
  const raceRoom=`cab-race-${randomUUID().slice(0,8)}`,raceDriver=randomUUID(),raceFence=randomUUID(),race={room:raceRoom,driverId:raceDriver};
  await rpc('persistent-producer',{room:raceRoom,active:true});await rpc('acquire',{...race,fence:raceFence});
  const raceBuy:EconomyIntent={eventId:randomUUID(),driverId:raceDriver,fence:raceFence,roomId:raceRoom,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
  success(await rpc<DriverOutcome>('buy',{...race,intent:raceBuy}));
  const raceStage:CabIncomeStage={eventId:randomUUID(),driverId:raceDriver,fence:raceFence,roomId:raceRoom,sequence:1,intervals:[{assetId:'cab-a',startMs:0,endMs:240}]};
  await rpc('hold-stage',race);
  const stageReply=rpc('stage',{...race,stage:raceStage},15_000);
  await until(()=>rpc<boolean>('stage-held',race),'stage accepted before its reply');
  await rpc('freeze',{...race,fence:raceFence},15_000);
  await rpc('release-stage',race);assert.equal(await stageReply,'accepted');
  const raceResult=await rpc<RecordState>('profile',race);
  assert.equal(raceResult.progress.cybercabs!.assets[0].gross,1);
  assert.equal(raceResult.progress.cybercabs!.assets[0].lastEndMs,240);
  assert.equal(await rpc('stage',{...race,stage:raceStage}),'superseded');
  const lateRoom=`cab-late-${randomUUID().slice(0,8)}`,lateDriver=randomUUID(),lateFence=randomUUID(),late={room:lateRoom,driverId:lateDriver};
  await rpc('acquire',{...late,fence:lateFence});
  const lateStage:CabIncomeStage={eventId:randomUUID(),driverId:lateDriver,fence:lateFence,roomId:lateRoom,sequence:1,intervals:[{assetId:'cab-a',startMs:0,endMs:240}]};
  await rpc('hold-fence',late);
  const lateReply=rpc('stage',{...late,stage:lateStage},15_000);
  await until(()=>rpc<boolean>('fence-held',late),'pre-insertion fence check held');
  await rpc('freeze',{...late,fence:lateFence},15_000);
  await rpc('release-fence',late);assert.equal(await lateReply,'superseded');
  const lateKeys=await rpc<string[]>('keys',late);
  assert.ok(!lateKeys.includes(`cab-stage:${lateDriver}:${lateStage.eventId}`));
  assert.ok(!lateKeys.includes(`cab-stage-high:${lateDriver}:${lateFence}`),'a late rejected stage cannot leak its high watermark');
  assert.ok(lateKeys.includes(`closed-fence:${lateDriver}:${lateFence}`),'the completed fence retains its insertion tombstone');

  // The same delayed first check cannot insert a ticket after the old fence
  // was sealed, even though that check returns the stale pre-freeze result.
  const ticketLateRoom=`ticket-late-${randomUUID().slice(0,8)}`,ticketLateDriver=randomUUID(),ticketLateFence=randomUUID();
  const ticketLate={room:ticketLateRoom,driverId:ticketLateDriver,fence:ticketLateFence};
  const ticketLateProfile=await rpc<{progress:DriverProgress}>('acquire',ticketLate);
  const ticketLateStage:TicketStage={eventId:randomUUID(),driverId:ticketLateDriver,fence:ticketLateFence,roomId:ticketLateRoom,walletOrder:1,
    action:{kind:'ticket',evidence:{seconds:8,peakHeight:20,at:1,x:0,z:0,canFly:false},orderBefore:ticketLateProfile.progress.order,completedBefore:ticketLateProfile.progress.completed}};
  await rpc('hold-fence',ticketLate);
  const ticketLateReply=rpc('stage-ticket',{...ticketLate,stage:ticketLateStage},15_000);
  await until(()=>rpc<boolean>('fence-held',ticketLate),'ticket pre-insertion fence check held');
  await rpc('freeze',ticketLate,15_000);await rpc('release-fence',ticketLate);
  assert.equal(await ticketLateReply,'superseded');
  const ticketLateKeys=await rpc<string[]>('keys',ticketLate);
  assert.ok(ticketLateKeys.includes(`closed-fence:${ticketLateDriver}:${ticketLateFence}`));
  assert.ok(!ticketLateKeys.includes(`ticket-stage:${ticketLateDriver}:${ticketLateStage.eventId}`));

  // Kill with the second fence check held after journal insertion. Freeze must
  // adopt each row before sealing, despite the lost acknowledgement.
  const adopted=[] as {room:string;driverId:string;fence:string;kind:'cab'|'ticket'}[];
  for(const kind of ['cab','ticket'] as const){
    const entry={room:`postcheck-${kind}-${randomUUID().slice(0,8)}`,driverId:randomUUID(),fence:randomUUID(),kind};
    adopted.push(entry);await rpc('persistent-producer',{room:entry.room,active:true});
    const initial=await rpc<{progress:DriverProgress}>('acquire',entry);
    let staged:Promise<unknown>;
    if(kind==='cab'){
      const purchase:EconomyIntent={eventId:randomUUID(),driverId:entry.driverId,fence:entry.fence,roomId:entry.room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
      success(await rpc<DriverOutcome>('buy',{...entry,intent:purchase}));
      const stage:CabIncomeStage={eventId:randomUUID(),driverId:entry.driverId,fence:entry.fence,roomId:entry.room,sequence:1,intervals:[{assetId:'cab-a',startMs:0,endMs:240}]};
      await rpc('hold-fence',{...entry,skip:1});staged=rpc('stage',{...entry,stage},30_000);
    }else{
      const stage:TicketStage={eventId:randomUUID(),driverId:entry.driverId,fence:entry.fence,roomId:entry.room,walletOrder:1,
        action:{kind:'ticket',evidence:{seconds:8,peakHeight:20,at:1,x:0,z:0,canFly:false},orderBefore:initial.progress.order,completedBefore:initial.progress.completed}};
      await rpc('hold-fence',{...entry,skip:1});staged=rpc('stage-ticket',{...entry,stage},30_000);
    }
    void staged.catch(()=>{});
    await until(()=>rpc<boolean>('fence-held',entry),`${kind} post-insertion fence check held`);
    assert.ok((await rpc<string[]>('keys',entry)).some(key=>key.startsWith(`${kind==='cab'?'cab-stage':'ticket-stage'}:${entry.driverId}:`)));
    await rpc('freeze',entry,15_000);
  }
  await stop(child);child=undefined;child=start();await ready();
  for(const [entry,closedFence] of [[late,lateFence],[ticketLate,ticketLateFence]] as const){
    const before=await rpc<string[]>('keys',entry);
    assert.ok(before.includes(`closed-fence:${entry.driverId}:${closedFence}`));
    assert.ok(!before.some(key=>key.startsWith(`cab-stage:${entry.driverId}:`)||key.startsWith(`ticket-stage:${entry.driverId}:`)));
    await rpc('acquire',{...entry,fence:randomUUID()});
  }
  for(const entry of adopted){
    const saved=await rpc<RecordState>('profile',entry);
    assert.equal(entry.kind==='cab'?saved.progress.cybercabs!.assets[0].gross:saved.progress.tickets,1,`${entry.kind} stage was adopted once`);
    await rpc('acquire',{...entry,fence:randomUUID()});
    const after=await rpc<RecordState>('profile',entry);
    assert.equal(entry.kind==='cab'?after.progress.cybercabs!.assets[0].gross:after.progress.tickets,1,`${entry.kind} restart cannot duplicate work`);
  }
  console.log('PASS: complete global history, room/global bonuses, exact remainder, milestone, lost reply and income outbox recovery.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}
