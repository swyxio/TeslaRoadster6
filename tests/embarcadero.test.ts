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
