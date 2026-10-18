import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, travelDome, type World } from '../shared/game';
import { newPolice, updatePolice } from '../shared/police';
import { DOME } from '../shared/dome';

function setup() {
  const world = createWorld(), player = addPlayer(world, 'p', 'Driver');
  const car = world.entities.find(entity => entity.id === player.entityId)!;
  world.entities = [car];
  world.pickups = [];
  return { world, player, car };
}
function tick(world: World, count = 1) {
  for (let i = 0; i < count; i++) step(world, new Map([['p', { ...NEUTRAL, steer: 1 }]]), .05);
}
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${expected}, got ${actual}`);
}

test('entering the dome clears a pursuit and prevents detection, flight fines and tickets', () => {
  const { world, player, car } = setup();
  const cop = makeEntity('cop', 'model-3', 0, 0);
  cop.police = newPolice();
  cop.npc = true;
  world.entities.push(cop);
  // A regular car rests on the dome floor, so it can share a physical support
  // with the cop in the ticket-distance check.
  car.kind = 'model-3';
  Object.assign(car, { x: 0, z: 30, y: 10, supportId: null });
  for (let i = 0; i < 100; i++) { world.time += .05; updatePolice(world, .05); }
  assert.equal(cop.police.targetId, player.id);
  assert.ok(player.delivery.flight.seconds > 4);
  assert.ok(player.delivery.flight.peakHeight >= 10);

  assert.equal(travelDome(world, player.id), true);
  assert.equal(car.inDome, true);
  Object.assign(cop, { x: car.x + 3, y: car.y, z: car.z, supportId: 'ground' });
  const { cash, tickets, lastTicket } = player.delivery;
  updatePolice(world, .05);
  assert.equal(cop.police.targetId, null, 'the active chase ends before a nearby cop can ticket');
  assert.equal(player.delivery.flight.seconds, 0);
  assert.equal(player.delivery.flight.peakHeight, 0);
  assert.equal(player.delivery.tickets, tickets);
  assert.equal(player.delivery.cash, cash);
  assert.equal(player.delivery.lastTicket, lastTicket);

  // Even an airborne vehicle in sight of a cop cannot restart a pursuit or
  // accrue flight time that would later add to a fine.
  Object.assign(car, { y: 10, supportId: null });
  cop.y = 10;
  for (let i = 0; i < 100; i++) { world.time += .05; updatePolice(world, .05); }
  assert.equal(cop.police.targetId, null);
  assert.equal(player.delivery.flight.seconds, 0);
  assert.equal(player.delivery.flight.peakHeight, 0);
  assert.equal(player.delivery.tickets, tickets);
  assert.equal(player.delivery.cash, cash);
  assert.equal(player.delivery.lastTicket, lastTicket);
});

test('a natural fly-in immediately pauses its order and clears a police pursuit',()=>{
  const {world,player,car}=setup();
  const cop=makeEntity('cop','model-3',0,0);cop.police=newPolice();cop.police.targetId=player.id;world.entities.push(cop);
  player.delivery.flight.seconds=7;player.delivery.flight.peakHeight=20;
  Object.assign(car,{x:DOME.x-20,z:DOME.z,y:10,supportId:null,autopilot:true});
  const elapsed=player.delivery.order.elapsed,active=player.delivery.activeSeconds;
  tick(world);
  assert.equal(car.inDome,true);assert.equal(car.autopilot,false);assert.equal(cop.police.targetId,null);
  assert.equal(player.delivery.flight.seconds,0);assert.equal(player.delivery.order.elapsed,elapsed);
  close(player.delivery.activeSeconds,active+.05);
});

for (const stage of ['pickup', 'dropoff'] as const) {
  test(`${stage} timer pauses in the dome while active play time continues, then resumes`, () => {
    const { world, player, car } = setup();
    const order = player.delivery.order;
    order.stage = stage;
    order.elapsed = 5;
    tick(world);
    close(order.elapsed, 5.05);
    const elapsed = order.elapsed, active = player.delivery.activeSeconds;

    assert.equal(travelDome(world, player.id), true);
    assert.equal(car.inDome, true);
    tick(world, 20);
    close(order.elapsed, elapsed);
    close(player.delivery.activeSeconds, active + 1);
    assert.equal(order.stage, stage);
    assert.equal(player.delivery.completed, 0);

    assert.equal(travelDome(world, player.id), true);
    assert.equal(car.inDome, false);
    tick(world);
    close(order.elapsed, elapsed + .05);
    close(player.delivery.activeSeconds, active + 1.05);
  });
}
