// One staged, local driver; not a load test. Start the local fixture first:
// pnpm exec wrangler dev -c tests/fixtures/wrangler.fast-room-profile.jsonc --local --ip 127.0.0.1 --port 8795
// pnpm exec tsx scripts/profile-fast-room.ts http://127.0.0.1:8795 10 [workerd-pid]
import { execFileSync } from 'node:child_process';
import { cpus, loadavg } from 'node:os';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
import { RoomInputClient } from '../tests/room-input-client';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8795');
const seconds = Number(process.argv[3] ?? 10);
const workerdPid = process.argv[4] ? Number(process.argv[4]) : undefined;
const mode = process.env.TESLAND_FAST_PROFILE_MODE ?? 'straight';
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Use local HTTP only');
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 20) throw new Error('Use a 2–20 second sample');
if (workerdPid !== undefined && (!Number.isInteger(workerdPid) || workerdPid < 1)) throw new Error('Invalid workerd PID');
if (mode !== 'straight' && mode !== 'turn') throw new Error('Mode must be straight or turn');
function cpuSeconds(): number | null {
  if (!workerdPid) return null;
  const comm = execFileSync('ps', ['-p', String(workerdPid), '-o', 'comm='], { encoding: 'utf8' }).trim();
  if (!comm.includes('workerd')) throw new Error(`PID ${workerdPid} is not workerd: ${comm}`);
  const value = execFileSync('ps', ['-p', String(workerdPid), '-o', 'time='], { encoding: 'utf8' }).trim();
  const parts = value.split(':').map(Number);
  if (parts.length < 2 || parts.some(part => !Number.isFinite(part))) throw new Error(`Cannot parse ps CPU time: ${value}`);
  return parts.reduce((total, part) => total * 60 + part, 0);
}
type Sample = { tick: number; elapsedMs: number; substeps: number; snapshot: boolean; entities: number;
  driverSpeed: number; maxOtherSpeed: number; otherAbove50: number };
type Profile = { wallMs: number; simSeconds: number; ticks: number; players: number; dropped: number; samples: Sample[] };
const health = await (await fetch(new URL('/api/health', base))).json() as { version: number; capacity: number };
if (health.version !== PROTOCOL_VERSION || health.capacity !== 2) throw new Error(`Unexpected local fixture: ${JSON.stringify(health)}`);
const socket = new WebSocket(`ws://${base.host}/api/room/fast-drive`);
const client = new RoomInputClient(socket);
let id = '', latestWorld: World | undefined, latestSubsteps = 0, closed = false;
const checkpoints = new Set([20, 40, 48, 50, 52, 60, 70, 80, 88, 90, 92, 100, 120, 140, 160, 180, 200]);
const trajectory: {tick:number;x:number;z:number;speed:number;yaw:number;heldSteer:number;heldThrottle:number}[] = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  client.observe(message);
  if (message.type === 'welcome') id = message.id;
  if (message.type === 'state') {
    latestWorld = message.world as World; latestSubsteps = message.substeps;
    const entity = latestWorld.entities.find(item => item.id === latestWorld?.players.find(player => player.id === id)?.entityId);
    if (mode === 'turn' && entity && checkpoints.has(message.tick)) trajectory.push({ tick:message.tick,
      x:+entity.x.toFixed(4), z:+entity.z.toFixed(4), speed:+entity.speed.toFixed(4), yaw:+entity.yaw.toFixed(5),
      heldSteer:message.control.held.steer, heldThrottle:message.control.held.throttle });
    if (mode === 'turn' && client.ready) for (const targetTick of [message.tick + 3, message.tick + 4]) {
      client.send({ ...NEUTRAL, throttle: 1, steer: targetTick >= 50 && targetTick < 90 ? .35 : 0 }, { targetTick });
    }
  }
});
socket.addEventListener('close', () => { closed = true; });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const timer = setInterval(() => { if (mode === 'straight' && client.ready) client.send({ ...NEUTRAL, throttle: 1 }); }, 50);
let measuring = false;
try {
  const deadline = performance.now() + 20_000;
  while ((!client.ready || !latestWorld || !id) && performance.now() < deadline && !closed) await delay(20);
  if (!client.ready || !latestWorld || !id || closed) throw new Error('Driver did not join');
  await delay(2000);
  const controlled = () => latestWorld?.entities.find(entity => entity.id === latestWorld?.players.find(player => player.id === id)?.entityId);
  const before = controlled();
  if (!before || before.speed < 50 || latestSubsteps < 6) throw new Error(`Fast stage not sustained: ${JSON.stringify({ speed: before?.speed, substeps: latestSubsteps })}`);
  const loadBefore = loadavg();
  const cpuWallStart = performance.now(), cpuStart = cpuSeconds();
  const start = await fetch(new URL('/__fast_room_profile?action=start', base));
  if (!start.ok) throw new Error(`Profile start failed: ${start.status}`);
  measuring = true;
  await delay(seconds * 1000);
  const stop = await fetch(new URL('/__fast_room_profile?action=stop', base));
  if (!stop.ok) throw new Error(`Profile stop failed: ${stop.status}`);
  const profile = await stop.json() as Profile;
  measuring = false;
  const cpuEnd = cpuSeconds(), cpuWallSeconds = (performance.now() - cpuWallStart) / 1000;
  if (closed || profile.players !== 1 || !profile.samples.length || profile.dropped) throw new Error(`Invalid sample: ${JSON.stringify({ closed, players: profile.players, count: profile.samples.length, dropped: profile.dropped })}`);
  const last = controlled();
  const percentile = (samples: Sample[], p: number) => {
    const a = samples.map(sample => sample.elapsedMs).sort((x, y) => x - y);
    return a.length ? a[Math.floor((a.length - 1) * p)] : null;
  };
  const stats = (samples: Sample[]) => ({ count: samples.length, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95), maxMs: percentile(samples, 1) });
  const substeps: Record<string, number> = {};
  for (const sample of profile.samples) substeps[sample.substeps] = (substeps[sample.substeps] ?? 0) + 1;
  console.log(JSON.stringify({ version: health.version, players: profile.players, mode, staged: 'Roadster x=-300 z=1500, ground, speed 56 m/s, heading +z; full throttle after join',
    inputSchedule: mode === 'turn' ? 'schedule target ticks 3–4 after each snapshot; steer 0.35 on ticks 50–89, 0 otherwise' : '20 Hz full throttle, steer 0',
    fixtureWallSeconds: +(profile.wallMs / 1000).toFixed(3), simulatedSeconds: +profile.simSeconds.toFixed(3), simToWall: +(profile.simSeconds / (profile.wallMs / 1000)).toFixed(3),
    ticks: profile.ticks, tickRate: +(profile.ticks / (profile.wallMs / 1000)).toFixed(2), substeps,
    entitiesMin: Math.min(...profile.samples.map(sample => sample.entities)), entitiesMax: Math.max(...profile.samples.map(sample => sample.entities)),
    driverSpeedMin: +Math.min(...profile.samples.map(sample => sample.driverSpeed)).toFixed(2), driverSpeedMax: +Math.max(...profile.samples.map(sample => sample.driverSpeed)).toFixed(2),
    maxOtherSpeed: +Math.max(...profile.samples.map(sample => sample.maxOtherSpeed)).toFixed(2), ticksWithOtherAbove50: profile.samples.filter(sample => sample.otherAbove50 > 0).length,
    elapsedCallbackWall: { all: stats(profile.samples), simulationOnly: stats(profile.samples.filter(sample => !sample.snapshot)), snapshot: stats(profile.samples.filter(sample => sample.snapshot)) },
    finalObserved: last ? { x: +last.x.toFixed(2), z: +last.z.toFixed(2), speed: +last.speed.toFixed(2), support: last.supportId } : null,
    appliedSeq: client.control?.appliedSeq, inputRejections: client.rejectionCount, ...(mode === 'turn' ? { trajectory } : {}),
    workerdProcessCpu: cpuStart !== null && cpuEnd !== null ? { pid: workerdPid, seconds: +(cpuEnd - cpuStart).toFixed(2), observationWallSeconds: +cpuWallSeconds.toFixed(3) } : null,
    host: { logicalCpus: cpus().length, loadBefore, loadAfter: loadavg() },
    note: 'Local fixture, one driver and normal ambient entities. Initial pose and speed are staged; later motion, input scheduling, substeps and snapshots are production logic. Callback numbers are integer-ms local elapsed wall time, not CPU; instrumentation and contention affect them. workerd process CPU, when supplied, covers the entire local process and slightly wider interval, not just room ticks. No production, WAN, device, multiplayer-capacity or sustained claim.' }, null, 2));
} finally {
  if (measuring) await fetch(new URL('/__fast_room_profile?action=stop', base)).catch(() => {});
  clearInterval(timer);
  if (socket.readyState === WebSocket.OPEN) socket.close();
}
