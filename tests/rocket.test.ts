import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRocket, ROCKET_DURATION, ROCKET_PAD_COOLDOWN, updateRocketPickup } from '../shared/rocket';
import { VEHICLE_IDS, VEHICLES, type VehicleId } from '../shared/vehicles';
import { createVehicle, setThrusterEffects } from '../src/vehicles';
import { makeEntity, THRUSTER_REAR, THRUSTER_SIDE_LEFT } from '../shared/game';

function car(id: string, kind: VehicleId | 'person' = 'model-3') {
  const entity = makeEntity(id, kind, 0, 0, id); entity.air = 12; return entity;
}
function pad() { return { x: 0, z: 0, active: true, readyAt: 0 }; }

test('Rocket pads choose a stable winner, cool down and refresh without stacking', () => {
  for (const reverse of [false, true]) {
    const a = car('a'), b = car('b'), pickup = pad();
    assert.equal(updateRocketPickup(pickup, reverse ? [b, a] : [a, b], 100), 'a');
    assert.equal(a.air, 100);
    assert.equal(a.rocketUntil, 100 + ROCKET_DURATION);
    assert.equal(b.rocketUntil, 0);
    assert.equal(a.upgrades.rocket, false);
    assert.equal(pickup.readyAt, 100 + ROCKET_PAD_COOLDOWN);
    assert.equal(updateRocketPickup(pickup, [a, b], 119.99), null);
    assert.equal(pickup.active, false);
    assert.equal(updateRocketPickup(pickup, [a, b], 120), 'a');
    assert.equal(a.rocketUntil, 210);
    assert.equal(hasRocket(a, 209.999), true);
    assert.equal(hasRocket(a, 210), false);
  }
});

test('only driven cars on the pad ground can claim it, and an empty pad reactivates', () => {
  const person = car('a', 'person'), parked = car('b'), airborne = car('c'), high = car('d'), distant = car('e');
  parked.driver = null;
  airborne.supportId = null;
  high.y = 4;
  distant.x = 4;
  const pickup = pad();
  assert.equal(updateRocketPickup(pickup, [person, parked, airborne, high, distant], 0), null);
  assert.equal(pickup.active, true);
  const waterPad = { x: 0, z: -500, active: true };
  const waterCar = car('f'); waterCar.z = waterPad.z;
  assert.equal(updateRocketPickup(waterPad, [waterCar], 1), null);
  pickup.active = false; pickup.readyAt = 20;
  assert.equal(updateRocketPickup(pickup, [], 20), null);
  assert.equal(pickup.active, true);
});

test('all fleet models get entity-local capabilities while the stock Rocket remains permanent', () => {
  const registry = JSON.stringify(VEHICLES);
  for (const kind of VEHICLE_IDS) {
    const upgraded = car('upgraded', kind), other = car('other', kind);
    assert.equal(updateRocketPickup(pad(), [upgraded], 5), 'upgraded');
    assert.equal(upgraded.air, 100);
    assert.equal(hasRocket(upgraded, 94.999), true, kind);
    assert.equal(hasRocket(upgraded, 95), VEHICLES[kind].airThrusters, kind);
    assert.equal(hasRocket(other, 5), VEHICLES[kind].airThrusters, kind);
    assert.equal(upgraded.rocketUntil, VEHICLES[kind].airThrusters ? 0 : 95, kind);
    assert.equal(upgraded.upgrades.rocket, false, kind);
  }
  const person = car('person', 'person'); person.rocketUntil = 100;
  assert.equal(hasRocket(person, 5), false);
  assert.equal(JSON.stringify(VEHICLES), registry);
});

test('a purchased rocket kit remains installed when its vehicle collects a pickup', () => {
  const upgraded = car('purchased'); upgraded.upgrades.rocket = true;
  assert.equal(updateRocketPickup(pad(), [upgraded], 5), 'purchased');
  assert.equal(upgraded.air, 100);
  assert.equal(upgraded.rocketUntil, 0);
  assert.equal(hasRocket(upgraded, 1000), true);
  assert.equal(upgraded.upgrades.rocket, true);
});

test('all fleet meshes show independent upgrade hardware and replicated exhaust flags', () => {
  for (const kind of VEHICLE_IDS) {
    const upgraded = createVehicle(kind), other = createVehicle(kind);
    assert.equal(upgraded.getObjectByName('rocket_hardware')!.visible, kind === 'roadster', kind);
    if(kind !== 'roadster')assert.equal(other.getObjectByName('rocket_hardware')!.children.length, 0, kind);
    setThrusterEffects(upgraded, THRUSTER_REAR | THRUSTER_SIDE_LEFT, 1, true);
    assert.equal(upgraded.getObjectByName('rocket_hardware')!.visible, true, kind);
    assert.equal(upgraded.getObjectByName('plume_rear_0')!.visible, true, kind);
    assert.equal(upgraded.getObjectByName('plume_side_l')!.visible, true, kind);
    assert.equal(upgraded.getObjectByName('plume_side_r')!.visible, false, kind);
    assert.equal(other.getObjectByName('jets')!.visible, false, kind);
    if(kind !== 'roadster')assert.equal(other.getObjectByName('rocket_hardware')!.children.length, 0, kind);
    setThrusterEffects(upgraded, 0, 2, false);
    assert.equal(upgraded.getObjectByName('jets')!.visible, false, kind);
    assert.equal(upgraded.getObjectByName('rocket_hardware')!.visible, kind === 'roadster', kind);
  }
});
