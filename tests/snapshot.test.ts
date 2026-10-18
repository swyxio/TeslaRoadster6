import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity } from '../shared/game';
import { supportNormal } from '../shared/map';
import { ovalBankSurface } from '../shared/oval-bank';
import { AMBIENT_INTEREST_METERS, prepareSnapshots, snapshotFor } from '../worker/snapshot';

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

test('a remote snapshot preserves the banked oval support needed to orient a car', () => {
  const world = createWorld();
  const one = addPlayer(world, 'one', 'One');
  const two = addPlayer(world, 'two', 'Two');
  const car = world.entities.find(e => e.id === two.entityId)!;
  const surface = ovalBankSurface(710, -1650)!;
  Object.assign(car, {x:710, z:-1650, y:surface.height, supportId:'island-oval'});
  const wire = JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,one.id)}));
  const remote = wire.world.entities.find((e:{id:string}) => e.id === car.id);
  assert.equal(remote.supportId, 'island-oval');
  assert.equal(remote.y, surface.height);
  assert.deepEqual(supportNormal(remote.supportId, remote.x, remote.z), surface.normal);
});

test('cached snapshot serialization matches the recipient-specific world',()=>{
  const world=createWorld();const one=addPlayer(world,'one','One');const two=addPlayer(world,'two','Two');
  const distant=makeEntity('distant','model-3',AMBIENT_INTEREST_METERS*4,0);world.entities.push(distant);
  const other=world.entities.find(entity=>entity.id===two.entityId)!;other.x=AMBIENT_INTEREST_METERS*3;
  const prepare=prepareSnapshots(world);
  for(const id of [one.id,two.id,'missing']) {
    assert.deepEqual(JSON.parse(prepare(id,7)),JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,id),inputAck:7})));
    assert.deepEqual(JSON.parse(prepare(id,9,4)),JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,id),inputAck:9,sync:4})));
  }
});
