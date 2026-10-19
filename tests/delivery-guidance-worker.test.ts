import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMERS, RESTAURANTS, requiredLevelAt } from '../shared/delivery';
import { isSurface } from '../shared/map';
import { DELIVERY_DESTINATION_SNAP, nearestNavigationAnchor } from '../shared/navigation';
import type { GuidanceRequest, GuidanceResponse } from '../src/delivery-guidance';

test('the guidance worker reaches a scheduled off-lane stop and rejects unsafe targets', async()=>{
  const responses:GuidanceResponse[]=[];
  const worker:{onmessage:((event:MessageEvent<GuidanceRequest>)=>void)|null;postMessage:(response:GuidanceResponse)=>void}={
    onmessage:null,postMessage:response=>responses.push(response),
  };
  const original=Object.getOwnPropertyDescriptor(globalThis,'self');
  Object.defineProperty(globalThis,'self',{value:worker,configurable:true});
  try { await import('../src/delivery-guidance.worker'); }
  finally {
    if(original)Object.defineProperty(globalThis,'self',original);
    else Reflect.deleteProperty(globalThis,'self');
  }

  const pickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-la-guera')!;
  const target=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  assert.ok((nearestNavigationAnchor(target,2)?.distance??0)>DELIVERY_DESTINATION_SNAP);
  const car={x:pickup.x,z:pickup.z,yaw:0,kind:'model-3' as const,supportId:'ground' as const,inDome:false};
  const send=(id:number,destination:{x:number;z:number})=>{
    assert.ok(worker.onmessage);
    worker.onmessage({data:{id,car,destination,level:2}} as MessageEvent<GuidanceRequest>);
    return responses.at(-1)!;
  };
  const route=send(1,target);
  assert.equal(route.id,1);
  assert.ok(route.path?.length,'the actual worker returns an off-lane approach');
  assert.deepEqual(route.path.at(-1),{x:target.x,z:target.z});
  assert.equal(isSurface(180,-300),false,'the water fixture is not supported ground');
  assert.deepEqual(send(2,{x:180,z:-300}),{id:2,path:null},'water remains unreachable');
  assert.ok(isSurface(1705,8730)&&requiredLevelAt(1705,8730)>2,'the locked fixture is supported ground beyond this level');
  assert.deepEqual(send(3,{x:1705,z:8730}),{id:3,path:null},'locked regions remain unreachable');
});
