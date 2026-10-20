import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyControls, initialCar, stepCar } from '../src/embarcadero/simulation';

test('the demo car drives and lifts, then lands when thrust is released', () => {
  const car = initialCar();
  const controls = emptyControls();
  controls.throttle = true;
  controls.lift = true;
  for (let i = 0; i < 120; i++) stepCar(car, controls, 1 / 60, []);
  assert.ok(car.z < 0 && car.y > 5);
  controls.throttle = false;
  controls.lift = false;
  for (let i = 0; i < 240; i++) stepCar(car, controls, 1 / 60, []);
  assert.equal(car.y, 0);
});

test('the demo car is blocked by building walls and can land on a roof', () => {
  const building = [{ minX: -5, maxX: 5, minZ: -10, maxZ: 0, height: 8 }];
  const car = initialCar();
  car.z = 5;
  const controls = emptyControls();
  controls.throttle = true;
  for (let i = 0; i < 180; i++) stepCar(car, controls, 1 / 60, building);
  assert.ok(car.z >= 2.25);
  Object.assign(car, { x: 0, z: -5, y: 20, verticalSpeed: 0, speed: 0 });
  controls.throttle = false;
  for (let i = 0; i < 240; i++) stepCar(car, controls, 1 / 60, building);
  assert.equal(car.y, 8);
});

test('landing in the bay requests a reset', () => {
  const car = { ...initialCar(), x: 40, y: 0.05, verticalSpeed: -2 };
  assert.equal(stepCar(car, emptyControls(), 1 / 30, []), 'water');
});

test('an elevated bridge permits flight beneath it and blocks its edge', () => {
  const bridge = [{ minX: -8, maxX: 8, minZ: -10, maxZ: 0, minY: 10, height: 11 }];
  const under = { ...initialCar(), x: 0, z: 5, y: 4, speed: 24 };
  for (let i = 0; i < 30; i++) stepCar(under, emptyControls(), 1 / 60, bridge);
  assert.ok(under.z < 0, 'car crosses underneath instead of hitting an invisible wall');

  const side = { ...initialCar(), x: 0, z: 5, y: 10.1, speed: 24 };
  let hit = false;
  for (let i = 0; i < 20; i++) {
    if (stepCar(side, emptyControls(), 1 / 60, bridge) === 'collision') hit = true;
  }
  assert.ok(hit);
  assert.ok(side.z >= 2.25, 'car cannot pass through the elevated deck side');
});

test('an elevated bridge stops upward flight and supports landing', () => {
  const bridge = [{ minX: -8, maxX: 8, minZ: -10, maxZ: 0, minY: 10, height: 11 }];
  const ascending = { ...initialCar(), x: 0, z: -5, y: 8, verticalSpeed: 6 };
  let hit = false;
  for (let i = 0; i < 20; i++) {
    if (stepCar(ascending, emptyControls(), 1 / 60, bridge) === 'collision') hit = true;
  }
  assert.ok(hit);
  assert.ok(ascending.y <= 8.7 + 1e-8, 'car roof does not penetrate the underside');
  const landing = { ...initialCar(), x: 0, z: -5, y: 15 };
  for (let i = 0; i < 180; i++) stepCar(landing, emptyControls(), 1 / 60, bridge);
  assert.equal(landing.y, 11);
});
