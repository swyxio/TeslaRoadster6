import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMERS, RESTAURANTS } from '../shared/delivery';

// These numeric indices may still occur in persisted orders and room journals.
const legacy=JSON.parse(readFileSync(new URL('./fixtures/delivery-venues-legacy.json',import.meta.url),'utf8'));
test('legacy delivery indices retain their venue and physical stop',()=>{
  assert.deepEqual(RESTAURANTS.slice(0,legacy.restaurants.length).map(({id,x,z})=>({id,x,z})),legacy.restaurants);
  assert.deepEqual(CUSTOMERS.slice(0,legacy.customers.length).map(({id,x,y,z,rooftop})=>({id,x,y,z,rooftop})),legacy.customers);
});
