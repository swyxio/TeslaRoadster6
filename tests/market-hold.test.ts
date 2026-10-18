import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { body, contact } from '../shared/physics';
import { canHoldMarketPlayer, captureMarketHold, withMarketHolds } from '../worker/market-hold';

test('market hold rejects movement, shared rides, pursuits and active games',()=>{
  const world=createEmptyWorld(),player=addPlayer(world,'one','One'),car=world.entities.find(item=>item.id===player.entityId)!;
  assert.equal(canHoldMarketPlayer(world,player.id),true);
  car.speed=1;assert.equal(canHoldMarketPlayer(world,player.id),false);car.speed=0;
  car.owner='other';assert.equal(canHoldMarketPlayer(world,player.id),false);car.owner=player.id;
  const cop=makeEntity('cop','model-3',car.x+40,car.z);cop.police={targetId:player.id,lastSeen:0,nextPlan:0,path:[]};world.entities.push(cop);
  assert.equal(canHoldMarketPlayer(world,player.id),false);cop.police.targetId=null;
  world.races.rounds.push({courseId:'short',phase:'active',hostId:player.id,openedAt:0,startedAt:0,endsAt:100,starterCount:1,entrants:[{playerId:player.id,entityId:car.id,status:'entered',nextGate:0,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:car.x,y:car.y,z:car.z,time:0}}]});
  assert.equal(canHoldMarketPlayer(world,player.id),false);
});

test('held driver does not advance delivery or physics while another driver continues',()=>{
  const world=createEmptyWorld(),held=addPlayer(world,'held','Held'),other=addPlayer(world,'other','Other');
  const hold=captureMarketHold(world,held.id,'tx','fence')!,otherCar=world.entities.find(item=>item.id===other.entityId)!;
  const before={x:hold.car.x,z:hold.car.z,delivery:structuredClone(held.delivery)},otherBefore={x:otherCar.x,z:otherCar.z};
  const input=new Map([[other.id,{...NEUTRAL,throttle:1}]]);
  for(let i=0;i<100;i++)withMarketHolds(world,[hold],()=>step(world,input,.05));
  assert.deepEqual({x:hold.car.x,z:hold.car.z,delivery:held.delivery},before);
  assert.ok(Math.hypot(otherCar.x-otherBefore.x,otherCar.z-otherBefore.z)>1);
  assert.ok(world.players.includes(held));assert.ok(world.entities.includes(hold.car));
});

test('traffic entering a held position causes collision-checked relocation',()=>{
  const world=createEmptyWorld(),held=addPlayer(world,'held','Held'),hold=captureMarketHold(world,held.id,'tx','fence')!;
  const blocker=makeEntity('blocker','model-3',hold.car.x,hold.car.z);blocker.y=hold.car.y;
  const relocated=withMarketHolds(world,[hold],()=>world.entities.push(blocker));
  assert.ok(relocated.has(held.id));assert.ok(world.entities.includes(hold.car));
  assert.equal(contact(body(hold.car),body(blocker)),null);
});

test('an arrival at the hold boundary completes after resume, and an approaching police car cannot stop a held player',()=>{
  const world=createEmptyWorld(),held=addPlayer(world,'held','Held'),car=world.entities.find(item=>item.id===held.entityId)!;
  Object.assign(car,{x:-120,z:60,y:0,supportId:'ground'});
  Object.assign(held.delivery.order,{customer:0,stage:'dropoff'});
  const hold=captureMarketHold(world,held.id,'tx','fence')!;
  const cop=makeEntity('cop','model-3',-150,60);cop.police={targetId:null,lastSeen:0,nextPlan:0,path:[]};world.entities.push(cop);
  for(let i=0;i<5;i++)withMarketHolds(world,[hold],()=>step(world,new Map(),.05));
  assert.equal(held.delivery.completed,0);assert.equal(held.delivery.tickets,0);assert.equal(cop.police.targetId,null);
  step(world,new Map(),.05);
  assert.equal(held.delivery.completed,1);assert.equal(held.delivery.tickets,0);
});
