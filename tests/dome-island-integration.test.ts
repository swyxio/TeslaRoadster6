import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, parkingAction, raceAction, step, travelDome } from '../shared/game';
import { DOME } from '../shared/dome';
import { FERRY_TRAVEL_SECONDS } from '../shared/ferry';
import { domeSurface } from '../shared/map';
import { hasRockets } from '../shared/upgrades';

function setup() {
  const world = createWorld();
  world.entities = []; world.players = [];
  const player = addPlayer(world, 'p', 'Driver');
  const car = world.entities.find(e => e.id === player.entityId)!;
  return { world, player, car };
}

test('a collected Rocket upgrade powers permanent dome adhesion', () => {
  const { world, car } = setup();
  car.kind = 'model-3';
  Object.assign(car, { x: 0, z: -1160, y: 0, supportId: 'ground' });
  step(world, new Map(), .05);
  assert.ok(hasRockets(car));
  assert.ok(travelDome(world, 'p'));
  assert.ok(hasRockets(car));
  assert.equal(car.supportId, 'dome');
  Object.assign(car, { x: DOME.x - 30, z: DOME.z, domeS: DOME.flatHalfWidth, yaw: 0, speed: 45 });
  for (let i = 0; i < 100 && car.y < 49.99; i++) {
    step(world, new Map([['p', { ...NEUTRAL, throttle: 1 }]]), .05);
    assert.equal(car.supportId, 'dome');
  }
  assert.ok(car.y > 49.99, `reached ${car.y} m`);
  const ceiling = 3 * DOME.flatHalfWidth + Math.PI * DOME.radius;
  const surface = domeSurface(ceiling);
  Object.assign(car, { x: DOME.x - 30, y: surface.y, z: surface.z, domeS: ceiling, yaw: 0, speed: 17, vx: 0, vy: 0, vz: 17 });
  world.time += 120;
  step(world, new Map(), .02);
  assert.equal(car.supportId, 'dome');
  assert.ok(car.domeS !== null && hasRockets(car));
});

test('upgraded ordinary vehicles remain attached when they collide on the dome wall', () => {
  const { world } = setup();
  world.players = []; world.pickups = [];
  const center = 2 * DOME.flatHalfWidth + Math.PI * DOME.radius / 2;
  const cars = [center - 2.1, center + 2.1].map((arc, i) => {
    const surface = domeSurface(arc), car = makeEntity(`car-${i}`, 'model-3', DOME.x, surface.z);
    Object.assign(car, { inDome: true, supportId: 'dome', domeS: arc, y: surface.y, yaw: 0, speed: i === 0 ? -8 : 8 });
    car.upgrades.rocket = true;
    return car;
  });
  world.entities = cars;
  step(world, new Map(), .05);
  assert.ok(cars.every(car => car.supportId === 'dome'));
  assert.ok(cars[0].speed > 0 && cars[1].speed < 0, 'both vehicles rebound');
});

test('dome travel releases the moving ferry passenger without moving other passengers', () => {
  const { world, car } = setup();
  const second = addPlayer(world, 'other', 'Other');
  const other = world.entities.find(e => e.id === second.entityId)!;
  world.ferry.phase = 'to-island'; world.ferry.remaining = FERRY_TRAVEL_SECONDS;
  Object.assign(car, { x: -3, z: world.ferry.z, y: 0, supportId: 'ferry', air: 41, health: 73 });
  Object.assign(other, { x: 3, z: world.ferry.z, y: 0, supportId: 'ferry' });
  world.ferry.passengers = [{ entityId: car.id, x: -3, z: 0 }, { entityId: other.id, x: 3, z: 0 }];
  assert.ok(travelDome(world, 'p'));
  assert.deepEqual(world.ferry.passengers.map(p => p.entityId), [other.id]);
  step(world, new Map(), .05);
  assert.equal(car.inDome, true);
  assert.equal(car.supportId, 'dome');
  assert.deepEqual([car.air, car.health], [41, 73]);
  assert.equal(other.supportId, 'ferry');
  assert.equal(other.z, world.ferry.z);
});

test('dome travel withdraws parking and marks an active race DNF before relocation', () => {
  const parked = setup();
  Object.assign(parked.car, { x: 90, z: -1190, y: 0, supportId: 'ground' });
  assert.ok(parkingAction(parked.world, 'p', 'park'));
  assert.ok(travelDome(parked.world, 'p'));
  assert.equal(parked.world.parking.rounds.length, 0);

  const racing = setup();
  Object.assign(racing.car, { x: 0, z: -1330, y: 0, supportId: 'ground' });
  assert.ok(raceAction(racing.world, 'p', 'join', 'short'));
  assert.ok(raceAction(racing.world, 'p', 'start', 'short'));
  for (let i = 0; i < 61; i++) step(racing.world, new Map(), .05);
  const round = racing.world.races.rounds[0], entrant = round.entrants[0];
  assert.equal(round.phase, 'active');
  const gate = entrant.nextGate;
  assert.ok(travelDome(racing.world, 'p'));
  step(racing.world, new Map(), .05);
  assert.equal(entrant.status, 'dnf');
  assert.equal(entrant.nextGate, gate);
});
