import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity } from '../shared/game';
import { updateRocketPickup } from '../shared/rocket';

const car=(id:string,x:number,z:number)=>{
  const entity=makeEntity(id,'model-3',0,0,id);
  Object.assign(entity,{x,z,y:0,supportId:'ground',air:1});
  return entity;
};

test('rocket pad distance checks preserve exact boundaries, nonfinite values and eligibility',()=>{
  const xs=[-Infinity,-Number.MAX_VALUE,-4,-4+Number.EPSILON*2,-3.999,0,3.999,4-Number.EPSILON*2,4,Number.MAX_VALUE,Infinity,NaN];
  const zs=[-Infinity,-Number.MAX_VALUE,-4,-3.999,-3.2,0,3.2,3.999,4,Number.MAX_VALUE,Infinity,NaN];
  for(const x of xs)for(const z of zs){
    const pad={x:0,z:0,active:true},entity=car('a',x,z),calls:string[]=[];
    const result=updateRocketPickup(pad,[entity],10,id=>(calls.push(id),true));
    const eligible=!(Math.hypot(x,z)>=4);
    assert.equal(result,eligible?'a':null,`x=${x}, z=${z}`);
    assert.equal(calls.length,eligible?1:0,`eligibility x=${x}, z=${z}`);
  }
});

test('rocket pads keep stable equal-distance winner and call eligibility in array order',()=>{
  for(const order of [['b','a'],['a','b']]){
    const entities=order.map(id=>car(id,id==='a'?-1:1,0)),calls:string[]=[];
    const pad={x:0,z:0,active:true,readyAt:0};
    assert.equal(updateRocketPickup(pad,entities,20,id=>(calls.push(id),true)),'a');
    assert.deepEqual(calls,order);assert.equal(pad.readyAt,40);
    assert.equal(updateRocketPickup(pad,entities,39.999),null);
    assert.equal(updateRocketPickup(pad,entities,40),'b');
  }
});

test('eligibility callbacks can change later candidates during the same scan',()=>{
  const entities=[car('a',0,0),car('b',20,0)],calls:string[]=[];
  const pad={x:0,z:0,active:true};
  const result=updateRocketPickup(pad,entities,10,id=>{
    calls.push(id);
    if(id==='a'){entities[1].x=1;entities.push(car('c',-1,0));return false;}
    return true;
  });
  assert.equal(result,'b');assert.deepEqual(calls,['a','b','c']);
});
