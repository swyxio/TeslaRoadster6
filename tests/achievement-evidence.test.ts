import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAchievementEvidence, isAchievementEvidence, type AchievementEvidence } from '../shared/achievement-evidence';
import { awardDomeMatchAchievements, updateAchievements, updateGameAchievements, type AchievementId } from '../shared/achievements';
import { addPlayer, createEmptyWorld } from '../shared/game';
import { BUILDINGS, LANDMARKS, terrainHeight } from '../shared/map';
import { LUXURY_SHOWROOM } from '../shared/luxury';
import { RESEARCH_SITES } from '../shared/research';
import type { DomeParticipant } from '../shared/soccer';

function setup(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  return {world,player,car:world.entities.find(entity=>entity.id===player.entityId)!};
}
function awardIds(evidence:AchievementEvidence,unlocked:readonly AchievementId[]=[]){
  return evaluateAchievementEvidence(unlocked,evidence).map(award=>award.id);
}

test('roof evidence preserves the existing ordinary and named-roof awards',()=>{
  for(const [style,roof] of [['midrise','ordinary'],['coit','coit'],['salesforce','salesforce']] as const){
    const {player,car}=setup(),index=BUILDINGS.findIndex(building=>building.style===style),building=BUILDINGS[index];
    assert.ok(building);
    Object.assign(car,{x:building.x,z:building.z,y:building.h,supportId:`roof:${index}`,speed:0,vy:0});
    const before=player.delivery.cash;updateAchievements(player,car,false);
    const awards=evaluateAchievementEvidence([],{kind:'roof',roof});
    assert.deepEqual(awards.map(award=>award.id),player.achievements.unlocked);
    assert.equal(awards.reduce((sum,award)=>sum+award.reward,0),player.delivery.cash-before);
    assert.deepEqual(evaluateAchievementEvidence(awards.map(award=>award.id),{kind:'roof',roof}),[]);
  }
  assert.deepEqual(evaluateAchievementEvidence(['roof-rider'],{kind:'roof',roof:'coit'}),[{id:'coit-landing',reward:1_000}]);
});

test('sites derive the same IDs and rewards as physical arrivals',()=>{
  const visits=[
    {site:'mission-san-jose',id:'fremont-mission',reward:500},
    {site:'san-jose-city-hall',id:'san-jose-city-hall',reward:500},
    ...RESEARCH_SITES.map(site=>({site:site.landmark,id:site.achievement,reward:site.cash})),
    {site:'luxury-showroom',id:'luxury-visit',reward:1_000},
  ] as const;
  for(const visit of visits){
    const {player,car}=setup();
    const arrival=visit.site==='luxury-showroom'?LUXURY_SHOWROOM.arrival:LANDMARKS.find(landmark=>landmark.id===visit.site)!.arrival;
    Object.assign(car,{x:arrival.x,z:arrival.z,y:terrainHeight(arrival.x,arrival.z)??0,supportId:'ground',speed:0,vy:0,vx:0,vz:0,pushX:0,pushZ:0,inDome:false});
    const before=player.delivery.cash;updateAchievements(player,car,false);
    const evidence={kind:'site' as const,site:visit.site},awards=evaluateAchievementEvidence([],evidence);
    assert.deepEqual(awards,[{id:visit.id,reward:visit.reward}],visit.site);
    assert.ok(player.achievements.unlocked.includes(visit.id),visit.site);
    assert.equal(player.delivery.cash-before,visit.reward,visit.site);
    assert.deepEqual(evaluateAchievementEvidence([visit.id],evidence),[]);
  }
});

test('Bay crossings require the other shore and an observed water crossing',()=>{
  const {player,car}=setup();
  player.achievements.crossing={origin:'sf',entityId:car.id,crossedWater:true};
  Object.assign(car,{x:310,z:60,y:10,supportId:null});
  const before=player.delivery.cash;updateAchievements(player,car,false);
  const evidence={kind:'crossing',origin:'sf',destination:'oakland',crossedWater:true} as const;
  assert.ok(player.achievements.unlocked.includes('bay-hopper'));
  assert.deepEqual(evaluateAchievementEvidence([],evidence),[{id:'bay-hopper',reward:player.delivery.cash-before}]);
  assert.deepEqual(awardIds({...evidence,crossedWater:false}),[]);
  assert.deepEqual(awardIds({...evidence,destination:'sf'}),[]);
  assert.deepEqual(awardIds({kind:'crossing',origin:'oakland',destination:'sf',crossedWater:true}),['bay-hopper']);
});

test('parking and racing evidence matches authoritative completed-result rules',()=>{
  for(const mode of ['park','queue'] as const){
    const {world,player,car}=setup();
    world.parking.rounds=[{lotId:'fixture',mode,phase:'results',hostId:player.id,openedAt:0,startedAt:0,endsAt:10,
      entrants:[{playerId:player.id,entityId:car.id,joinedAt:0,targetId:'a',hold:2,finishedAt:1,elapsed:1,overtakes:null}],claimedStallIds:[]}];
    updateGameAchievements(world,player);
    assert.deepEqual(awardIds({kind:'parking',mode,finished:true}),player.achievements.unlocked);
    assert.deepEqual(awardIds({kind:'parking',mode,finished:false}),[]);
  }
  for(const phase of ['lobby','countdown','active','results'] as const)for(const rank of [1,2,null])for(const starterCount of [1,2]){
    const {world,player,car}=setup();
    world.races.rounds=[{courseId:'short',phase,hostId:player.id,openedAt:0,startedAt:0,endsAt:10,starterCount,
      entrants:[{playerId:player.id,entityId:car.id,status:'finished',nextGate:1,finishedAt:1,elapsed:1,rank,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:0}}]}];
    updateGameAchievements(world,player);
    assert.deepEqual(awardIds({kind:'race',status:'finished',phase,rank,starterCount}),player.achievements.unlocked,`${phase}/${rank}/${starterCount}`);
  }
  assert.deepEqual(awardIds({kind:'race',status:'dnf',phase:'results',rank:1,starterCount:2}),[]);
  assert.deepEqual(evaluateAchievementEvidence(['race-finisher'],{kind:'race',status:'finished',phase:'active',rank:1,starterCount:2}),[{id:'race-winner',reward:0}]);
});

test('Dome touch and goal classes match the existing completed-match awards',()=>{
  for(let mask=0;mask<8;mask++)for(let goalMask=0;goalMask<8;goalMask++)for(const won of [false,true]){
    const touches={roadster:!!(mask&1),retrofit:!!(mask&2),stock:!!(mask&4)};
    const goals={roadster:Number(!!(goalMask&1)),retrofit:Number(!!(goalMask&2)),stock:Number(!!(goalMask&4))};
    const {player}=setup(),before=player.delivery.cash;
    const participant:DomeParticipant={playerId:player.id,touches,goals};awardDomeMatchAchievements(player,participant,won);
    const evidence={kind:'dome' as const,touches,goals,won},awards=evaluateAchievementEvidence([],evidence);
    assert.deepEqual(awards.map(award=>award.id),player.achievements.unlocked,`${mask}/${goalMask}/${won}`);
    assert.equal(awards.reduce((sum,award)=>sum+award.reward,0),player.delivery.cash-before);
    assert.deepEqual(evaluateAchievementEvidence(awards.map(award=>award.id),evidence),[]);
  }
});

test('unrecognized or malformed serialized evidence fails closed',()=>{
  for(const evidence of [null,{},[],{kind:'roof',roof:'nonsense'}, {kind:'site',site:'deliveries-1'},
    {kind:'crossing',origin:'sf',destination:'moon',crossedWater:true},
    {kind:'race',status:'finished',phase:'results',rank:1,starterCount:Infinity},
    {kind:'dome',touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:-1,retrofit:0,stock:0},won:true},
    {kind:'dome',touches:{roadster:1,retrofit:false,stock:false},goals:{roadster:0,retrofit:0,stock:0},won:true}]){
    assert.equal(isAchievementEvidence(evidence),false);
    assert.deepEqual(evaluateAchievementEvidence([],evidence as AchievementEvidence),[]);
  }
});
