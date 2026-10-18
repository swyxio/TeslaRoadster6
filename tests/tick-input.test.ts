import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEUTRAL, type Input } from '../shared/game';
import { EDGE_LATE_TICKS, FUTURE_TICKS, HOLD_TICKS, INPUT_TIMEOUT_MS, ScheduledInput, type InputCommand } from '../shared/tick-input';

const input=(value:Partial<Input>={}):Input=>({...NEUTRAL,...value});
const command=(seq:number,targetTick:number,value:Partial<Input>={},controlRevision=0,actionSeq=0):InputCommand=>({seq,targetTick,controlRevision,actionSeq,input:input(value)});

test('ticks apply queued commands once and held controls expire after six ticks',()=>{
  const scheduler=new ScheduledInput(input());
  assert.deepEqual(scheduler.receive(command(1,2,{throttle:1,steer:.5}),0,0),{outcomes:[]});
  assert.deepEqual(scheduler.advance(1,25).input,input());
  assert.deepEqual(scheduler.advance(2,50).input,input({throttle:1,steer:.5}));
  for(let tick=3;tick<2+HOLD_TICKS;tick++)assert.equal(scheduler.advance(tick,tick*40).input.throttle,1);
  assert.equal(scheduler.snapshot().heldUntilTick,7);
  assert.deepEqual(scheduler.advance(8,280).input,input());
  const state=scheduler.snapshot();assert.equal(state.receivedSeq,1);assert.equal(state.appliedSeq,1);assert.deepEqual(state.queued,[]);
});

test('newer level commands supersede slots while distinct edges keep their order',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,3,{throttle:1,jump:1}),0,0);
  const superseded=scheduler.receive(command(2,3,{throttle:-1,jump:2}),0,1);
  assert.deepEqual(superseded.outcomes,[{kind:'jump',id:2,targetTick:4,status:'rescheduled'}]);
  scheduler.receive(command(3,5,{throttle:.7,flip:1}),0,2);
  const before=scheduler.receive(command(4,4,{throttle:.4,flip:2}),0,3);
  assert.deepEqual(before.outcomes,[{kind:'flip',id:2,targetTick:6,status:'rescheduled'}]);
  assert.deepEqual(scheduler.snapshot().queued.map(item=>item.seq),[2,4]);
  scheduler.advance(1,10);scheduler.advance(2,20);
  const a=scheduler.advance(3,30);assert.equal(a.input.throttle,-1);assert.equal(a.input.jump,1);
  assert.deepEqual(a.outcomes,[{kind:'jump',id:1,targetTick:3,status:'processed'}]);
  const b=scheduler.advance(4,40);assert.equal(b.input.throttle,.4);assert.equal(b.input.jump,2);
  assert.deepEqual(b.outcomes,[{kind:'jump',id:2,targetTick:4,status:'processed'}]);
  assert.deepEqual(scheduler.advance(5,50).outcomes,[{kind:'flip',id:1,targetTick:5,status:'processed'}]);
  assert.deepEqual(scheduler.advance(6,60).outcomes,[{kind:'flip',id:2,targetTick:6,status:'processed'}]);
  assert.equal(scheduler.snapshot().appliedSeq,4);
});

test('bounded tick window rejects continuous late or far-future input; near-late edge reschedules',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,10,{}),9,0);
  const late=scheduler.receive(command(2,10,{throttle:1,jump:1}),10,10);
  assert.deepEqual(late,{rejection:'late',outcomes:[{kind:'jump',id:1,targetTick:11,status:'rescheduled'}]});
  assert.deepEqual(scheduler.snapshot().jump.pending,[{id:1,targetTick:11}]);
  const step=scheduler.advance(11,20);
  assert.equal(step.input.throttle,0);assert.equal(step.input.jump,1);
  assert.deepEqual(step.outcomes,[{kind:'jump',id:1,targetTick:11,status:'processed'}]);
  const tooLate=scheduler.receive(command(3,11,{jump:2}),11+EDGE_LATE_TICKS+1,30);
  assert.deepEqual(tooLate,{rejection:'late',outcomes:[{kind:'jump',id:2,targetTick:11,status:'expired'}]});
  const far=20+FUTURE_TICKS+1;
  assert.deepEqual(scheduler.receive(command(4,far,{flip:1}),20,40),{rejection:'future',outcomes:[{kind:'flip',id:1,targetTick:far,status:'expired'}]});
  assert.equal(scheduler.snapshot().receivedSeq,4);
  assert.deepEqual(scheduler.receive(command(4,21,{jump:3}),20,50),{rejection:'order',outcomes:[]});
  assert.equal(scheduler.snapshot().jump.seen,2,'repeated sequence cannot inject an edge');
  assert.deepEqual(scheduler.receive(command(5,21,{jump:2,flip:1}),20,50),{outcomes:[]});
  assert.deepEqual(scheduler.snapshot().jump.pending,[]);assert.deepEqual(scheduler.snapshot().flip.pending,[]);
});

test('counter ordering handles duplicates, older values, wrap, and the ambiguous half range',()=>{
  const max=2**31-1,scheduler=new ScheduledInput(input({jump:max-1,flip:max}));
  scheduler.receive(command(1,1,{jump:max,flip:0}),0,0);
  scheduler.receive(command(2,2,{jump:0,flip:0}),0,1);
  scheduler.receive(command(3,3,{jump:max,flip:max}),0,2);
  scheduler.receive(command(4,4,{jump:2**30,flip:2**30}),0,3);
  assert.deepEqual(scheduler.snapshot().jump.pending,[{id:max,targetTick:1},{id:0,targetTick:2}]);
  assert.deepEqual(scheduler.snapshot().flip.pending,[{id:0,targetTick:1}]);
  const first=scheduler.advance(1,10);assert.equal(first.input.jump,max);assert.equal(first.input.flip,0);
  assert.deepEqual(first.outcomes.map(({kind,id})=>[kind,id]),[['jump',max],['flip',0]]);
  const second=scheduler.advance(2,20);assert.equal(second.input.jump,0);
  assert.deepEqual(second.outcomes,[{kind:'jump',id:0,targetTick:2,status:'processed'}]);
  assert.equal(scheduler.advance(3,30).outcomes.length,0);
});

test('timeout expires pending edges and neutralizes controls without replaying counters',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{throttle:1,jump:1}),0,0);
  scheduler.receive(command(2,5,{throttle:1,jump:2}),0,0);
  const first=scheduler.advance(1,50);assert.equal(first.input.jump,1);
  assert.equal(scheduler.advance(2,INPUT_TIMEOUT_MS).input.throttle,1,'exactly 300 ms is not expired');
  const timed=scheduler.advance(3,INPUT_TIMEOUT_MS+1);
  assert.deepEqual(timed.input,input({jump:1}));
  assert.deepEqual(timed.outcomes,[{kind:'jump',id:2,targetTick:5,status:'expired'}]);
  assert.deepEqual(scheduler.snapshot().queued,[]);
  scheduler.receive(command(3,4,{jump:2}),3,310);
  assert.deepEqual(scheduler.advance(4,320).input,input({jump:1}),'expired counter does not become a new press');
});

test('control invalidation clears queued inputs, preserves consumed/seen edges, and rejects old revision',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{jump:1}),0,0);scheduler.advance(1,10);
  scheduler.receive(command(2,3,{jump:2,flip:1,throttle:1}),1,11);
  const outcomes=scheduler.invalidate(input({jump:1}),{type:'relocation'});
  assert.deepEqual(outcomes,[{kind:'jump',id:2,targetTick:3,status:'superseded'},{kind:'flip',id:1,targetTick:3,status:'superseded'}]);
  assert.equal(scheduler.snapshot().revision,1);
  assert.deepEqual(scheduler.receive(command(3,2,{jump:3}),1,12),{rejection:'revision',outcomes:[{kind:'jump',id:3,targetTick:2,status:'expired'}]});
  scheduler.receive(command(4,2,{jump:2,flip:1},1),1,13);
  assert.deepEqual(scheduler.advance(2,20).input,input({jump:1}),'old seen counters do not fire on a new vehicle');
  scheduler.receive(command(5,3,{jump:4,flip:2},1),2,21);
  const active=scheduler.advance(3,30);
  assert.equal(active.input.jump,4);assert.equal(active.input.flip,2);assert.equal(active.outcomes.length,2);
});

test('an old-revision press expires and does not reappear after a reset',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.invalidate(input(),{type:'relocation'});
  assert.deepEqual(scheduler.receive(command(1,1,{jump:1}),0,10),{
    rejection:'revision',outcomes:[{kind:'jump',id:1,targetTick:1,status:'expired'}],
  });
  scheduler.receive(command(2,1,{jump:1},1),0,20);
  assert.deepEqual(scheduler.advance(1,30),{input:input(),outcomes:[]});
  scheduler.receive(command(3,2,{jump:2},1),1,40);
  assert.deepEqual(scheduler.advance(2,50).outcomes,[{kind:'jump',id:2,targetTick:2,status:'processed'}]);
});

test('queues are bounded and snapshot and returned inputs are independent copies',()=>{
  const scheduler=new ScheduledInput(input());
  for(let i=1;i<=FUTURE_TICKS;i++)scheduler.receive(command(i,i,{throttle:i/10,jump:i,flip:i}),0,i);
  const state=scheduler.snapshot();
  assert.equal(state.queued.length,FUTURE_TICKS);assert.equal(state.jump.pending.length,FUTURE_TICKS);assert.equal(state.flip.pending.length,FUTURE_TICKS);
  state.queued[0].input.throttle=-1;state.held.jump=100;state.jump.pending[0].id=100;
  const actual=scheduler.advance(1,20);assert.equal(actual.input.throttle,.1);assert.equal(actual.input.jump,1);
  actual.input.jump=100;assert.equal(scheduler.snapshot().held.jump,1);
});

test('a frame arriving after a wall-clock stall cannot revive older queued controls or edges',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{throttle:1}),0,0);
  scheduler.receive(command(2,5,{throttle:1,jump:1}),0,0);
  scheduler.advance(1,20);
  const resumed=scheduler.receive(command(3,6,{throttle:-1,jump:1}),1,INPUT_TIMEOUT_MS+1);
  assert.deepEqual(resumed.outcomes,[{kind:'jump',id:1,targetTick:5,status:'expired'}]);
  assert.deepEqual(scheduler.snapshot().queued.map(slot=>slot.seq),[3]);
  assert.deepEqual(scheduler.advance(2,INPUT_TIMEOUT_MS+2).input,input());
  assert.deepEqual(scheduler.advance(6,INPUT_TIMEOUT_MS+3).input,input({throttle:-1}));
});

test('a fresh near-late edge after a stall fires once while stale controls stay neutral',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{throttle:1}),0,0);scheduler.advance(1,10);
  const late=scheduler.receive(command(2,1,{throttle:1,jump:1}),1,INPUT_TIMEOUT_MS+1);
  assert.equal(late.rejection,'late');
  assert.deepEqual(scheduler.advance(2,INPUT_TIMEOUT_MS+2),{
    input:input({jump:1}),outcomes:[{kind:'jump',id:1,targetTick:2,status:'processed'}],
  });
});

test('a near-late edge does not extend an older continuous-control watchdog',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{throttle:1}),0,0);scheduler.advance(1,50);
  const late=scheduler.receive(command(2,1,{throttle:1,jump:1}),1,INPUT_TIMEOUT_MS-1);
  assert.equal(late.rejection,'late');
  assert.deepEqual(scheduler.advance(2,INPUT_TIMEOUT_MS+50),{
    input:input({jump:1}),outcomes:[{kind:'jump',id:1,targetTick:2,status:'processed'}],
  });
});

test('release applies on its target tick and older future intents cannot restore it',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,1,{throttle:1}),0,0);
  scheduler.receive(command(2,5,{throttle:1}),0,1);
  scheduler.advance(1,10);
  scheduler.receive(command(3,2),1,11);
  assert.equal(scheduler.advance(2,20).input.throttle,0);
  assert.equal(scheduler.advance(5,50).input.throttle,0);
  assert.equal(scheduler.snapshot().appliedSeq,3);
});

test('a newer near-late event follows an already queued future press',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,5,{jump:1}),0,0);
  const result=scheduler.receive(command(2,0,{jump:2}),0,1);
  assert.deepEqual(result,{rejection:'late',outcomes:[{kind:'jump',id:2,targetTick:6,status:'rescheduled'}]});
  assert.deepEqual(scheduler.advance(1,10).outcomes,[]);
  assert.deepEqual(scheduler.advance(5,50).outcomes,[{kind:'jump',id:1,targetTick:5,status:'processed'}]);
  assert.deepEqual(scheduler.advance(6,60).outcomes,[{kind:'jump',id:2,targetTick:6,status:'processed'}]);
  assert.equal(scheduler.snapshot().jump.processed,2);
});

test('old-revision traffic cannot refresh an expired watchdog',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.invalidate(input(),{type:'relocation'});
  scheduler.receive(command(1,1,{throttle:1},1),0,0);
  scheduler.advance(1,20);
  assert.equal(scheduler.receive(command(2,2,{},0),1,INPUT_TIMEOUT_MS+1).rejection,'revision');
  assert.deepEqual(scheduler.advance(2,INPUT_TIMEOUT_MS+1).input,input());
});

test('snapshot reconstruction deep-copies state and replays held, queued and edge steps identically',()=>{
  const server=new ScheduledInput(input());
  server.receive(command(1,1,{throttle:1,jump:1}),0,10);
  server.advance(1,50);
  server.receive(command(2,4,{steer:.5,jump:2}),1,60);
  server.receive(command(3,6,{throttle:-1,flip:1}),1,70);
  const snapshot=server.snapshot(),prediction=ScheduledInput.fromSnapshot(snapshot,80);
  assert.deepEqual(prediction.snapshot(),snapshot,'revision, sequence, held and queued state reconstruct exactly');
  snapshot.held.throttle=0;snapshot.queued[0].input.steer=-1;snapshot.jump.pending[0].id=100;
  assert.equal(prediction.snapshot().held.throttle,1);
  assert.equal(prediction.snapshot().queued[0].input.steer,.5);
  assert.equal(prediction.snapshot().jump.pending[0].id,2);
  for(let tick=2;tick<=6;tick++){
    const now=80+tick*20;
    assert.deepEqual(prediction.advance(tick,now),server.advance(tick,now),`tick ${tick}`);
  }
  prediction.receive(command(4,7,{steer:1,jump:3,flip:1}),6,220);
  assert.equal(server.snapshot().receivedSeq,3,'mutating the prediction cannot alter the server');
});

test('reconstructed invalidation preserves revision and seen/processed baselines without phantom edges',()=>{
  const server=new ScheduledInput(input());
  server.receive(command(1,1,{jump:1}),0,0);server.advance(1,10);
  server.receive(command(2,4,{jump:2}),1,20);
  server.invalidate(input({jump:1}),{type:'relocation'});
  const prediction=ScheduledInput.fromSnapshot(server.snapshot(),30);
  assert.equal(prediction.snapshot().revision,1);assert.equal(prediction.snapshot().receivedSeq,2);
  assert.equal(prediction.snapshot().jump.seen,2);assert.equal(prediction.snapshot().jump.processed,1);
  prediction.receive(command(3,2,{jump:2},1),1,31);
  const result=prediction.advance(2,40);
  assert.equal(result.input.jump,1);assert.deepEqual(result.outcomes,[]);
  prediction.receive(command(4,3,{jump:3},1),2,41);
  assert.deepEqual(prediction.advance(3,50).outcomes,[{kind:'jump',id:3,targetTick:3,status:'processed'}]);
});

test('snapshot reconstruction starts an approximate local watchdog at the supplied time',()=>{
  const server=new ScheduledInput(input());
  server.receive(command(1,3,{jump:1}),0,10);
  const prediction=ScheduledInput.fromSnapshot(server.snapshot(),1000);
  assert.equal(prediction.advance(1,1300).outcomes.length,0);
  const expired=prediction.advance(2,1301);
  assert.deepEqual(expired.outcomes,[{kind:'jump',id:1,targetTick:3,status:'expired'}]);
  assert.equal(server.snapshot().jump.pending.length,1,'prediction timeout is not authoritative');
});

test('accepted action consumes its baseline; rejected overlapping action retains two later presses',()=>{
  const scheduler=new ScheduledInput(input());
  assert.equal(scheduler.beginAction(1,{jump:1,flip:0}),true);
  scheduler.invalidate(input(),{type:'action',edgeBaseline:{jump:1,flip:0}});
  const first=scheduler.receive(command(1,1,{jump:2,throttle:1},0,1),0,25);
  assert.deepEqual(first,{rejection:'revision',outcomes:[{kind:'jump',id:2,targetTick:1,status:'accepted'}]});
  // The second reset is cooldown-rejected; recording its fence must not
  // consume the new baseline or cancel the already queued press.
  assert.equal(scheduler.beginAction(2,{jump:2,flip:0}),true);
  const second=scheduler.receive(command(2,1,{jump:3,throttle:1},0,2),0,85);
  assert.deepEqual(second,{rejection:'revision',outcomes:[{kind:'jump',id:3,targetTick:2,status:'rescheduled'}]});
  assert.deepEqual(scheduler.advance(1,90),{input:input({jump:2}),outcomes:[{kind:'jump',id:2,targetTick:1,status:'processed'}]});
  assert.deepEqual(scheduler.advance(2,100),{input:input({jump:3}),outcomes:[{kind:'jump',id:3,targetTick:2,status:'processed'}]});
  scheduler.receive(command(3,3,{jump:3},1,2),2,110);
  assert.deepEqual(scheduler.advance(3,120).outcomes,[],'held counter cannot repeat either press');
});

test('an unseen pre-action press is consumed by an accepted action and cannot replay',()=>{
  const scheduler=new ScheduledInput(input());
  assert.equal(scheduler.beginAction(1,{jump:1,flip:0}),true);
  scheduler.invalidate(input(),{type:'action',edgeBaseline:{jump:1,flip:0}});
  assert.deepEqual(scheduler.receive(command(1,1,{jump:1},0,1),0,10),{rejection:'revision',outcomes:[]});
  assert.deepEqual(scheduler.receive(command(2,1,{jump:1},1,1),0,20),{outcomes:[]});
  assert.deepEqual(scheduler.advance(1,30),{input:input(),outcomes:[]});
});

test('an autonomous relocation closes the stale bridge even after later actions',()=>{
  const scheduler=new ScheduledInput(input());
  assert.equal(scheduler.beginAction(1,{jump:0,flip:0}),true);
  scheduler.invalidate(input(),{type:'action',edgeBaseline:{jump:0,flip:0}});
  scheduler.invalidate(input(),{type:'relocation'});
  assert.equal(scheduler.snapshot().edgeFloorRevision,2);
  assert.equal(scheduler.beginAction(2,{jump:0,flip:0}),true);
  scheduler.invalidate(input(),{type:'action',edgeBaseline:{jump:0,flip:0}});
  const old=scheduler.receive(command(1,1,{jump:1},0,2),0,10);
  assert.deepEqual(old,{rejection:'revision',outcomes:[{kind:'jump',id:1,targetTick:1,status:'expired'}]});
  const eligible=scheduler.receive(command(2,1,{jump:2},2,2),0,20);
  assert.deepEqual(eligible,{rejection:'revision',outcomes:[{kind:'jump',id:2,targetTick:1,status:'accepted'}]});
  assert.deepEqual(scheduler.advance(1,30).outcomes,[{kind:'jump',id:2,targetTick:1,status:'processed'}]);
});

test('action fences and modular baselines reject backward, ambiguous and duplicate values',()=>{
  const max=2**31-1,scheduler=new ScheduledInput(input({jump:max}));
  assert.equal(scheduler.beginAction(1,{jump:0,flip:0}),true,'wrap forward is valid');
  scheduler.invalidate(input({jump:max}),{type:'action',edgeBaseline:{jump:0,flip:0}});
  assert.equal(scheduler.beginAction(1,{jump:0,flip:0}),false,'duplicate sequence');
  assert.equal(scheduler.beginAction(2,{jump:max,flip:0}),false,'backward baseline');
  assert.equal(scheduler.beginAction(2,{jump:2**30,flip:0}),false,'half-range is ambiguous');
  assert.equal(scheduler.beginAction(2,{jump:0,flip:0}),true);
  const mismatch=scheduler.receive(command(1,1,{jump:1},1,1),0,10);
  assert.deepEqual(mismatch,{rejection:'action',outcomes:[{kind:'jump',id:1,targetTick:1,status:'expired'}]});
  assert.deepEqual(scheduler.receive(command(1,1,{jump:2},1,2),0,11),{rejection:'order',outcomes:[]});
  assert.deepEqual(scheduler.receive(command(2,1,{jump:1},1,2),0,12),{outcomes:[]});
});

test('each queued edge has a bounded age even while duplicate level frames arrive',()=>{
  const scheduler=new ScheduledInput(input());
  scheduler.receive(command(1,5,{jump:1}),0,0);
  scheduler.receive(command(2,5,{jump:1,throttle:1}),0,200);
  const result=scheduler.receive(command(3,5,{jump:1,throttle:1}),0,301);
  assert.deepEqual(result.outcomes,[{kind:'jump',id:1,targetTick:5,status:'expired'}]);
  assert.equal(scheduler.snapshot().jump.pending.length,0);
});

test('same-tick edge bursts reserve at most eight ticks and expire overflow',()=>{
  const scheduler=new ScheduledInput(input());
  for(let id=1;id<=FUTURE_TICKS;id++){
    const result=scheduler.receive(command(id,1,{jump:id}),0,id);
    assert.deepEqual(result.outcomes,id===1?[]:[{kind:'jump',id,targetTick:id,status:'rescheduled'}]);
  }
  assert.deepEqual(scheduler.receive(command(9,1,{jump:9}),0,9).outcomes,[{kind:'jump',id:9,targetTick:1,status:'expired'}]);
  assert.equal(scheduler.snapshot().jump.pending.length,FUTURE_TICKS);
});
