import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAchievementEvidence } from '../shared/achievement-evidence';
import { initialAchievements } from '../shared/achievements';
import { normalizeAchievementTiers } from '../shared/achievement-tiers';
import { initialDelivery } from '../shared/delivery';
import { VEHICLE_IDS } from '../shared/vehicles';
import { TESLA_COLLECTION_IDS, VAULT_COLLECTION_IDS, applyVehicleCollection, emptyVehicleCollections, isVehicleCollections, normalizeVehicleCollections } from '../shared/vehicle-collections';
import { applyObservedAchievement } from '../worker/achievement-progress';

test('unique Tesla drives and NPC takeovers pay each milestone once',()=>{
  assert.equal(TESLA_COLLECTION_IDS.length,11);assert.equal(VEHICLE_IDS.length,26);
  let progress=emptyVehicleCollections(),awards:string[]=[],cash=0;
  for(const vehicle of TESLA_COLLECTION_IDS){
    const result=applyVehicleCollection(progress,{kind:'vehicle-driven',vehicle});progress=result.progress;
    awards.push(...result.awards.map(award=>award.id));cash+=result.awards.reduce((sum,award)=>sum+award.reward,0);
    assert.deepEqual(applyVehicleCollection(progress,{kind:'vehicle-driven',vehicle}).awards,[]);
  }
  assert.deepEqual(awards,['tesla-drive-1','tesla-drive-5','tesla-drive-11']);assert.equal(cash,2_600);
  awards=[];cash=0;
  for(const vehicle of VEHICLE_IDS){
    const result=applyVehicleCollection(progress,{kind:'npc-stolen',vehicle});progress=result.progress;
    awards.push(...result.awards.map(award=>award.id));cash+=result.awards.reduce((sum,award)=>sum+award.reward,0);
    assert.deepEqual(applyVehicleCollection(progress,{kind:'npc-stolen',vehicle}).awards,[]);
  }
  assert.deepEqual(awards,['npc-theft-1','npc-theft-5','npc-theft-10','npc-theft-26']);assert.equal(cash,7_600);
  assert.equal(progress.stolen.length,26);
});

test('each Vault drive is a separate award, independent of existing purchase badges',()=>{
  const delivery=initialDelivery({x:0,z:0}),state=initialAchievements();
  state.unlocked.push('luxury-panigale');
  let tiers=normalizeAchievementTiers(undefined,0,state.unlocked),collections=emptyVehicleCollections();
  for(const vehicle of VAULT_COLLECTION_IDS){
    const result=applyObservedAchievement(delivery,state,tiers,{kind:'vehicle-driven',vehicle},collections);
    tiers=result.progress;collections=result.collections;
    assert.equal(result.awards.length,1);assert.ok(result.awards[0].startsWith('vault-drive-'));
  }
  assert.equal(delivery.cash,8_500);assert.equal(delivery.lifetimeIncome,6_000);
  assert.equal(state.unlocked.filter(id=>id==='luxury-panigale').length,1);
  const again=applyObservedAchievement(delivery,state,tiers,{kind:'vehicle-driven',vehicle:VAULT_COLLECTION_IDS[0]},collections);
  assert.deepEqual(again.awards,[]);assert.equal(delivery.cash,8_500);
});

test('unknown history starts empty and malformed stored collections or evidence fail closed',()=>{
  assert.deepEqual(normalizeVehicleCollections(undefined),{driven:[],stolen:[]});
  assert.equal(isVehicleCollections({driven:['roadster','roadster'],stolen:[]}),false);
  assert.equal(isVehicleCollections({driven:['waymo-ipace'],stolen:[]}),false);
  assert.equal(isVehicleCollections({driven:[],stolen:['bugatti-chiron']}),false);
  assert.throws(()=>normalizeVehicleCollections({driven:['unknown'],stolen:[]}),/Invalid vehicle collection progress/);
  assert.equal(isAchievementEvidence({kind:'vehicle-driven',vehicle:'waymo-ipace'}),false);
  assert.equal(isAchievementEvidence({kind:'npc-stolen',vehicle:'bugatti-chiron'}),false);
  assert.equal(isAchievementEvidence({kind:'vehicle-driven',vehicle:'roadster'}),true);
  assert.equal(isAchievementEvidence({kind:'npc-stolen',vehicle:'waymo-ipace'}),true);
});
