import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, interact, makeEntity, NEUTRAL, parkingAction, raceAction, step, travelDome } from '../shared/game';
import { DOME } from '../shared/dome';
import { FERRY_TRAVEL_SECONDS } from '../shared/ferry';
import { domeSurface, FERRY_DOCKS } from '../shared/map';
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

test('a ferry passenger returns from the Dome to the ferry destination', async () => {
  const { isRocketIsland } = await import('../shared/map');
  for (const phase of ['to-island', 'to-sf'] as const) {
    const { world, car } = setup();
    world.ferry.phase = phase; world.ferry.remaining = FERRY_TRAVEL_SECONDS;
    world.ferry.z = phase === 'to-island' ? FERRY_DOCKS.sf.deckZ : FERRY_DOCKS.island.deckZ;
    Object.assign(car, { x: 0, z: world.ferry.z, y: 0, supportId: 'ferry' });
    world.ferry.passengers = [{ entityId: car.id, x: 0, z: 0 }];
    assert.ok(travelDome(world, 'p'));
    assert.equal(car.domeReturn, phase === 'to-island' ? 'island' : 'sf');
    assert.ok(travelDome(world, 'p'));
    assert.equal(isRocketIsland(car.x, car.z), phase === 'to-island');
  }
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

test('the island and dome are connected by drivable protected land', async () => {
  const { isRocketIsland, terrainHeight } = await import('../shared/map');
  const { world, car } = setup(); world.pickups=[];
  for(let z=-1120;z<=-940;z+=5){
    assert.equal(terrainHeight(300,z),0,`continuous surface at ${z}`);
    assert.ok(isRocketIsland(300,z),`police-free island at ${z}`);
  }
  Object.assign(car,{x:300,z:-1115,y:0,yaw:Math.PI,speed:0,supportId:'ground'});
  for(let i=0;i<1200&&!car.inDome;i++)step(world,new Map([['p',{...NEUTRAL,throttle:.35}]]),.05);
  assert.ok(car.inDome,'a car can drive from the island into the dome');
  assert.equal(car.domeReturn,'island');
  assert.ok(travelDome(world,'p'));
  assert.equal(car.inDome,false);
  assert.ok(isRocketIsland(car.x,car.z),'leaving returns an island visitor to the island');
});

test('a dome shortcut from the Bay returns to the Bay while an island shortcut returns to the island', async () => {
  const { isRocketIsland } = await import('../shared/map');
  for(const island of [false,true]){
    const {world,car}=setup();
    if(island)Object.assign(car,{x:0,z:-1150,y:0,supportId:'ground'});
    assert.ok(travelDome(world,'p'));assert.equal(car.domeReturn,island?'island':'sf');
    assert.ok(travelDome(world,'p'));assert.equal(isRocketIsland(car.x,car.z),island);
  }
});

test('a fly-in or shortcut returns to the last supported side even after flying over Dome land', async () => {
  const { isRocketIsland } = await import('../shared/map');
  for (const island of [false, true]) for (const shortcut of [false, true]) {
    const { world, car } = setup(); world.pickups = [];
    if (island) Object.assign(car, { x: 0, z: -1150, y: 0, supportId: 'ground' });
    step(world, new Map([['p', { ...NEUTRAL, jump: 1 }]]), .05);
    assert.equal(car.supportId, null, 'the flight begins from supported land');
    // Continue the flight over the protected Dome land, above the roof.
    Object.assign(car, { x: DOME.x - 15, z: DOME.z, y: 52, vx: 0, vy: -8, vz: 0 });
    step(world, new Map(), .05);
    assert.equal(car.inDome, false);
    if (shortcut) assert.ok(travelDome(world, 'p'));
    else {
      for (let i = 0; i < 40 && !car.inDome; i++) step(world, new Map(), .05);
      assert.ok(car.inDome, 'the car enters through the roof');
    }
    assert.equal(car.domeReturn, island ? 'island' : 'sf');
    assert.ok(travelDome(world, 'p'));
    assert.equal(isRocketIsland(car.x, car.z), island, 'the return goes back to the departure side');
  }
});

test('walking from the island into the Dome returns to the island', async () => {
  const { isRocketIsland } = await import('../shared/map');
  const { world, player } = setup(); world.pickups = [];
  interact(world, player.id);
  const person = world.entities.find(e => e.id === player.entityId)!;
  assert.equal(person.kind, 'person');
  Object.assign(person, { x: 300, z: -940, y: 0, yaw: Math.PI, supportId: 'ground' });
  for (let i = 0; i < 300 && !person.inDome; i++) step(world, new Map([['p', { ...NEUTRAL, throttle: 1 }]]), .05);
  assert.ok(person.inDome, 'the pedestrian walks into the Dome');
  assert.equal(person.domeReturn, 'island');
  assert.ok(travelDome(world, player.id));
  assert.ok(isRocketIsland(person.x, person.z));
});


test('an island Dome visitor keeps their return side when walking or changing cars', async () => {
  const { isRocketIsland } = await import('../shared/map');
  const { world, player, car } = setup();
  Object.assign(car, { x: 0, z: -1150, y: 0, supportId: 'ground' });
  assert.ok(travelDome(world, player.id));
  assert.equal(car.domeReturn, 'island');
  interact(world, player.id);
  const person = world.entities.find(e => e.id === player.entityId)!;
  assert.equal(person.kind, 'person');
  assert.equal(person.domeReturn, 'island');
  interact(world, player.id);
  assert.equal(player.entityId, car.id);
  assert.equal(car.domeReturn, 'island');
  assert.ok(chooseVehicle(world, player.id, 'model-3'));
  const replacement = world.entities.find(e => e.id === player.entityId)!;
  assert.equal(replacement.domeReturn, 'island');
  assert.ok(travelDome(world, player.id));
  assert.ok(isRocketIsland(replacement.x, replacement.z));
});
