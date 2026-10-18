import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleDriveObserver } from '../worker/vehicle-drive-observer';

const sample=(x:number,overrides:Partial<{id:string;kind:'roadster'|'model-3';z:number;speed:number}>={})=>
  ({id:'ride',kind:'roadster' as const,x,z:0,speed:10,...overrides});

test('a model is observed only after 100 m of actual movement above 2 m/s',()=>{
  const observer=new VehicleDriveObserver();
  assert.equal(observer.observe(sample(0)),null);
  for(let x=1;x<100;x++)assert.equal(observer.observe(sample(x)),null);
  assert.equal(observer.observe(sample(100)),'roadster');
  assert.equal(observer.observe(sample(101)),null);
  for(let x=102;x<=120;x++)assert.equal(observer.observe(sample(x,{speed:2})),null);
});

test('switches, ferry holds, invalid samples and relocations cannot build a ride',()=>{
  const observer=new VehicleDriveObserver();
  for(let x=0;x<=90;x+=10)assert.equal(observer.observe(sample(x)),null);
  assert.equal(observer.observe(sample(0,{id:'other',kind:'model-3'})),null);
  assert.equal(observer.observe(null),null);
  assert.equal(observer.observe(sample(0)),null);
  assert.equal(observer.observe(sample(10)),null);
  assert.equal(observer.observe(sample(1000)),null);
  assert.equal(observer.observe(sample(1010)),null);
  assert.equal(observer.observe(sample(NaN)),null);
  assert.equal(observer.observe(sample(0)),null);
  for(let x=10;x<100;x+=10)assert.equal(observer.observe(sample(x)),null);
  assert.equal(observer.observe(sample(100)),'roadster');
});
