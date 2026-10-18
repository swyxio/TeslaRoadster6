// Local-only test for tests/fixtures/island-jump-worker.ts. Start its Wrangler
// configuration with an isolated --persist-to directory before running this.
// The fixture places the first player's car 25 m before the west jump. All
// subsequent driving, physics and snapshots use the production room code.
import assert from 'node:assert/strict';
import { NEUTRAL, PROTOCOL_VERSION, type Entity, type World } from '../shared/game';
import { ISLAND_JUMPS, islandJumpHeight } from '../shared/island-jumps';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:18871');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'fixture must run on a local Wrangler server');
const health = await fetch(new URL('/api/health', base));
assert.equal(health.status, 200);
assert.equal((await health.json() as { version:number }).version, PROTOCOL_VERSION);

const room = new URL(`/api/room/jump-${Date.now()}`, base);
room.protocol = 'ws:';
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check:()=>boolean, description:string, timeout=15_000):Promise<void> {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (check()) return; await sleep(20); }
  throw new Error(`Timed out: ${description}`);
}
async function closeCleanly(socket:WebSocket):Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for WebSocket close')), 3000);
    socket.addEventListener('close', event => {
      clearTimeout(timeout);
      if (event.code === 1000) resolve();
      else reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
    }, { once:true });
    if (socket.readyState !== WebSocket.CLOSING) socket.close(1000, 'Test complete');
  });
}
function connect() {
  const socket = new WebSocket(room);
  const state: { id?:string; world?:World; closed?:number; history:Entity[] } = { history:[] };
  socket.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.type === 'welcome') { assert.equal(data.version, PROTOCOL_VERSION); state.id = data.id; socket.send(JSON.stringify({type:'identity',code:null,requestId:1})); }
    if (data.type === 'state') state.world = data.world;
  });
  socket.addEventListener('close', event => { state.closed = event.code; });
  return { socket, state };
}

const driver = connect();
await eventually(() => !!driver.state.id, 'first driver joined');
const observer = connect();
let inputTimer:ReturnType<typeof setInterval>|undefined;
let highestY = 0;
let inputSeq = 0;
try {
  await eventually(() => !!observer.state.id && observer.state.world?.players.length === 2, 'observer joined the same room');
  const playerId = driver.state.id!;
  const carId = observer.state.world!.players.find(player => player.id === playerId)!.entityId;
  const jump = ISLAND_JUMPS[0];
  const approach = observer.state.world!.entities.find(entity => entity.id === carId)!;
  assert.ok(approach, 'observer receives the staged player car');
  assert.ok(Math.abs(approach.x - (jump.start - 25)) < 1 && Math.abs(approach.z - jump.z) < 1,
    `fixture staged the driver before the ramp: ${JSON.stringify({ x:approach.x, z:approach.z })}`);
  assert.equal(approach.supportId, 'ground');

  let sawRamp = false, sawLaunch = false, sawLanding = false;
  observer.socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.type !== 'state') return;
    const entity = (message.world as World).entities.find(car => car.id === carId);
    if (!entity) return;
    observer.state.history.push(entity);
    highestY = Math.max(highestY, entity.y);
    if (entity.supportId === 'island-jump') {
      const expected = islandJumpHeight(entity.x, entity.z);
      if (expected !== null && Math.abs(entity.y - expected) < .001) sawRamp = true;
    }
    if (sawRamp && entity.supportId === null && entity.x > jump.end && entity.y >= jump.height) sawLaunch = true;
    if (sawLaunch && entity.supportId === 'ground' && entity.x > jump.end + 1) sawLanding = true;
  });
  inputTimer = setInterval(() => {
    driver.socket.send(JSON.stringify({ type:'input', seq:++inputSeq, input:{ ...NEUTRAL, throttle:sawLaunch ? 0 : 1 } }));
  }, 50);
  await eventually(() => sawRamp && sawLaunch && sawLanding, 'observer sees ramp support, takeoff and landing');
  assert.ok(highestY > jump.height, 'launch reaches above the lip');
  assert.equal(driver.state.closed, undefined);
  assert.equal(observer.state.closed, undefined);
} finally {
  if (inputTimer) clearInterval(inputTimer);
  await Promise.all([closeCleanly(driver.socket), closeCleanly(observer.socket)]);
}
console.log(`PASS: two real WebSockets observed staged approach, island-jump support, launch and landing (peak ${highestY.toFixed(2)} m). Local fixture only; no load or physical-device claim.`);
