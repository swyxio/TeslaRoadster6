import test from 'node:test';
import assert from 'node:assert/strict';
import { LandingPulse } from '../src/landing-pulse';

test('landing compression is brief, bounded and limited to a grounded controlled vehicle',()=>{
  const pulse=new LandingPulse();
  const update=(id='roadster',grounded=true,paused=false,relocated=false,reducedMotion=false,dt=.05)=>pulse.update(id,grounded,paused,relocated,reducedMotion,dt);
  assert.equal(update(),1);
  pulse.trigger(1);const compressed=update();assert.equal(compressed,.95);
  assert.ok(update()>compressed,'the car rebounds after landing');
  for(let i=0;i<6;i++)update();assert.equal(update(),1);
  pulse.trigger(1);assert.equal(update('roadster',false),1,'never compress in flight');
  assert.equal(update(),.95,'briefly retain an event until the predicted car reaches ground');
  for(let i=0;i<6;i++)update();
  pulse.trigger(1);for(let i=0;i<4;i++)update('roadster',false);
  assert.equal(update(),1,'an old event cannot compress a later landing');
  pulse.trigger(1);assert.equal(update('other'),1,'a vehicle switch discards the old event');
  pulse.trigger(1);assert.equal(update('other',true,false,true),1,'a relocation clears the event');
  pulse.trigger(1);assert.equal(update('other',true,true),1,'the menu clears the event');
  pulse.trigger(1);assert.equal(update('other',true,false,false,true),1,'reduced motion disables compression');
});
