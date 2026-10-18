import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../worker/protocol';

test('cab commands accept only an operation, request ID and validated paint selection',()=>{
  const parse=(value:object)=>parseMessage(JSON.stringify(value));
  assert.deepEqual(parse({type:'cab',action:'buy',requestId:1,price:0,assetId:'client-id'}),{type:'cab',action:'buy',requestId:1});
  assert.deepEqual(parse({type:'cab',action:'paint',requestId:2,assetId:'cab-1',paint:'mint',price:0}),{type:'cab',action:'paint',requestId:2,assetId:'cab-1',paint:'mint'});
  for(const invalid of [
    {type:'cab',action:'buy',requestId:0},
    {type:'cab',action:'income',requestId:1},
    {type:'cab',action:'paint',requestId:2,assetId:'other/cab',paint:'mint'},
    {type:'cab',action:'paint',requestId:2,assetId:'cab-1',paint:'__proto__'},
    {type:'cab',action:'paint',requestId:2.5,assetId:'cab-1',paint:'mint'},
  ])assert.equal(parse(invalid),null);
});
