import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, interact, removePlayer, resetPlayer, step, NEUTRAL, BUILDINGS } from '../shared/game';
import { STATIONS } from '../shared/stations';
import { parseMessage, roomCapacity, roomSlug } from '../worker/protocol';

function setup() { const world = createWorld(); const player = addPlayer(world, 'one', 'One'); const car = world.entities.find(e => e.id === player.entityId)!; return { world, player, car }; }
test('authoritative inputs move forward and airborne stunts consume air then land', () => {
  const { world, car } = setup(); const start = car.z;
  const inputs = new Map([['one', { ...NEUTRAL, throttle: 1, lift: true, roll: 1 }]]);
  for (let i = 0; i < 20; i++) step(world, inputs, 0.05);
  assert.ok(car.z < start); assert.ok(car.y > 1); assert.ok(car.roll > 0); assert.ok(car.air < 100);
  car.speed = 0;
  for (let i = 0; i < 100; i++) step(world, new Map(), 0.05);
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
  car.x = b.x; car.z = b.z + b.d / 2 + 1.9; car.speed = 40;
  const start = car.z; step(world, new Map(), 0.05); assert.equal(car.z, start); assert.ok(car.speed < 0); assert.ok(car.health < 100);
  const other = world.entities.find(e => e.id === 'parked-1')!;
  car.x = 0; car.z = 0; car.speed = 10; other.x = 0; other.z = -3.5;
  step(world, new Map(), 0.05); assert.ok(other.speed > 0);
});
test('stations refill only stopped cars; recovery does not manufacture air or health', () => {
  const { world, car } = setup(); const station = STATIONS[0];
  car.x = station.x; car.z = station.z; car.air = 10; car.speed = 0;
  step(world, new Map(), 0.05); assert.ok(car.air > 10);
  car.air = 10; car.speed = 5; step(world, new Map(), 0.05); assert.equal(car.air, 10);
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
  assert.equal(roomSlug('/api/room/bay-1'), 'bay-1'); assert.equal(roomSlug('/api/room/../../bad'), null);
  assert.equal(roomCapacity(), 64); assert.equal(roomCapacity('10000'), 128); assert.equal(roomCapacity('oops'), 64);
});
test('rooftop landing stays supported and can drive off; positive steer turns left', () => {
  const { world, car } = setup(); const roof = BUILDINGS[0];
  car.x = roof.x; car.z = roof.z; car.y = roof.h + 1; car.vy = -5;
  for (let i = 0; i < 80; i++) step(world, new Map(), 0.05);
  assert.equal(car.y, roof.h); assert.equal(car.vy, 0);
  for (let i = 0; i < 30; i++) step(world, new Map([['one', { ...NEUTRAL, throttle: 1 }]]), 0.05);
  assert.ok(car.z < roof.z - roof.d / 2); assert.ok(car.y < roof.h);
  car.x = 0; car.z = 0; car.y = 0; car.vy = 0; car.speed = 10; car.yaw = 0;
  step(world, new Map([['one', { ...NEUTRAL, steer: 1 }]]), 0.05);
  assert.ok(car.x < 0); assert.ok(car.yaw > 0);
});
