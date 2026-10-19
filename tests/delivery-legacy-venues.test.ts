import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, buildingRoofHeight } from '../shared/map';
import { CUSTOMERS, RESTAURANTS } from '../shared/delivery';

// These numeric indices may still occur in persisted orders and room journals.
const legacy=JSON.parse(readFileSync(new URL('./fixtures/delivery-venues-legacy.json',import.meta.url),'utf8'));
test('legacy delivery indices retain their venue and physical stop',()=>{
  assert.deepEqual(RESTAURANTS.slice(0,legacy.restaurants.length).map(({id,x,z})=>({id,x,z})),legacy.restaurants);
  // Saved orders keep their numeric venue and horizontal stop. Roof height
  // follows corrected physical coping, rather than preserving the old clipping.
  assert.deepEqual(CUSTOMERS.slice(0,legacy.customers.length).map(({id,x,y,z,rooftop})=>({id,x,y:rooftop?null:y,z,rooftop})),
    legacy.customers.map((stop:{rooftop:boolean;y:number})=>({...stop,y:stop.rooftop?null:stop.y})));
  for(const stop of CUSTOMERS.slice(0,legacy.customers.length).filter(stop=>stop.rooftop)){
    const building=BUILDINGS.find(b=>b.x===stop.x&&b.z===stop.z)!;
    assert.equal(stop.y,buildingRoofHeight(building,stop.x,stop.z));
  }
});
