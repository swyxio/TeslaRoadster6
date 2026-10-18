import assert from 'node:assert/strict';
import test from 'node:test';
import { earningsBonusText, type EarningsBonusView } from '../src/earnings-bonus-ui';

test('bonus badge shows each active scope and its own remaining time',()=>{
  const t=1_000_000,view:EarningsBonusView={serverTime:t,receivedAt:100,validForMs:15_000,
    events:{room:[{startsAtMs:t,endsAtMs:t+600_000}],global:[{startsAtMs:t,endsAtMs:t+1_800_000}]}};
  assert.equal(earningsBonusText(view,100),'3× earnings · room 10:00 · global 30:00');
  assert.equal(earningsBonusText(view,5_100),'3× earnings · room 9:55 · global 29:55');
  assert.equal(earningsBonusText(view,15_100),'Earnings bonus status unavailable');
});
test('badge hides an inactive bonus and fails closed for missing timing',()=>{
  const view:EarningsBonusView={serverTime:10_000,receivedAt:1,validForMs:1000,events:{room:[],global:[]}};
  assert.equal(earningsBonusText(view,1),'');
  assert.equal(earningsBonusText(null,1),'Earnings bonus status unavailable');
  assert.equal(earningsBonusText(view,0),'Earnings bonus status unavailable');
});
