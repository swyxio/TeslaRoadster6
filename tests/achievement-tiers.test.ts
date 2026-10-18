import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_TIER_CAP, ACHIEVEMENT_TIER_IDS, ACHIEVEMENT_TIER_LADDER,
  applyAchievementTierEvent, isAchievementTierProgress, normalizeAchievementTiers,
  selectAchievementTierLadder, selectAchievementTiers, type AchievementTierId, type AchievementTierProgress,
} from '../shared/achievement-tiers';

const empty=()=>normalizeAchievementTiers(undefined,0,[]);
function at(id:AchievementTierId,count:number):AchievementTierProgress {
  const progress=empty();
  progress[id]={count,claimed:ACHIEVEMENT_TIER_LADDER.filter(target=>count>=target).length as 0|1|2|3|4|5};
  return progress;
}

test('every family has the common thresholds and correct next tier',()=>{
  for(const id of ACHIEVEMENT_TIER_IDS){
    const expected=id==='deliveries'?[0,0,0,50_000,200_000]:
      ['pickups','early-pickups','early-deliveries','supply-pickups','parking-successes','queue-successes',
        'races-finished','races-won','dome-matches','dome-wins'].includes(id)?[100,350,1_500,5_000,20_000]:[0,350,1_500,5_000,20_000];
    assert.deepEqual(selectAchievementTierLadder(id),ACHIEVEMENT_TIER_LADDER.map((target,index)=>({rank:index+1,target,cash:expected[index]})));
    for(const [index,target] of ACHIEVEMENT_TIER_LADDER.entries()){
      const before=at(id,target-1),row=selectAchievementTiers(before).find(item=>item.id===id)!;
      assert.equal(row.count,target-1);assert.equal(row.rank,index);
      assert.equal(row.nextTarget,target);assert.equal(row.nextCash,expected[index]);
      const result=applyAchievementTierEvent(before,[id]);
      assert.deepEqual(result.awards,[{id,rank:index+1,target,cash:expected[index]}]);
      assert.equal(result.cash,expected[index]);
      assert.deepEqual(result.progress[id],{count:target,claimed:index+1});
      assert.equal(before[id].count,target-1,'input remains untouched');
      if(target<ACHIEVEMENT_TIER_CAP){
        const after=applyAchievementTierEvent(result.progress,[id]);
        assert.equal(after.cash,0);assert.deepEqual(after.awards,[]);
        assert.equal(after.progress[id].count,target+1);
      }
    }
    const capped=at(id,ACHIEVEMENT_TIER_CAP);
    const row=selectAchievementTiers(capped).find(item=>item.id===id)!;
    assert.equal(row.rank,5);assert.equal(row.nextTarget,null);assert.equal(row.nextCash,null);
    const result=applyAchievementTierEvent(capped,[id]);
    assert.deepEqual(result.progress,capped);assert.deepEqual(result.awards,[]);assert.equal(result.cash,0);
  }
});

test('ladder selectors reject unknown families and do not expose mutable reward tables',()=>{
  assert.throws(()=>selectAchievementTierLadder('unknown' as AchievementTierId),TypeError);
  const ladder=selectAchievementTierLadder('pickups');
  (ladder[0] as {cash:number}).cash=999;
  assert.equal(selectAchievementTierLadder('pickups')[0].cash,100);
});

test('legacy profiles use only proven counts, without paying attained ranks',()=>{
  const progress=normalizeAchievementTiers(undefined,125,['roof-rider','coit-landing','sky-delivery','bay-hopper','park-it','queue-cutter',
    'race-winner','roadster-champion','garage-champion','no-rockets-needed']);
  assert.deepEqual(progress.deliveries,{count:125,claimed:3});
  for(const id of ['rooftop-deliveries','roof-landings','bay-crossings','parking-successes','queue-successes',
    'races-finished','races-won','dome-matches','dome-wins'] as const)assert.deepEqual(progress[id],{count:1,claimed:1},id);
  for(const id of ['pickups','early-pickups','early-deliveries','supply-pickups'] as const)assert.deepEqual(progress[id],{count:0,claimed:0},id);
  const replay=normalizeAchievementTiers(progress,125,[]);
  assert.deepEqual(replay,progress);assert.notEqual(replay,progress);
  const result=applyAchievementTierEvent(progress,['deliveries','roof-landings','races-won','dome-wins']);
  assert.equal(result.cash,0);assert.deepEqual(result.awards,[]);
  assert.deepEqual(normalizeAchievementTiers(undefined,Number.MAX_SAFE_INTEGER,[]).deliveries,{count:ACHIEVEMENT_TIER_CAP,claimed:5});
});

test('legacy badges imply only the minimum proven event counts',()=>{
  const winner=normalizeAchievementTiers(undefined,0,['race-winner']);
  assert.equal(winner['races-won'].count,1);assert.equal(winner['races-finished'].count,1);
  const rookie=normalizeAchievementTiers(undefined,0,['rocket-rookie']);
  assert.equal(rookie['dome-matches'].count,1);assert.equal(rookie['dome-wins'].count,0);
  const champion=normalizeAchievementTiers(undefined,0,['garage-champion']);
  assert.equal(champion['dome-matches'].count,1);assert.equal(champion['dome-wins'].count,1);
  const namedRoof=normalizeAchievementTiers(undefined,0,['salesforce-landing']);
  assert.equal(namedRoof['roof-landings'].count,1);
});

test('one event may affect multiple families but cannot count a family twice',()=>{
  const progress=empty();
  const result=applyAchievementTierEvent(progress,['deliveries','early-deliveries','rooftop-deliveries']);
  assert.deepEqual(result.awards.map(({id,cash})=>({id,cash})),[
    {id:'deliveries',cash:0},{id:'early-deliveries',cash:100},{id:'rooftop-deliveries',cash:0},
  ]);
  assert.equal(result.cash,100);
  const second=applyAchievementTierEvent(result.progress,['deliveries','early-deliveries']);
  assert.equal(second.progress.deliveries.count,2);assert.equal(second.progress['early-deliveries'].count,2);
  assert.equal(second.progress['rooftop-deliveries'].count,1);assert.equal(second.cash,0);
  assert.throws(()=>applyAchievementTierEvent(progress,['deliveries','deliveries']),TypeError);
  assert.throws(()=>applyAchievementTierEvent(progress,['unknown' as AchievementTierId]),TypeError);
  assert.deepEqual(progress,empty());
});

test('replay safety belongs to the event receipt, not the pure increment',()=>{
  let progress=empty(),cash=0;
  const receipts=new Map<string,{progress:AchievementTierProgress;cash:number}>();
  function commit(eventId:string){
    const receipt=receipts.get(eventId);if(receipt)return receipt;
    const result=applyAchievementTierEvent(progress,['pickups']);
    progress=result.progress;cash+=result.cash;
    const saved={progress:structuredClone(progress),cash};receipts.set(eventId,saved);return saved;
  }
  const first=commit('one');assert.equal(first.progress.pickups.count,1);assert.equal(first.cash,100);
  assert.deepEqual(commit('one'),first);assert.equal(progress.pickups.count,1);assert.equal(cash,100);
  const second=commit('two');assert.equal(second.progress.pickups.count,2);assert.equal(second.cash,100);
});

test('invalid stored or legacy data is rejected instead of overwritten or clamped',()=>{
  const valid=empty();
  const malformed:unknown[]=[null,{},[],{...valid,extra:{count:0,claimed:0}},
    {...valid,pickups:{count:-1,claimed:0}}, {...valid,pickups:{count:1.5,claimed:1}},
    {...valid,pickups:{count:ACHIEVEMENT_TIER_CAP+1,claimed:5}},
    {...valid,pickups:{count:10,claimed:1}}, {...valid,pickups:{count:0,claimed:1}},
    {...valid,pickups:{count:0,claimed:0,extra:true}}, {...valid,pickups:null}];
  for(const value of malformed){
    assert.equal(isAchievementTierProgress(value),false);
    assert.throws(()=>normalizeAchievementTiers(value,0,[]),TypeError);
  }
  for(const completed of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
    assert.throws(()=>normalizeAchievementTiers(undefined,completed,[]),TypeError);
});
