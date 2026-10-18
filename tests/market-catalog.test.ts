import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarketInventoryItem, MARKET_CATALOG, marketCatalogItem, marketPaintColor } from '../shared/market-catalog';

test('starter catalog has distinct, priced cosmetics and collectibles',()=>{
  assert.equal(new Set(MARKET_CATALOG.map(item=>item.id)).size,MARKET_CATALOG.length);
  assert.deepEqual(new Set(MARKET_CATALOG.map(item=>item.kind)),new Set(['cosmetic','collectible']));
  for(const item of MARKET_CATALOG){
    assert.ok(item.name.trim());assert.ok(item.description.trim());
    assert.ok(Number.isSafeInteger(item.price)&&item.price>0);
    assert.equal(marketCatalogItem(item.id),item);
    if(item.kind==='cosmetic')assert.ok(Number.isInteger(item.color)&&item.color>=0&&item.color<=0xffffff);
  }
  for(const invalid of [null,undefined,0,'','__proto__','toString','unknown',{},[]])
    assert.equal(marketCatalogItem(invalid),null);
});

test('each catalog purchase refers to a distinct server-minted item instance',()=>{
  const first={id:'af24a7ae-f349-4bb7-b15e-7e8d88ccdb45',catalogId:'sunrise-gold-paint'};
  const second={id:'afb668cb-9af6-447e-a7a6-b1980142b763',catalogId:'sunrise-gold-paint'};
  assert.ok(isMarketInventoryItem(first));assert.ok(isMarketInventoryItem(second));
  assert.notEqual(first.id,second.id);
  for(const invalid of [
    null,[],{}, {id:'',catalogId:first.catalogId}, {id:first.id,catalogId:'unknown'},
    {id:'af24a7ae-f349-3bb7-b15e-7e8d88ccdb45',catalogId:first.catalogId},
    {id:'af24a7ae-f349-4bb7-715e-7e8d88ccdb45',catalogId:first.catalogId},
    {id:first.catalogId,catalogId:first.catalogId},
    Object.create(first),
  ])assert.equal(isMarketInventoryItem(invalid),false);
});
test('only the two allowlisted cosmetics resolve to paint colors',()=>{
  assert.equal(marketPaintColor('sunrise-gold-paint'),0xe0aa34);
  assert.equal(marketPaintColor('pacific-blue-paint'),0x236b9d);
  for(const invalid of ['bay-bridge-postcard','unknown','__proto__',null,0])assert.equal(marketPaintColor(invalid),null);
});
