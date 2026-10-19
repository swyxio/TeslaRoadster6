/**
 * Correctness-only comparison with another checkout of the same world schema.
 * Usage: pnpm exec tsx scripts/compare-snapshot-serialization.ts /path/to/baseline
 * This does not measure performance, run a room, or establish playable capacity.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addPlayer, createWorld, makeEntity, NEUTRAL, type World } from '../shared/game';
import { ScheduledInput, type ControlSnapshot } from '../shared/tick-input';
import { AMBIENT_INTEREST_METERS, prepareSnapshots, snapshotFor } from '../worker/snapshot';

const args=process.argv.slice(2);
if(args.length!==1)throw new Error('Usage: pnpm exec tsx scripts/compare-snapshot-serialization.ts /path/to/baseline');
const candidateRoot=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const baselineRoot=realpathSync(resolve(args[0]));
if(candidateRoot===baselineRoot)throw new Error('The baseline must be a separate checkout.');

function git(root:string,...args:string[]):string {
  return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
}
function sourceHash(path:string):string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function identity(root:string) {
  // Tests and diagnostics may be modified independently; the imported runtime
  // and its shared schema must be tracked and clean for an attributable result.
  if(git(root,'status','--porcelain','--untracked-files=all','--','worker','shared'))
    throw new Error(`Worker or shared source is dirty in ${root}`);
  return {commit:git(root,'rev-parse','HEAD'),snapshotSha256:sourceHash(join(root,'worker/snapshot.ts'))};
}
const candidate=identity(candidateRoot),baseline=identity(baselineRoot);
const baselineModule=await import(pathToFileURL(join(baselineRoot,'worker/snapshot.ts')).href) as typeof import('../worker/snapshot');
assert.equal(baselineModule.AMBIENT_INTEREST_METERS,AMBIENT_INTEREST_METERS,'Interest radius differs between checkouts');
const digest=createHash('sha256');
let comparisons=0;

function state(wire:string):{world:World;control:ControlSnapshot;sync?:number} {
  return JSON.parse(wire);
}
function contains(world:World,id:string):boolean {
  return world.entities.some(entity=>entity.id===id);
}
function controlFor(index:number,tick:number):ControlSnapshot {
  const scheduler=new ScheduledInput(NEUTRAL);
  const received=scheduler.receive({seq:index+1,targetTick:tick+1,controlRevision:0,actionSeq:0,
    input:{...NEUTRAL,throttle:index%2,steer:((index%9)-4)/4}},tick,0);
  assert.equal(received.rejection,undefined);
  return scheduler.snapshot();
}

for(const seed of [0,1,42]){
  const world=createWorld(seed),ids:string[]=[];
  for(let i=0;i<8;i++){
    const id=`compare-driver-${i}`,player=addPlayer(world,id,i===0?'🚗 "Zero"':`Synthetic ${i}`);
    ids.push(id);
    const car=world.entities.find(entity=>entity.id===player.entityId)!;
    // Two groups share the same local interest sets, except for ownership.
    car.x=i<4?0:AMBIENT_INTEREST_METERS*3;car.z=0;
  }
  const boundary=makeEntity('compare-boundary','model-3',AMBIENT_INTEREST_METERS,0);
  const outside=makeEntity('compare-outside','model-3',AMBIENT_INTEREST_METERS+1,0);
  const owned=makeEntity('compare-owned','model-3',AMBIENT_INTEREST_METERS*7,0);owned.owner=ids[0];
  const ferry=makeEntity('compare-ferry','model-3',-AMBIENT_INTEREST_METERS*5,0);ferry.supportId='ferry';
  const driven=makeEntity('compare-driven','model-3',-AMBIENT_INTEREST_METERS*5,0,'synthetic-driver');
  world.entities.push(boundary,outside,owned,ferry,driven);
  // More than 32 non-shared candidates, with a mixture of in/out visibility.
  for(let i=0;i<40;i++)world.entities.push(makeEntity(`compare-mask-${i}`,'model-3',i%2?1500+i:300+i,100));
  world.players[0].achievements.unlocked=['park-it','vault-drive-chiron'];
  world.players[0].achievements.lastUnlock={id:2,achievement:'vault-drive-chiron'};
  world.players[0].achievements.roofFlight={entityId:world.players[0].entityId,x:1,y:2,z:3,supported:false,
    flight:{seconds:1,startY:0,rise:2,travel:6}};
  world.players[1].achievements.unlocked=['park-it','tesla-drive-1'];
  world.players[1].achievements.lastUnlock={id:3,achievement:'tesla-drive-1'};
  const sequence=[0,1,0,2,3,4,5,4,6,7,-1,0,1,-1];

  for(let phase=0;phase<2;phase++){
    if(phase===1){
      // Prepare fresh serializers after changes: broadcasts themselves are synchronous.
      world.time=1.25;boundary.x+=2;outside.x-=2;owned.owner=ids[1];
      ferry.supportId=null;driven.driver=null;
      world.players[0].achievements.unlocked.push('roadster-champion');
    }
    const tick=10+phase,epoch=`synthetic-epoch-${seed}`,substeps=phase+1;
    const worldBefore=JSON.stringify(world);
    const actual=prepareSnapshots(world,tick,epoch,substeps);
    const expected=baselineModule.prepareSnapshots(world,tick,epoch,substeps);
    for(const [position,index] of sequence.entries()){
      const id=index<0?'unknown-viewer':ids[index],control=controlFor(position,tick);
      const poseRevision=position%3,sync=position%2?position:undefined;
      const actualWire=actual(id,control,poseRevision,sync);
      const baselineWire=expected(id,control,poseRevision,sync);
      if(actualWire!==baselineWire)throw new Error(`Serialized snapshot differs: seed ${seed}, phase ${phase}, recipient ${id}, call ${position}`);
      const parsed=state(actualWire);
      assert.deepEqual(parsed.world,JSON.parse(JSON.stringify(snapshotFor(world,id))),`Projection differs for ${id}`);
      assert.deepEqual(parsed.control,control,`Control differs for ${id}`);
      assert.equal(parsed.sync,sync,`Sync differs for ${id}`);
      // Length-prefix each complete wire string before hashing, to keep the
      // digest unambiguous without printing snapshots or participant data.
      digest.update(`${Buffer.byteLength(actualWire)}:`).update(actualWire);
      comparisons++;
    }
    assert.equal(JSON.stringify(world),worldBefore,'Snapshot preparation must not mutate the world');

    const owner=state(actual(ids[0],controlFor(0,tick),0)).world;
    const other=state(actual(ids[1],controlFor(1,tick),0)).world;
    const unknown=state(actual('unknown-viewer',controlFor(2,tick),0)).world;
    assert.equal(contains(owner,boundary.id),phase===0,'Exact-radius boundary changes next tick');
    assert.equal(contains(owner,outside.id),phase===1,'Outside entity changes next tick');
    assert.equal(contains(owner,owned.id),phase===0,'Only its owner sees the distant owned car');
    assert.equal(contains(other,owned.id),phase===1,'Changed ownership is reflected next tick');
    assert.equal(contains(owner,ferry.id),phase===0,'Distant ferry passengers remain shared');
    assert.equal(contains(owner,driven.id),phase===0,'Distant driven cars remain shared');
    assert.ok(contains(owner,world.players[4].entityId),'A distant player remains shared');
    assert.equal(unknown.entities.length,world.entities.length,'An unknown viewer receives all entities');
    const ownAwards=owner.players.find(player=>player.id===ids[0])!.achievements;
    const remoteAwards=other.players.find(player=>player.id===ids[0])!.achievements;
    const unknownAwards=unknown.players.find(player=>player.id===ids[0])!.achievements;
    assert.ok(ownAwards.unlocked.includes('vault-drive-chiron'),'Owner sees their collection award');
    for(const awards of [remoteAwards,unknownAwards]){
      assert.ok(!awards.unlocked.includes('vault-drive-chiron'),'Collection award remains private');
      assert.equal(awards.lastUnlock,null,'Private last unlock remains private');
    }
    assert.equal(ownAwards.roofFlight,null,'Transient flight data is not serialized');
  }
}
console.log(JSON.stringify({kind:'snapshot-serialization-correctness',candidate,baseline,
  scriptSha256:sourceHash(fileURLToPath(import.meta.url)),seeds:[0,1,42],ticksPerSeed:2,comparisons,
  outputSha256:digest.digest('hex'),note:'Synthetic serialized-output comparison only; no performance, room or capacity measurement.'},null,2));
