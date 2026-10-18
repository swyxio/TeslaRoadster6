import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { isRocketIsland, terrainHeight } from '../shared/map';
import { DOME } from '../shared/dome';

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

test('a head-on airborne collision keeps both vehicles within the flight speed limit', () => {
  const world = createWorld();
  const light = makeEntity('light', 'waymo-firefly', 0, -1500);
  const heavy = makeEntity('heavy', 'tesla-semi', 0, -1488.4);
  Object.assign(light, { y: 1.5, yaw: Math.PI, supportId: null, speed: 75, vz: 75 });
  Object.assign(heavy, { y: 1.5, yaw: 0, supportId: null, speed: 72, vz: -72 });
  world.entities = [light, heavy];
  world.players = [];
  world.pickups = [];
  // The initial separation puts the collision in the last physics substep.
  step(world, new Map(), dt);
  assert.ok(light.health < 100 && heavy.health < 100, 'the vehicles must actually collide');
  assert.ok(light.vz < 0, 'the heavier vehicle rebounds the light vehicle');
  for (const car of [light, heavy]) {
    const speed = Math.hypot(car.vx, car.vy, car.vz);
    assert.ok(speed <= 80.000001, `${car.id} exceeded the flight speed limit: ${speed} m/s`);
  }
});

test('damage damping depends on elapsed time, not other vehicles changing substeps', () => {
  const run = (health: number, fastNeighbor: boolean) => {
    const world = createWorld();
    const car = makeEntity('damaged', 'roadster', 0, -1500);
    Object.assign(car, { speed: 10, health });
    world.entities = [car];
    world.players = [];
    world.pickups = [];
    if (fastNeighbor) {
      const neighbor = makeEntity('distant-flight', 'roadster', 0, -1800);
      Object.assign(neighbor, { y: 80, supportId: null, vx: 80 });
      world.entities.push(neighbor);
    }
    step(world, new Map(), dt);
    assert.equal(car.supportId, 'ground');
    return car.speed;
  };
  const healthy = run(100, false);
  const damaged = run(19, false);
  const damagedWithFastNeighbor = run(19, true);
  assert.ok(Math.abs(damaged - healthy * .995) < 1e-9, 'the 50 ms reference damping is preserved');
  assert.ok(Math.abs(damaged - damagedWithFastNeighbor) < 1e-9, 'a distant fast vehicle must not add braking');
});

test('a dome-supported vehicle cannot knock an airborne car beyond the flight speed limit', () => {
  const world = createWorld();
  const light = makeEntity('light', 'waymo-firefly', DOME.x, DOME.z - 11.6);
  const heavy = makeEntity('heavy', 'tesla-semi', DOME.x, DOME.z, 'heavy-driver');
  Object.assign(light, { y: 1.5, yaw: Math.PI, inDome: true, supportId: null, speed: 75, vz: 75 });
  Object.assign(heavy, { inDome: true, supportId: 'dome', domeS: DOME.flatHalfWidth, speed: 72, upgrades: { ...heavy.upgrades, rocket: true } });
  world.entities = [light, heavy];
  world.players = [];
  world.pickups = [];
  step(world, new Map([['heavy-driver', { ...NEUTRAL, throttle: 1, boost: true }]]), dt);
  assert.ok(light.health < 100 && heavy.health < 100, 'the vehicles must actually collide in the dome');
  assert.ok(light.vz < 0, 'the airborne car rebounds');
  const speed = Math.hypot(light.vx, light.vy, light.vz);
  assert.ok(speed <= 80.000001, `the dome collision exceeded the flight speed limit: ${speed} m/s`);
});
