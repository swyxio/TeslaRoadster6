import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, interact, removePlayer, resetPlayer, step, NEUTRAL, BUILDINGS } from '../shared/game';
import { STATIONS, stationStalls } from '../shared/stations';
import { HILL, terrainHeight } from '../shared/map';
import { trafficInput } from '../shared/traffic';
import { parseMessage, roomCapacity, roomSlug } from '../worker/protocol';

function setup() { const world = createWorld(); const player = addPlayer(world, 'one', 'One'); const car = world.entities.find(e => e.id === player.entityId)!; return { world, player, car }; }
test('authoritative jump and one-tap flip consume air and land', () => {
  const { world, car } = setup();
  const inputs = new Map([['one', { ...NEUTRAL, jump: 1 }]]);
  step(world, inputs, .05);
  inputs.set('one', { ...NEUTRAL, jump: 1, flip: 1 });
  for (let i = 0; i < 20; i++) step(world, inputs, .05);
  assert.ok(car.y > 1); assert.ok(car.stunts === 1); assert.equal(car.air, 67);
  for (let i = 0; i < 80; i++) step(world, inputs, .05);
  assert.equal(car.y, 0); assert.equal(car.roll, 0); assert.equal(car.vy, 0);
});
test('exit, take another car, disconnect keeps ownership consistent', () => {
  const { world, player, car } = setup(); interact(world, player.id);
  const person = world.entities.find(e => e.id === player.entityId)!;
  assert.equal(person.kind, 'person'); assert.equal(car.driver, null);
  const other = world.entities.find(e => e.id === 'parked-1')!;
  person.x = other.x + 3; person.z = other.z;
  interact(world, player.id); assert.equal(player.entityId, other.id); assert.equal(other.driver, player.id);
  removePlayer(world, player.id); assert.equal(other.driver, null); assert.equal(world.players.length, 0);
  assert.ok(!world.entities.some(e => e.id === car.id || e.kind === 'person'));
});
test('collisions stop buildings and transfer motion between cars', () => {
  const { world, car } = setup(); const b = BUILDINGS[0];
  car.x = b.x; car.z = b.z + b.d / 2 + 1.9; car.speed = 40; car.yaw = 0;
  const start = car.z; step(world, new Map(), 0.05); assert.equal(car.z, start); assert.ok(car.speed <= 0); assert.ok(car.health < 100);
  const other = world.entities.find(e => e.id === 'parked-1')!;
  car.x = 0; car.z = 0; car.speed = 10; other.x = 0; other.z = -3.5;
  step(world, new Map(), 0.05); assert.ok(other.speed > 0);
});
test('station stalls refill stopped cars; the aisle and moving cars do not', () => {
  const { world, car } = setup(); world.entities=[car];world.pickups=[];
  for(const station of STATIONS)for(const stall of stationStalls(station)){
    Object.assign(car,{x:stall.x,z:stall.z,y:0,supportId:'ground',air:10,speed:0,vx:0,vy:0,vz:0});
    step(world, new Map(), .05); assert.ok(car.air > 10,stall.id);
  }
  const station=STATIONS[0];
  Object.assign(car,{x:station.x,z:station.z+6,air:10,speed:0});
  step(world,new Map(),.05);assert.equal(car.air,10,'the driving aisle does not refill');
  Object.assign(car,{x:stationStalls(station)[0].x,z:station.z-5,air:10,speed:5});
  step(world, new Map(), .05); assert.equal(car.air, 10);
  car.health = 30; resetPlayer(world, 'one'); assert.equal(car.health, 30); assert.equal(car.air, 10); assert.equal(car.y, 0);
});
test('64-player spawns do not overlap and simulation stays finite', () => {
  const world = createWorld(); for (let i = 0; i < 64; i++) addPlayer(world, `p${i}`, 'Driver');
  const cars = world.entities.filter(e => e.driver);
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) >= 5);
  for (let i = 0; i < 20; i++) step(world, new Map(), 0.05);
  assert.ok(world.entities.every(e => [e.x, e.y, e.z, e.speed].every(Number.isFinite)));
});
test('protocol rejects malformed, non-finite, oversized and out-of-range input', () => {
  assert.ok(parseMessage(JSON.stringify({ type: 'input', input: NEUTRAL })));
  assert.equal(parseMessage('{'), null); assert.equal(parseMessage('x'.repeat(1025)), null);
  assert.equal(parseMessage(JSON.stringify({ type: 'input', input: { ...NEUTRAL, throttle: 2 } })), null);
  assert.equal(parseMessage('{"type":"input","input":{"throttle":1e999}}'), null);
  assert.equal(parseMessage(JSON.stringify({ type: 'input', input: { ...NEUTRAL, boost: 1 } })), null);
  assert.equal(parseMessage(JSON.stringify({ type: 'input', input: { ...NEUTRAL, jump: -1 } })), null);
  assert.ok(parseMessage('{"type":"parking","action":"park"}'));
  assert.equal(parseMessage('{"type":"parking","action":"award"}'),null);
  assert.ok(parseMessage('{"type":"race","action":"join","courseId":"short"}'));
  assert.equal(parseMessage('{"type":"race","action":"finish","courseId":"short","elapsed":0}'),null);
  assert.equal(parseMessage('{"type":"race","action":"join","courseId":"__proto__"}'),null);
  assert.equal(roomSlug('/api/room/bay-1'), 'bay-1'); assert.equal(roomSlug('/api/room/../../bad'), null);
  assert.equal(roomCapacity(), 64); assert.equal(roomCapacity('10000'), 128); assert.equal(roomCapacity('oops'), 64);
});
test('rooftop landing stays supported and can drive off; positive steer turns left', () => {
  const { world, car } = setup(); const roof = BUILDINGS[0];
  car.x = roof.x; car.z = roof.z; car.y = roof.h + 1; car.vy = -5; car.yaw = 0; car.supportId = null;
  for (let i = 0; i < 80; i++) step(world, new Map(), 0.05);
  assert.equal(car.y, roof.h); assert.equal(car.vy, 0);
  for (let i = 0; i < 30; i++) step(world, new Map([['one', { ...NEUTRAL, throttle: 1 }]]), 0.05);
  assert.ok(car.z < roof.z - roof.d / 2); assert.ok(car.y < roof.h);
  car.x = 0; car.z = 0; car.y = 0; car.vy = 0; car.speed = 10; car.yaw = 0; car.supportId = 'ground';
  step(world, new Map([['one', { ...NEUTRAL, steer: 1 }]]), 0.05);
  assert.ok(car.x < 0); assert.ok(car.yaw > 0);
});

test('player braking into a turn slides, then regains grip; straight braking still stops', () => {
  function carAtSpeed() {
    const setupResult = setup();
    setupResult.world.entities = [setupResult.car];
    Object.assign(setupResult.car, { x: 0, z: 0, yaw: 0, speed: 20 });
    return setupResult;
  }
  const slide = carAtSpeed(), normal = carAtSpeed();
  for (let i = 0; i < 12; i++) {
    step(slide.world, new Map([['one', {...NEUTRAL, steer: 1, brake: true}]]), .05);
    step(normal.world, new Map([['one', {...NEUTRAL, steer: 1}]]), .05);
  }
  const slip = Math.hypot(slide.car.pushX, slide.car.pushZ);
  assert.ok(slip > 1); assert.ok(slip > Math.hypot(normal.car.pushX, normal.car.pushZ) + 1);
  for (let i = 0; i < 20; i++) step(slide.world, new Map(), .05);
  assert.ok(Math.hypot(slide.car.pushX, slide.car.pushZ) < slip * .1);
  const reverse = carAtSpeed();
  for (let i = 0; i < 8; i++) step(reverse.world, new Map([['one', {...NEUTRAL, steer: -1, throttle: -1}]]), .05);
  assert.ok(Math.hypot(reverse.car.pushX, reverse.car.pushZ) > 1);
  const straight = carAtSpeed();
  for (let i = 0; i < 60; i++) step(straight.world, new Map([['one', {...NEUTRAL, brake: true}]]), .05);
  assert.equal(straight.car.speed, 0); assert.equal(Math.hypot(straight.car.pushX, straight.car.pushZ), 0);
});

test('pickups refill resources once and return after twenty simulation seconds', () => {
  const world = createWorld();
  const player = addPlayer(world, 'collector', 'Collector');
  const car = world.entities.find(e => e.id === player.entityId)!;
  const pickup = world.pickups.find(p => p.kind === 'repair')!;
  car.x = pickup.x; car.z = pickup.z; car.health = 10;
  step(world, new Map(), .05);
  assert.equal(car.health, 100); assert.equal(pickup.active, false);
  car.x = 0; car.z = 0;
  for (let i = 0; i < 401; i++) step(world, new Map(), .05);
  assert.equal(pickup.active, true);
});


test('occupied autopilot brakes and turns without involuntary drift', () => {
  const {world,car}=setup();world.entities=[car];
  Object.assign(car,{x:-20,z:-57,y:0,yaw:0,speed:20,autopilot:true,routeId:2,waypoint:1});
  const input=trafficInput(car,world);assert.ok(input.brake);assert.ok(Math.abs(input.steer)>.1);
  step(world,new Map(),.05);
  assert.equal(car.autopilot,true);assert.ok(Math.hypot(car.pushX,car.pushZ)<1e-9);
});

test('drift keeps a high-speed car on the shared hill surface', () => {
  const {world,car}=setup();world.entities=[car];
  const x=HILL.minX+40,z=(HILL.minZ+HILL.maxZ)/2;
  Object.assign(car,{x,z,y:terrainHeight(x,z),yaw:-Math.PI/2,speed:30,supportId:'ground'});
  let maxSlip=0;
  for(let i=0;i<8;i++){
    step(world,new Map([['one',{...NEUTRAL,steer:1,brake:true}]]),.05);
    maxSlip=Math.max(maxSlip,Math.hypot(car.pushX,car.pushZ));
    assert.equal(car.supportId,'ground');assert.ok(Math.abs(car.y-terrainHeight(car.x,car.z)!)<1e-7);
  }
  assert.ok(maxSlip>1);
});
