import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld } from '../shared/game';
import { awardDeliveryTarget, awardProgress, awardSaveView, deliveryStandings, GameResultHistory, nextDeliveryLevel } from '../src/progress-model';

function setup(){const world=createWorld(),player=addPlayer(world,'p','Driver');return {world,player};}
let snapshot=0;

test('delivery standings prioritize completed runs and then total earnings, independent of cash',()=>{
  const {world,player}=setup(),other=addPlayer(world,'o','Other'),third=addPlayer(world,'t','Third');
  Object.assign(player.delivery,{completed:2,earned:80,cash:5});
  Object.assign(other.delivery,{completed:1,earned:100,cash:100});
  Object.assign(third.delivery,{completed:2,earned:90,cash:0});
  assert.deepEqual(deliveryStandings(world.players).map(p=>p.id),['t','p','o']);
  assert.equal(nextDeliveryLevel(9_999)?.cash,10_000);
  assert.equal(nextDeliveryLevel(10_000)?.cash,50_000);
  assert.equal(nextDeliveryLevel(8_000_000),undefined);
});

test('finished parking and race results remain visible after authoritative rounds expire',()=>{
  const {world,player}=setup(),history=new GameResultHistory();
  world.parking.rounds.push({lotId:'sf-playground',mode:'queue',phase:'results',hostId:player.id,openedAt:1,startedAt:2,endsAt:30,claimedStallIds:['sf-1'],entrants:[{playerId:player.id,entityId:player.entityId,joinedAt:1,targetId:'sf-1',hold:2,finishedAt:9.5,elapsed:7.5,overtakes:2}]});
  world.races.rounds.push({courseId:'oval',phase:'results',hostId:player.id,openedAt:3,startedAt:4,endsAt:50,starterCount:1,entrants:[{playerId:player.id,entityId:player.entityId,status:'finished',nextGate:8,finishedAt:27.3,elapsed:23.3,rank:1,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:27.3}}]});
  const active=history.observe(world,player.id,'bay','driver',++snapshot);
  assert.equal(active.current.length,2);assert.equal(active.recent.length,0);
  assert.match(active.current[0].detail,/7\.5s · 2 overtakes/);
  assert.match(active.current[1].detail,/23\.3s · #1/);
  world.parking.rounds=[];world.races.rounds=[];
  const expired=history.observe(world,player.id,'bay','driver',++snapshot);
  assert.equal(expired.current.length,0);assert.deepEqual(expired.recent.map(result=>result.game),['North Bay speed oval','Cut the Queue']);
  history.clear();assert.deepEqual(history.observe(world,player.id,'bay','driver',++snapshot).recent,[]);
});

test('race placement remains pending until final results',()=>{
  const {world,player}=setup(),history=new GameResultHistory();
  world.races.rounds.push({courseId:'oval',phase:'active',hostId:player.id,openedAt:3,startedAt:4,endsAt:50,starterCount:1,entrants:[{playerId:player.id,entityId:player.entityId,status:'finished',nextGate:8,finishedAt:27.3,elapsed:23.3,rank:1,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:27.3}}]});
  assert.equal(history.observe(world,player.id,'bay','driver',++snapshot).current[0].detail,'Finished in 23.3s · standings pending');
  world.races.rounds[0].phase='results';
  assert.equal(history.observe(world,player.id,'bay','driver',++snapshot).current[0].detail,'Finished in 23.3s · #1');
});

test('an unfinished race and unclaimed parking space are described without inventing results',()=>{
  const {world,player}=setup(),history=new GameResultHistory();
  world.parking.rounds.push({lotId:'sf-playground',mode:'park',phase:'results',hostId:player.id,openedAt:1,startedAt:1,endsAt:30,claimedStallIds:[],entrants:[{playerId:player.id,entityId:player.entityId,joinedAt:1,targetId:'sf-1',hold:0,finishedAt:null,elapsed:null,overtakes:null}]});
  world.races.rounds.push({courseId:'short',phase:'results',hostId:player.id,openedAt:3,startedAt:4,endsAt:50,starterCount:1,entrants:[{playerId:player.id,entityId:player.entityId,status:'dnf',nextGate:2,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:30}}]});
  const scores=history.observe(world,player.id,'bay','driver',++snapshot);
  assert.match(scores.current[0].detail,/ended before you parked/);
  assert.equal(scores.current[1].detail,'Did not finish');
});

test('Rocket Dome credits individual goals and retains a completed match without calling it current after leaving',()=>{
  const {world,player}=setup(),history=new GameResultHistory(),car=world.entities.find(e=>e.id===player.entityId)!;
  car.inDome=true;Object.assign(world.soccer,{phase:'win',phaseUntil:20,blueScore:5,orangeScore:3,winningPlayers:[player.id]});
  world.soccer.participants.push({playerId:player.id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:2,retrofit:0,stock:0}});
  const live=history.observe(world,player.id,'bay','driver',++snapshot);assert.match(live.current[0].detail,/You won · Blue 5–3 Orange · 2 goals/);assert.equal(live.recent.length,0);
  car.inDome=false;const left=history.observe(world,player.id,'bay','driver',++snapshot);assert.equal(left.current.length,0);assert.equal(left.recent.length,1);
  world.soccer.participants=[];world.soccer.phase='play';assert.equal(history.observe(world,player.id,'bay','driver',++snapshot).recent.length,1);
});

test('award progress uses only known delivery and current match state',()=>{
  const {world,player}=setup();player.delivery.completed=2;
  assert.equal(awardProgress('regular',player,world),'2 / 3 deliveries');
  assert.equal(awardProgress('regular',undefined,world),'Connect to see this drive’s progress');
  world.soccer.participants.push({playerId:player.id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:1,retrofit:0,stock:0}});
  assert.equal(awardProgress('rocket-rookie',player,world),'Ball touched · finish the match');
  assert.equal(awardProgress('roadster-champion',player,world),'Goal credited · win the match');
  assert.equal(awardProgress('no-rockets-needed',player,world),'Try a stock car next match');
});

test('race win progress uses starters after green even if an opponent leaves',()=>{
  const {world,player}=setup();
  const entrant={playerId:player.id,entityId:player.entityId,status:'entered' as const,nextGate:0,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:0,y:0,z:0,time:0}};
  world.races.rounds.push({courseId:'short',phase:'active',hostId:player.id,openedAt:0,startedAt:1,endsAt:20,starterCount:2,entrants:[entrant]});
  assert.match(awardProgress('race-winner',player,world),/Checkpoint/);
  world.races.rounds[0].starterCount=1;
  assert.match(awardProgress('race-winner',player,world),/Start a race with another driver/);
});


test('wallet status never presents unconfirmed or stale awards as saved',()=>{
  const earned=['regular'] as const,saved=['bay-hopper'] as const;
  assert.deepEqual(awardSaveView(true,'ready',saved,earned).saved,['bay-hopper']);
  for(const status of ['guest','connecting','syncing','failed'] as const)assert.deepEqual(awardSaveView(true,status,saved,earned).saved,[]);
  assert.deepEqual(awardSaveView(false,'ready',saved,earned).observed,[]);
  assert.deepEqual(awardSaveView(true,'guest',saved,earned).observed,['regular']);
  assert.match(awardSaveView(true,'guest',saved,earned).text,/Guest/);
  assert.match(awardSaveView(true,'connecting',saved,earned).text,/Connecting/);
  assert.match(awardSaveView(false,'failed',saved,earned).text,/Could not connect/);
  assert.equal(awardDeliveryTarget('regular'),3);
});

test('result history observes each snapshot once and clears on room or driver change',()=>{
  const {world,player}=setup(),history=new GameResultHistory(),car=world.entities.find(e=>e.id===player.entityId)!;
  car.inDome=true;Object.assign(world.soccer,{phase:'win',phaseUntil:20,blueScore:5,orangeScore:1,winningPlayers:[player.id]});
  world.soccer.participants.push({playerId:player.id,touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:1,retrofit:0,stock:0}});
  const first=history.observe(world,player.id,'bay','driver-a',1);
  car.inDome=false;
  assert.strictEqual(history.observe(world,player.id,'bay','driver-a',1),first);
  assert.equal(history.observe(world,player.id,'bay','driver-a',2).recent.length,1);
  world.soccer.participants=[];world.soccer.phase='play';
  assert.equal(history.observe(world,player.id,'bay','driver-b',2).recent.length,0);
  assert.equal(history.observe(world,player.id,'other','driver-b',2).recent.length,0);
});
