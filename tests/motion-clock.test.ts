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
