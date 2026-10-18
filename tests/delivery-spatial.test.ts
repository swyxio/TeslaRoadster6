import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMERS, RESTAURANTS, deliveryStopSignature, matchesDeliveryStop, type DeliveryStop, type Order } from '../shared/delivery';
import { terrainHeight } from '../shared/map';

const order:Order={restaurant:0,customer:0,stage:'pickup',elapsed:0,pickupEstimate:20,estimate:30,base:100};
function reference(stop:DeliveryStop):string {
  const matches:string[]=[];
  for(let i=0;i<RESTAURANTS.length;i++)if(matchesDeliveryStop({...order,restaurant:i},stop))matches.push(`r${i}`);
  for(let i=0;i<CUSTOMERS.length;i++)if(matchesDeliveryStop({...order,stage:'dropoff',customer:i},stop))matches.push(`c${i}`);
  return matches.join(',');
}
test('indexed delivery evidence matches the full scan at cell, marker, and rooftop boundaries',()=>{
  for(const target of [...RESTAURANTS,...CUSTOMERS]){
    const rooftop='rooftop' in target&&target.rooftop;
    const y=rooftop?target.y:terrainHeight(target.x,target.z)??0;
    const stop:DeliveryStop={x:target.x,z:target.z,y,vy:0,speed:0,kind:'model-3',supportId:rooftop?'roof:0':'ground',canFly:rooftop};
    const radius=rooftop?6:9;
    for(const offset of [0,radius-.01,radius,radius+.01,-radius]){
      for(const axis of ['x','z'] as const){
        const sample={...stop,[axis]:stop[axis]+offset};
        assert.equal(deliveryStopSignature(sample),reference(sample),`${target.id} ${axis} ${offset}`);
      }
    }
    for(const sample of [{...stop,vy:.11},{...stop,speed:4.01},{...stop,supportId:null},{...stop,y:y+.06}])
      assert.equal(deliveryStopSignature(sample),reference(sample),`${target.id} invalid pose`);
  }
});
