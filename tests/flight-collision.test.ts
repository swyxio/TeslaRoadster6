import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { isRocketIsland, terrainHeight } from '../shared/map';

const flightInput = { ...NEUTRAL, throttle: 1, boost: true, hover: true };
const dt = .05;

function sustainedFlight() {
  const world = createWorld();
  const car = makeEntity('flight', 'roadster', 0, -1800, 'pilot');
  Object.assign(car, { y: 90, yaw: Math.PI, supportId: null, tankLevel: 5 });
  world.entities = [car];
  world.players = [];
  world.pickups = [];
  const inputs = new Map([['pilot', flightInput]]);
  for (let tick = 0; tick < 480; tick++) {
    // Keep the long, straight flight within map bounds without changing velocity.
    if (tick === 300) car.z = -1800;
    step(world, inputs, dt);
  }
  return { world, car, inputs };
}

test('max-tank sustained flight reaches the game target without unlimited acceleration', () => {
  const { car } = sustainedFlight();
  const speed = Math.hypot(car.vx, car.vy, car.vz);
  assert.ok(car.air > 0, 'the tank is still powering the flight');
  assert.ok(speed >= 72, `flight should retain the 259 km/h target, got ${speed} m/s`);
  assert.ok(speed <= 80.000001, `sustained flight exceeded 80 m/s: ${speed} m/s`);
});

test('sustained flight collides with an opposing car on supported Rocket Island terrain', () => {
  const { world, car, inputs } = sustainedFlight();
  const opponent = makeEntity('opponent', 'roadster', 0, -1600, 'other');
  Object.assign(opponent, { yaw: 0, speed: 50, vz: -50 });
  // Set an intentionally adverse phase for the old eight-substep sampler.
  // The fixture relocates the flight but retains its actual sustained velocity.
  const separation = Math.max(20, 2.5 * (Math.abs(car.vz) + 50) * dt / 8);
  Object.assign(car, { x: 0, y: 1, z: opponent.z - separation });
  assert.ok(isRocketIsland(car.x, car.z) && isRocketIsland(opponent.x, opponent.z));
  assert.equal(terrainHeight(car.x, car.z), 0);
  assert.equal(opponent.supportId, 'ground');
  world.entities.push(opponent);
  inputs.set('other', { ...NEUTRAL, throttle: 1 });
  for (let tick = 0; tick < 20 && opponent.health === 100; tick++) step(world, inputs, dt);
  assert.ok(opponent.health < 100, `the opposing car was missed: flight z=${car.z}, opponent z=${opponent.z}`);
});
