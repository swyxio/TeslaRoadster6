import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { supportNormal } from '../shared/map';
import { ovalBankSurface } from '../shared/oval-bank';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { isVehicleCollectionAward } from '../shared/vehicle-collections';
import { AchievementEventTracker } from '../src/achievement-events';
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
  const tick=12,roomEpoch='epoch',substeps=3,control=new ScheduledInput(NEUTRAL).snapshot();
  const prepare=prepareSnapshots(world,tick,roomEpoch,substeps);
  for(const id of [one.id,two.id,'missing']) {
    assert.deepEqual(JSON.parse(prepare(id,control,1)),JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,id),tick,roomEpoch,substeps,poseRevision:1,control})));
    assert.deepEqual(JSON.parse(prepare(id,control,1,4)),JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,id),tick,roomEpoch,substeps,poseRevision:1,control,sync:4})));
  }
});

test('collection awards and their events are visible only to their owner',()=>{
  const world=createWorld(),one=addPlayer(world,'one','🚗 One'),two=addPlayer(world,'two','Two');
  const collectionIds=(Object.keys(ACHIEVEMENTS) as AchievementId[]).filter(isVehicleCollectionAward);
  assert.equal(collectionIds.length,13);
  one.achievements.unlocked=['roadster-champion',...collectionIds];
  one.achievements.lastUnlock={id:collectionIds.length,achievement:collectionIds.at(-1)!};
  two.achievements.unlocked=['park-it','vault-drive-chiron'];
  two.achievements.lastUnlock={id:1,achievement:'vault-drive-chiron'};
  const control=new ScheduledInput(NEUTRAL).snapshot(),prepare=prepareSnapshots(world,12,'epoch',3);
  for(const id of [one.id,two.id,'missing']){
    const wire=JSON.parse(prepare(id,control,1));
    assert.deepEqual(wire.world,JSON.parse(JSON.stringify(snapshotFor(world,id))),`cached and direct projections agree for ${id}`);
    const visibleOne=wire.world.players.find((player:{id:string})=>player.id===one.id);
    const visibleTwo=wire.world.players.find((player:{id:string})=>player.id===two.id);
    assert.deepEqual(visibleOne.achievements.unlocked,id===one.id?one.achievements.unlocked:['roadster-champion']);
    assert.deepEqual(visibleTwo.achievements.unlocked,id===two.id?two.achievements.unlocked:['park-it']);
    if(id!==one.id)assert.equal(visibleOne.achievements.lastUnlock,null);
    if(id!==two.id)assert.equal(visibleTwo.achievements.lastUnlock,null);
    if(id===one.id)assert.deepEqual(new AchievementEventTracker().update(visibleOne.achievements),collectionIds,'owner toasts preserve all ordered events');
  }
  assert.equal(one.achievements.unlocked.length,14,'projection leaves authoritative awards unchanged');
});

test('cached snapshots retain a distant dome player and ferry passenger',()=>{
  const world=createWorld(),viewer=addPlayer(world,'viewer','Viewer'),visitor=addPlayer(world,'visitor','Visitor');
  const person=world.entities.find(entity=>entity.id===visitor.entityId)!;
  Object.assign(person,{kind:'person',x:AMBIENT_INTEREST_METERS*3,inDome:true});
  const ferryCar=makeEntity('ferry-car','model-3',-AMBIENT_INTEREST_METERS*3,0);
  ferryCar.supportId='ferry';world.entities.push(ferryCar);
  const wire=JSON.parse(prepareSnapshots(world,0,'epoch',1)(viewer.id,new ScheduledInput(NEUTRAL).snapshot(),0));
  assert.equal(wire.control.appliedSeq,0);
  assert.ok(wire.world.entities.some((entity:{id:string;inDome:boolean})=>entity.id===person.id&&entity.inDome));
  assert.ok(wire.world.entities.some((entity:{id:string;supportId:string})=>entity.id===ferryCar.id&&entity.supportId==='ferry'));
});

test('cached snapshots include owner-only controls and optional sync metadata',()=>{
  const world=createWorld(),player=addPlayer(world,'viewer','Viewer'),prepare=prepareSnapshots(world,4,'epoch',2);
  const own=new ScheduledInput(NEUTRAL);own.receive({seq:3,targetTick:5,controlRevision:0,actionSeq:0,input:{...NEUTRAL,steer:1}},4,0);
  const initial=JSON.parse(prepare(player.id,own.snapshot(),1));
  assert.equal(initial.control.receivedSeq,3);assert.equal(initial.control.queued[0].seq,3);assert.equal(initial.control.actionSeq,0);assert.equal(initial.control.edgeFloorRevision,0);assert.ok(!('sync' in initial));
  const ordered=JSON.parse(prepare(player.id,new ScheduledInput(NEUTRAL).snapshot(),1,7));
  assert.equal(ordered.control.receivedSeq,0);assert.deepEqual(ordered.control.queued,[]);assert.equal(ordered.sync,7);
});

test('flight samples stay server-side and tier progress is not replicated with players',()=>{
  const world=createWorld(),player=addPlayer(world,'viewer','Viewer');
  player.achievements.roofFlight={entityId:player.entityId,x:1,y:2,z:3,supported:false,
    flight:{seconds:1,startY:0,rise:2,travel:6}};
  const sample=player.achievements.roofFlight;
  const direct=snapshotFor(world,player.id);
  const wire=JSON.parse(prepareSnapshots(world,0,'epoch',1)(player.id,new ScheduledInput(NEUTRAL).snapshot(),0));
  assert.equal(direct.players[0].achievements.roofFlight,null);
  assert.equal(wire.world.players[0].achievements.roofFlight,null);
  assert.ok(!('achievementTiers' in wire.world.players[0]));
  assert.equal(player.achievements.roofFlight,sample,'serialization must not mutate the authoritative tracker');
});
