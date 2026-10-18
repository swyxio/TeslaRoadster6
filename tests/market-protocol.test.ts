import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../worker/protocol';

const operationId='af24a7ae-f349-4bb7-b15e-7e8d88ccdb45';
const assetId='afb668cb-9af6-447e-a7a6-b1980142b763';
const listingId='b2b668cb-9af6-447e-a7a6-b1980142b763';
const parse=(message:unknown)=>parseMessage(JSON.stringify(message));
test('market protocol accepts bounded pages and a zero-price fixed listing',()=>{
  assert.deepEqual(parse({type:'market',action:'browse',requestId:1,cursor:listingId,ownedCursor:assetId}),{type:'market',action:'browse',requestId:1,cursor:listingId,ownedCursor:assetId});
  assert.deepEqual(parse({type:'market',action:'list',requestId:2,operationId,assetId,price:0}),{type:'market',action:'list',requestId:2,operationId,assetId,price:0});
});
test('market protocol drops forged identity, seller and price fields from a buy',()=>{
  assert.deepEqual(parse({type:'market',action:'buy',requestId:3,operationId,assetId,listingId,expectedRevision:2,actorId:'forged',sellerId:'forged',price:0}),
    {type:'market',action:'buy',requestId:3,operationId,assetId,listingId,expectedRevision:2});
});
test('market protocol rejects malformed ids, prices, revisions and cursors',()=>{
  const good={type:'market',action:'reprice',requestId:1,operationId,assetId,listingId,expectedRevision:1,price:3};
  for(const bad of [
    {...good,operationId:'invalid'}, {...good,assetId:'__proto__'}, {...good,listingId:'no'},
    {...good,price:-1}, {...good,price:1.5}, {...good,price:Number.MAX_SAFE_INTEGER+1},
    {...good,expectedRevision:0}, {...good,requestId:0}, {...good,action:'unknown'},
    {type:'market',action:'browse',requestId:1,cursor:'invalid'},
    {type:'market',action:'acquire',requestId:1,operationId,catalogId:'../paint'},
  ])assert.equal(parse(bad),null);
});
