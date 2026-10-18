import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity } from '../shared/game';
import { AMBIENT_INTEREST_METERS, snapshotFor } from '../worker/snapshot';

test('snapshots retain players and owned cars, while ambient traffic follows the viewer', () => {
  const world = createWorld();
  const one = addPlayer(world, 'one', 'One');
  const two = addPlayer(world, 'two', 'Two');
  const viewer = world.entities.find(e => e.id === one.entityId)!;
  const remote = world.entities.find(e => e.id === two.entityId)!;
  remote.x = viewer.x + AMBIENT_INTEREST_METERS * 3;
  remote.z = viewer.z;
  const ambient = makeEntity('ambient-test', 'model-3', remote.x, remote.z);
  const owned = makeEntity('owned-test', 'model-3', remote.x, remote.z);
  owned.owner = 'one';
  world.entities.push(ambient, owned);
  let visible = snapshotFor(world, 'one');
  assert.ok(visible.entities.includes(remote), 'distant players remain on the map');
  assert.ok(visible.entities.includes(owned), 'your released vehicle remains in your state');
  assert.ok(!visible.entities.includes(ambient), 'distant ambient vehicles are omitted');
  assert.ok(snapshotFor(world, 'two').entities.includes(ambient), 'nearby ambient traffic is shared');
  ambient.x = viewer.x + 20;
  visible = snapshotFor(world, 'one');
  assert.ok(visible.entities.includes(ambient), 'approaching vehicles appear in a complete snapshot');
  assert.ok(world.entities.includes(ambient), 'filtering does not mutate the authoritative world');
  ambient.x=viewer.x+AMBIENT_INTEREST_METERS*3;ambient.supportId='ferry';
  assert.ok(snapshotFor(world,'one').entities.includes(ambient),'ferry passengers remain visible outside ambient interest');
});
