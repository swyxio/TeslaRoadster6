import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabRevenueAward, planCybercabDispatch, quoteCybercabPurchase } from '../shared/cybercabs';

test('five ordinal purchases have fixed prices and one-time ownership awards', () => {
  const prices = [25_000, 50_000, 100_000, 200_000, 400_000];
  const awards = [5_000, 10_000, 20_000, 40_000, 80_000];
  for (let count = 0; count < 5; count++) {
    assert.deepEqual(quoteCybercabPurchase(count, []), { ordinal: count + 1, price: prices[count], award: awards[count] });
    assert.deepEqual(quoteCybercabPurchase(count, [count + 1]), { ordinal: count + 1, price: prices[count], award: 0 });
  }
  const claimed = [1, 2];
  assert.equal(quoteCybercabPurchase(0, claimed)?.award, 0, 'reacquisition cannot pay the same milestone again');
  assert.deepEqual(claimed, [1, 2], 'quoting does not mutate saved milestones');
});

test('quotes fail closed for the sixth cab or invalid saved state', () => {
  for (const count of [-1, 1.5, 5, 6, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(quoteCybercabPurchase(count, []), null);
  for (const awards of [[0], [6], [1.5], [NaN], [1, 1]])
    assert.equal(quoteCybercabPurchase(0, awards), null);
});

test('each cab revenue milestone pays once at $20,000 gross', () => {
  const cabs = [{ gross: 19_999, claimed: false }, { gross: 20_000, claimed: false }, { gross: 20_001, claimed: true }];
  assert.deepEqual(cabs.map(cab => cabRevenueAward(cab.gross,cab.claimed)),[0,2_000,0]);
  assert.equal(cabRevenueAward(20_000,false),2_000,'a different cab may earn its own award');
  for(const gross of [-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.equal(cabRevenueAward(gross,false),null);
});

test('the room allocates slots in owner rounds and retains existing cars where possible', () => {
  const fleets=[{ownerId:'a',assetIds:['a1','a2','a3','a4','a5']},
    ...['b','c','d','e','f','g','h'].map(ownerId=>({ownerId,assetIds:[`${ownerId}1`]}))];
  const dispatched=[...fleets[0].assetIds.map(assetId=>({ownerId:'a',assetId,occupied:false})),
    ...['b','c','d'].map(ownerId=>({ownerId,assetId:`${ownerId}1`,occupied:false}))];
  const plan=planCybercabDispatch(fleets,dispatched,8)!;
  assert.deepEqual(plan.retire.map(cab=>cab.assetId),['a2','a3','a4','a5']);
  assert.deepEqual(plan.dispatch.map(cab=>cab.assetId),['e1','f1','g1','h1']);
  const rebalanced=dispatched.filter(cab=>!plan.retire.includes(cab)).concat(plan.dispatch.map(cab=>({...cab,occupied:false})));
  assert.deepEqual(planCybercabDispatch(fleets,rebalanced,8),{retire:[],dispatch:[]});
  assert.equal(dispatched.length,8,'planning does not mutate the live list');
});

test('occupied and retired borrowed cabs keep their slots until released', () => {
  const fleets=[{ownerId:'a',assetIds:['a1','a2','a3']},
    ...['b','c','d','e','f'].map(ownerId=>({ownerId,assetIds:[`${ownerId}1`]}))];
  const dispatched=[{ownerId:'a',assetId:'a1',occupied:false},{ownerId:'a',assetId:'a2',occupied:true},
    {ownerId:'a',assetId:'a3',occupied:true}];
  const plan=planCybercabDispatch(fleets,dispatched,6,1)!;
  assert.deepEqual(plan.retire.map(cab=>cab.assetId),['a1']);
  assert.deepEqual(plan.dispatch.map(cab=>cab.assetId),['b1','c1','d1']);
  assert.ok(!plan.retire.some(cab=>cab.occupied));
});

test('an inconsistent allocation fails closed', () => {
  const fleets=[{ownerId:'a',assetIds:['one']}],cab={ownerId:'a',assetId:'one',occupied:false};
  assert.equal(planCybercabDispatch(fleets,[cab],0),null);
  assert.equal(planCybercabDispatch(fleets,[cab],1,1),null);
  assert.equal(planCybercabDispatch(fleets,[cab,cab],2),null);
  assert.equal(planCybercabDispatch([...fleets,{ownerId:'b',assetIds:['one']}],[],2),null);
  assert.equal(planCybercabDispatch(fleets,[{...cab,ownerId:'b'}],1),null);
  assert.equal(planCybercabDispatch(fleets,[],1.5),null);
});
