import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyCybercabFleet, paintCybercab, purchaseCybercab, settleCybercabIntervals, type CybercabAsset, type CybercabFleet } from '../shared/cybercabs';

const asset=(id:string,changes:Partial<CybercabAsset>={}):CybercabAsset=>({
  id,gross:0,remainder:0,lastEndMs:0,revenueAwarded:false,style:{paint:'stock',decal:'none'},...changes,
});
const fleet=(...assets:CybercabAsset[]):CybercabFleet=>({assets,claimedOwnershipAwards:[]});

test('purchase requires full price, credits one-time award, and does not mutate the input',()=>{
  const empty=emptyCybercabFleet();
  assert.deepEqual(purchaseCybercab(empty,24_999,0,'one'),{ok:false,reason:'unaffordable'});
  const bought=purchaseCybercab(empty,25_000,50,'one');
  assert.ok(bought.ok);
  assert.equal(bought.cash,5_000);assert.equal(bought.eligibleIncome,5_050);
  assert.deepEqual(bought.fleet,{assets:[asset('one')],claimedOwnershipAwards:[1]});
  assert.deepEqual(empty,emptyCybercabFleet());
  assert.deepEqual(purchaseCybercab(bought.fleet,50_000,5_050,'one'),{ok:false,reason:'owned'});
  const reacquired=purchaseCybercab({assets:[],claimedOwnershipAwards:[1]},25_000,5_000,'replacement');
  assert.ok(reacquired.ok);assert.equal(reacquired.cash,0);assert.equal(reacquired.eligibleIncome,5_000);
  assert.deepEqual(reacquired.fleet.claimedOwnershipAwards,[1]);
});

test('settlements carry exact fractional earnings across segments and multiplier changes',()=>{
  const before=fleet(asset('one'));
  const first=settleCybercabIntervals(before,100,0,[{assetId:'one',startMs:0,endMs:100,multiplier:1}]);
  assert.ok(first.ok);assert.equal(first.cash,100);assert.equal(first.fleet.assets[0].remainder,3_000_000);
  const second=settleCybercabIntervals(first.fleet,first.cash,first.eligibleIncome,[{assetId:'one',startMs:100,endMs:200,multiplier:1.5}]);
  assert.ok(second.ok);assert.equal(second.cash,101);assert.equal(second.eligibleIncome,1);
  assert.equal(second.fleet.assets[0].gross,1);assert.equal(second.fleet.assets[0].remainder,300_000);
  assert.equal(second.fleet.assets[0].lastEndMs,200);
  const combined=settleCybercabIntervals(before,100,0,[
    {assetId:'one',startMs:0,endMs:100,multiplier:1},
    {assetId:'one',startMs:100,endMs:200,multiplier:1.5},
  ]);
  assert.deepEqual(combined,second);assert.deepEqual(before,fleet(asset('one')));
});

test('each cab earns its gross milestone once, separately from interval income',()=>{
  const before=fleet(asset('one',{gross:19_999}),asset('two',{gross:19_999}));
  const result=settleCybercabIntervals(before,0,0,[
    {assetId:'one',startMs:0,endMs:240,multiplier:1},
    {assetId:'two',startMs:0,endMs:240,multiplier:1},
    {assetId:'one',startMs:240,endMs:480,multiplier:1},
  ]);
  assert.ok(result.ok);assert.equal(result.cash,4_003);assert.equal(result.eligibleIncome,4_003);
  assert.deepEqual(result.fleet.assets.map(a=>[a.gross,a.revenueAwarded]),[[20_001,true],[20_000,true]]);
});

test('overlaps, unknown IDs and invalid saved state fail atomically',()=>{
  const before=fleet(asset('one',{lastEndMs:100}),asset('two'));
  const first={assetId:'one',startMs:100,endMs:200,multiplier:1 as const};
  for(const intervals of [
    [first,first],
    [first,{...first,startMs:199,endMs:300}],
    [{...first,startMs:99}],
    [first,{...first,assetId:'missing'}],
    [{...first,endMs:100}],
    [{...first,multiplier:4 as 1}],
  ])assert.deepEqual(settleCybercabIntervals(before,0,0,intervals),{ok:false,reason:'invalid'});
  assert.deepEqual(before,fleet(asset('one',{lastEndMs:100}),asset('two')));
  assert.deepEqual(purchaseCybercab(fleet(asset('same'),asset('same')),25_000,0,'new'),{ok:false,reason:'invalid'});
  assert.deepEqual(settleCybercabIntervals(fleet(asset('one')),Number.MAX_SAFE_INTEGER,0,[{...first,startMs:0,endMs:240}]),{ok:false,reason:'invalid'});
  assert.deepEqual(purchaseCybercab(fleet(),25_000,Number.MAX_SAFE_INTEGER,'new'),{ok:false,reason:'invalid'});
});

test('cab paint uses the catalog price and preserves the owned cab income state',()=>{
  const before=fleet(asset('one',{gross:19_999,remainder:3_000_000,lastEndMs:100,style:{paint:'stock',decal:'stripe'}}),asset('two'));
  assert.deepEqual(paintCybercab(before,17,250,'one','ember'),{ok:false,reason:'unaffordable'});
  assert.deepEqual(paintCybercab(before,18,250,'missing','ember'),{ok:false,reason:'invalid'});
  assert.deepEqual(paintCybercab(before,18,250,'one','invalid' as 'ember'),{ok:false,reason:'invalid'});
  assert.deepEqual(paintCybercab(before,18,250,'one','stock'),{ok:false,reason:'owned'});
  const painted=paintCybercab(before,18,250,'one','ember');assert.ok(painted.ok);
  assert.equal(painted.cash,0);assert.equal(painted.eligibleIncome,250);
  assert.deepEqual(painted.fleet.assets[0],{...before.assets[0],style:{paint:'ember',decal:'stripe'}});
  assert.deepEqual(painted.fleet.assets[1],before.assets[1]);
  assert.equal(before.assets[0].style.paint,'stock','the original fleet is not mutated');
  const back=paintCybercab(painted.fleet,0,250,'one','stock');assert.ok(back.ok);assert.equal(back.cash,0);
});
