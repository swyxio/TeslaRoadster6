import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityIndex } from '../shared/entity-index';
import { createWorld, makeEntity, step } from '../shared/game';
import { body, contact } from '../shared/physics';

test('entity broadphase includes every overlapping rotated vehicle and follows moves', () => {
  const entities = Array.from({length: 150}, (_, i) => {
    const entity = makeEntity(`e${i}`, i % 3 ? 'roadster' : 'tesla-semi', (i * 47 % 110) - 55, (i * 71 % 110) - 55);
    entity.yaw = i * .37;
    return entity;
  });
  const index = new EntityIndex(entities);
  for (let i = 0; i < entities.length; i++) {
    const candidates = new Set(index.candidates(i, i));
    for (let j = i + 1; j < entities.length; j++) if (contact(body(entities[i]), body(entities[j]))) assert.ok(candidates.has(j), `${i},${j}`);
  }
  entities[0].x = entities[1].x;
  entities[0].z = entities[1].z;
  index.update(0);
  assert.ok(index.candidates(0, 0).includes(1));
});

test('fast opposing cars cannot pass through each other between room ticks', () => {
  const world = createWorld();
  const one = makeEntity('one', 'roadster', -120, -2.5);
  const two = makeEntity('two', 'roadster', -120, 2.5);
  one.yaw = Math.PI; two.yaw = 0;
  one.speed = two.speed = 56;
  world.entities = [one, two]; world.pickups = [];
  step(world, new Map(), .05);
  assert.ok(one.health < 100 && two.health < 100, 'impact is resolved');
  assert.ok(one.z < two.z, 'cars retain their order after impact');
});
