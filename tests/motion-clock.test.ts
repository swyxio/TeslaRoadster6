import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionClock } from '../src/motion-clock';

test('motion clock follows completed ticks, bounds lead, and stops on stale state',()=>{
  const clock=new MotionClock();
  assert.equal(clock.target(0),null);
  assert.equal(clock.observe(100,0),true);
  assert.equal(clock.target(0),103);
  clock.observe(102,100);clock.observeTurnaround(200);
  const target=clock.target(150)!;
  assert.ok(target>=103&&target<=110,'the visual clock approaches its new lead smoothly');
  clock.observeTurnaround(800);
  assert.ok(clock.inputTarget(400)!<=110,'commands stay within the accepted future window');
  assert.ok(clock.target(400)!<=114,'visual replay has a separate bounded horizon');
  assert.equal(clock.target(601),null);
  assert.equal(clock.observe(101,602),false,'old server ticks cannot move the clock backwards');
  clock.reset();assert.equal(clock.estimate(700),null);
});

test('motion clock tracks a slow server rather than inventing real-time ticks',()=>{
  const clock=new MotionClock();clock.observe(10,0);clock.observe(12,250);clock.observe(14,500);
  assert.equal(clock.estimate(600),14.8);
  assert.equal(clock.estimate(1250),20,'unconfirmed extrapolation is capped');
  assert.equal(clock.observe(15,400),false,'out-of-order receipt times are rejected');
});

test('the presentation phase does not wrap when the future window is full',()=>{
  const clock=new MotionClock();clock.observe(100,0);clock.observe(102,100);clock.observeTurnaround(300);
  let previous=-Infinity;
  for(let now=100;now<=575;now+=25){
    const target=clock.target(now)!,alpha=clock.alpha(now)!;
    assert.ok(target-1+alpha>=previous,'the bounded timeline never moves backwards');
    assert.ok(clock.inputTarget(now)!<=110,'sent commands remain inside the server window');
    previous=target-1+alpha;
  }
});

test('late states from a slow room never reverse the displayed timeline',()=>{
  const clock=new MotionClock();clock.observe(98,0);clock.observe(100,100);
  const before={target:clock.target(200)!,alpha:clock.alpha(200)!};
  clock.observe(101,201);
  const after={target:clock.target(201)!,alpha:clock.alpha(201)!};
  assert.ok(after.target-1+after.alpha>=before.target-1+before.alpha);
  assert.ok(clock.inputTarget(201)!<=109,'the room input future bound still holds');
});

test('bunched 150 ms delivery keeps the wire clock at its original lead while presentation slews',()=>{
  // Receipt and turnaround times from the retained local bunched-150 capture.
  // The room's nominal tick zero is approximately 626 ms on this clock.
  const states=[[709,0],[835,2],[1031,4],[1032,6],[1089,8],[1205,10],[1305,12],
    [1530,14],[1531,16],[1722,18],[1723,20],[1806,22],[2031,24],[2032,26],
    [2222,28],[2223,30],[2307,32],[2531,34],[2532,36],[2721,38],[2722,40],
    [2931,42],[2932,44],[3098,46],[3172,48],[3189,50],[3349,52],[3406,54],
    [3596,56],[3671,58]];
  const turnarounds=[[1530,304],[1722,280],[1723,229],[2031,289],[2222,280],
    [2223,247],[2531,289],[2721,280],[2722,229],[2931,288],[3098,257],
    [3172,281],[3349,207],[3596,255],[3671,279]];
  const clock=new MotionClock(),original=new MotionClock();original.prioritizeContacts(true);
  let state=0,turn=0,lastWire=0,lastVisual=0,fastLate=0,slowLate=0,separated=0;
  for(let now=709;now<=3671;now++){
    while(state<states.length&&states[state][0]<=now){
      const [at,tick]=states[state++];clock.observe(tick,at);original.observe(tick,at);
    }
    while(turn<turnarounds.length&&turnarounds[turn][0]<=now){
      const [,ms]=turnarounds[turn++];clock.observeTurnaround(ms);original.observeTurnaround(ms);
    }
    if(now%16===0){clock.target(now);clock.alpha(now);original.target(now);original.alpha(now);}
    if(now>=1100&&now%50===0){
      const wire=clock.inputTarget(now)!,baseline=original.inputTarget(now)!;
      assert.equal(wire,baseline,`wire target at ${now} ms`);
      const visual=clock.target(now)!;
      if(wire>visual)separated++;
      lastWire=Math.max(lastWire,wire);lastVisual=Math.max(lastVisual,visual);
      const arrivalTick=Math.floor((now+75-626)/50);
      if(lastWire<=arrivalTick)fastLate++;
      if(lastVisual<=arrivalTick)slowLate++;
    }
  }
  assert.ok(separated>10,'the recorded bunching causes the two clocks to separate');
  assert.ok(slowLate>fastLate+10,`slow ${slowLate}, wire ${fastLate}: the visual clock would send stale targets`);
});
