import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, buyUpgrade, chooseVehicle, createWorld, NEUTRAL, step, subscribeOta } from '../shared/game';
import { hasRockets } from '../shared/upgrades';
import { bankSurface, cliffPose } from '../shared/island-stunts';

test('an island Rocket pad refills an upgraded tank and enables its scaled jump', () => {
  const world = createWorld();
  const player = addPlayer(world, 'p', 'Player');
  assert.equal(chooseVehicle(world, player.id, 'model-3'), true);
  const car = world.entities.find(entity => entity.id === player.entityId)!;
  world.entities = [car];
  Object.assign(car, { x: 0, y: 0, z: -1160, supportId: 'ground', tankLevel: 3, air: 2 });
  assert.equal(hasRockets(car), false);

  step(world, new Map([[player.id, NEUTRAL]]), .05);
  assert.equal(hasRockets(car), true);
  assert.equal(car.tankLevel, 3);
  assert.equal(car.air, 100);
  assert.equal(world.pickups.find(pickup => pickup.id === 'rocket-island')!.active, false);

  step(world, new Map([[player.id, { ...NEUTRAL, jump: 1 }]]), .05);
  assert.equal(car.supportId, null);
  assert.ok(car.vy > 0);
  assert.equal(car.air, 94);
});

test('a secured ferry passenger keeps delivery paused while OTA renews and upgrades the tank', () => {
  const world = createWorld();
  const player = addPlayer(world, 'p', 'Player');
  const car = world.entities.find(entity => entity.id === player.entityId)!;
  world.entities = [car];
  player.delivery.cash = 3_300;
  assert.equal(subscribeOta(world, player.id, true), true);
  Object.assign(car, { x: 0, y: 0, z: -500, supportId: 'ferry', tankLevel: 2, air: 42 });
  Object.assign(world.ferry, { phase: 'to-island', z: -500, remaining: 30,
    passengers: [{ entityId: car.id, x: 0, z: 0 }] });
  world.time = 120;
  const orderElapsed = player.delivery.order.elapsed;

  step(world, new Map([[player.id, { ...NEUTRAL, throttle: 1, hover: true, boost: true, jump: 1, flip: 1 }]]), .05);
  assert.equal(car.supportId, 'ferry');
  assert.equal(car.air, 42);
  assert.equal(car.thrusters, 0);
  assert.equal(car.z, world.ferry.z);
  assert.equal(player.delivery.order.elapsed, orderElapsed);
  assert.equal(player.cockpit.orderEligible, true);
  assert.equal(player.delivery.cash, 3_100);
  assert.equal(player.delivery.ota.active, true);
  assert.ok(player.delivery.ota.renewAt! > world.time);

  assert.equal(buyUpgrade(world, player.id, 'tank'), true);
  assert.equal(car.tankLevel, 3);
  assert.equal(car.air, 100);
  assert.equal(player.delivery.cash, 100);
  assert.equal(car.supportId, 'ferry');
});


test('low-air jumps launch away from the island bank and cliff', () => {
  for (const surface of ['bank', 'cliff'] as const) {
    const world = createWorld();
    const player = addPlayer(world, 'p', 'Player');
    const car = world.entities.find(entity => entity.id === player.entityId)!;
    world.entities = [car];
    world.pickups = [];
    const bank = bankSurface(80, -1750)!;
    const cliff = cliffPose(.8);
    if (surface === 'bank') Object.assign(car, { x: 80, y: bank.height, z: -1750, supportId: 'island-bank', air: 12 });
    else Object.assign(car, { ...cliff.point, supportId: 'island-cliff', loopAngle: .8, air: 12 });
    const normal = surface === 'bank' ? bank.normal : cliff.normal;
    step(world, new Map([[player.id, { ...NEUTRAL, jump: 1 }]]), .05);
    assert.equal(car.supportId, null);
    assert.equal(car.air, 0);
    assert.ok(car.vx * normal.x + car.vy * normal.y + car.vz * normal.z > 4.5, `${surface} jumps away from its surface`);
    if (surface === 'bank') assert.ok(car.vz < -.5, 'the bank normal produces sideways velocity');
    else assert.ok(car.vx < -3, 'the cliff normal pushes inward');
  }
});
