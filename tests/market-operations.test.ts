import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearMarketOperation, readMarketOperation, stageMarketOperation } from '../src/market-operations';

function store(){const entries=new Map<string,string>();return {getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};}
const purchase={action:'buy' as const,assetId:'asset',listingId:'listing',expectedRevision:3};
test('an uncertain purchase survives reload with exactly the same operation and is isolated by saved driver',()=>{
  const storage=store();const staged=stageMarketOperation(storage,'driver-a','operation-a',purchase);
  assert.equal(staged.state,'ready');assert.deepEqual(readMarketOperation(storage,'driver-a'),staged);
  assert.deepEqual(readMarketOperation(storage,'driver-b'),{state:'ready',operation:null});
  assert.deepEqual(stageMarketOperation(storage,'driver-a','operation-b',purchase),staged);
  assert.equal(clearMarketOperation(storage,'driver-a','operation-b'),false);
  assert.equal(clearMarketOperation(storage,'driver-a','operation-a'),true);
  assert.deepEqual(readMarketOperation(storage,'driver-a'),{state:'ready',operation:null});
});
test('unavailable storage prevents sending a new operation, while failed cleanup leaves the original retryable',()=>{
  const storage=store();const denied={...storage,setItem(){throw new Error('denied');}};
  assert.equal(stageMarketOperation(denied,'driver','operation',purchase).state,'unavailable');
  assert.equal(readMarketOperation(storage,'driver').operation,null);
  stageMarketOperation(storage,'driver','operation',purchase);
  const stuck={...storage,removeItem(){throw new Error('denied');}};
  assert.equal(clearMarketOperation(stuck,'driver','operation'),false);
  assert.equal(readMarketOperation(storage,'driver').operation?.operationId,'operation');
});
test('malformed or unsafe stored actions cannot be sent or silently overwritten',()=>{
  const storage=store();storage.setItem('poly-av-market-operation:driver',JSON.stringify({version:1,owner:'driver',operationId:'x',command:{action:'list',assetId:'asset',price:-1}}));
  assert.equal(readMarketOperation(storage,'driver').state,'corrupt');
  assert.equal(stageMarketOperation(storage,'driver','other',purchase).state,'corrupt');
  assert.equal(stageMarketOperation(store(),'driver','other',{action:'list',assetId:'asset',price:-1}).state,'corrupt');
  assert.equal(stageMarketOperation(store(),'driver','other',{action:'list',assetId:'asset',price:0}).state,'ready');
});
