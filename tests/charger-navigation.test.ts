import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createEmptyWorld,makeEntity,NEUTRAL,setChargerDestination,step} from '../shared/game';
import {refillStationFor} from '../shared/charging';
import {STATIONS,stationStalls} from '../shared/stations';

function setup(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(e=>e.id===player.entityId)!;car.air=10;
  return {world,player,car};
}

for(const mode of ['road','intercity','jump','sky'] as const)test(`${mode} charger navigation drives to a real bay and refills before reporting arrival`,()=>{
  const {world,car}=setup(),start={x:car.x,z:car.z};
  car.upgrades.autonomyIntercity=true;car.upgrades.autonomyJump=true;car.upgrades.autonomySky=true;
  assert.equal(setChargerDestination(world,'driver',mode),true);
  assert.deepEqual({x:car.x,z:car.z},start,'request does not move the car');
  const nav=car.navigation!;assert.equal(nav.chargerStationId,'sf-16th');
  for(let i=0;i<2400&&nav.status==='driving';i++)step(world,new Map(),.05);
  assert.equal(nav.status,'arrived');assert.equal(car.autopilot,false);
  assert.equal(refillStationFor(car)?.id,nav.chargerStationId);
  assert.ok(Math.abs(car.x-nav.destination.x)<2.25&&Math.abs(car.z-nav.destination.z)<4.5);
  assert.ok(car.air>10,'actual refill occurred before arrival');
});

test('charger navigation skips occupied bays and manual input takes over',()=>{
  const {world,car}=setup(),station=STATIONS.find(s=>s.id==='sf-16th')!;
  for(const stall of stationStalls(station))world.entities.push(makeEntity(`blocker-${stall.id}`,'model-3',stall.x,stall.z));
  assert.equal(setChargerDestination(world,'driver'),true);
  assert.notEqual(car.navigation?.chargerStationId,station.id);
  step(world,new Map([['driver',{...NEUTRAL,throttle:1}]]),.05);
  assert.equal(car.navigation,null);assert.equal(car.autopilot,false);
});

test('charger navigation rejects airborne and invalid drivers without changing their pose',()=>{
  const {world,car}=setup();car.supportId=null;const x=car.x,z=car.z;
  assert.equal(setChargerDestination(world,'driver'),false);
  assert.equal(setChargerDestination(world,'missing'),false);
  assert.equal(car.navigation,null);assert.deepEqual({x:car.x,z:car.z},{x,z});
});

test('a car already in a charging bay can start the trip and refill there',()=>{
  const {world,car}=setup(),stall=stationStalls(STATIONS.find(s=>s.id==='sf-16th')!)[0];
  Object.assign(car,{x:stall.x,z:stall.z,y:0,speed:0});
  assert.equal(setChargerDestination(world,'driver'),true);
  for(let i=0;i<1200&&car.navigation?.status==='driving';i++)step(world,new Map(),.05);
  assert.equal(car.navigation?.status,'arrived');assert.ok(car.air>10);
});
