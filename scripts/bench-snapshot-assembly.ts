/** Same-process snapshot assembly only; this is not a room or network load test. */
import { cpus, loadavg } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { addPlayer, createWorld, makeEntity, NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { prepareSnapshots, snapshotFor } from '../worker/snapshot';

const count = 64;
const rounds = Number(process.argv[2] ?? 50);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000) throw new Error('Use 1–1000 rounds.');

for (const scenario of ['clustered', 'spread', 'owned'] as const) {
  const world = createWorld(), ids:string[] = [];
  for (let i=0; i<count; i++) {
    const id = `driver-${String(i).padStart(2,'0')}`;
    const player = addPlayer(world,id,`Driver ${i}`); ids.push(id);
    if (scenario !== 'clustered') {
      // Synthetic positions exercise different interest sets, not playable routes.
      const car = world.entities.find(entity=>entity.id===player.entityId)!;
      car.x += (i%8)*500; car.z += Math.floor(i/8)*500;
      if(scenario==='owned'){
        const owned=makeEntity(`owned-${i}`,'model-3',car.x+5000,car.z+5000);
        owned.owner=id;world.entities.push(owned);
      }
    }
  }
  const control = new ScheduledInput(NEUTRAL).snapshot();
  const selectionSets = new Set(ids.map(id=>snapshotFor(world,id).entities.map(entity=>entity.id).join('\0')));
  // Check the same projection and private control shape used by the Worker.
  const check=prepareSnapshots(world,1,'benchmark',1);
  for (const id of ids) {
    const actual=JSON.parse(check(id,control,0));
    const expected=JSON.parse(JSON.stringify({type:'state',world:snapshotFor(world,id),tick:1,roomEpoch:'benchmark',substeps:1,poseRevision:0,control}));
    if (!isDeepStrictEqual(actual,expected)) throw new Error(`Snapshot mismatch for ${id}`);
  }
  const loadBefore=loadavg(), cpuStart=process.cpuUsage(), started=performance.now(), samples:number[]=[];
  let bytes=0;
  for (let i=0; i<rounds; i++) {
    const at=performance.now(), snapshot=prepareSnapshots(world,i+1,'benchmark',1);
    for (const id of ids) bytes+=Buffer.byteLength(snapshot(id,control,0));
    samples.push(performance.now()-at);
  }
  const cpu=process.cpuUsage(cpuStart), elapsed=performance.now()-started;
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario,players:count,entities:world.entities.length,rounds,uniqueInterestSets:selectionSets.size,
    decodedBytesPerBroadcast:Math.round(bytes/rounds),elapsedMs:+elapsed.toFixed(2),cpuMs:+((cpu.user+cpu.system)/1000).toFixed(2),
    broadcastP50Ms:+samples[Math.floor(samples.length*.5)].toFixed(2),broadcastP95Ms:+samples[Math.floor((samples.length-1)*.95)].toFixed(2),
    logicalCpus:cpus().length,loadBefore,loadAfter:loadavg(),
    note:'Synthetic in-process assembly and UTF-8 sizing; no simulation, clients, WebSocket compression or production capacity.'}));
}
