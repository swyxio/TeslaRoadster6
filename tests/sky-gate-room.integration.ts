// Local-only test for tests/fixtures/sky-gate-worker.ts. Start its Wrangler
// configuration with an isolated --persist-to directory before running this.
// The fixture only stages a level-zero car. Production room code handles the
// two WebSockets, inputs, physics, progression and snapshots after that.
import assert from 'node:assert/strict';
import { RoomInputClient } from './room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, THRUSTER_REAR, type Entity, type World } from '../shared/game';
import { ACCESS_BOUNDARIES, requiredLevelAt } from '../shared/delivery';
import { currentAt, JET_STREAMS } from '../shared/sky-currents';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:18947');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'fixture must run on a local Wrangler server');
const health = await fetch(new URL('/api/health', base));
assert.equal(health.status, 200);
assert.equal((await health.json() as { version:number }).version, PROTOCOL_VERSION);
const room = new URL(`/api/room/sky-gate-${Date.now()}`, base);
room.protocol = 'ws:';
const delay = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check:()=>boolean, description:string, timeout=12_000):Promise<void> {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) { if (check()) return; await delay(20); }
  throw new Error(`Timed out: ${description}`);
}
async function closeCleanly(socket:WebSocket):Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('Timed out waiting for WebSocket close')),3000);
    socket.addEventListener('close',event=>{
      clearTimeout(timer);
      if(event.code===1000)resolve();else reject(new Error(`Unexpected close: ${event.code}`));
    },{once:true});
    if(socket.readyState!==WebSocket.CLOSING)socket.close(1000,'Test complete');
  });
}
function connect() {
  const socket=new WebSocket(room);
  const input=new RoomInputClient(socket);
  const state:{id?:string;version?:number;world?:World;history:World[];closed?:number}={history:[]};
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    input.observe(message);
    if(message.type==='welcome'){state.id=message.id;state.version=message.version;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
    if(message.type==='state'){state.world=message.world;state.history.push(message.world);}
  });
  socket.addEventListener('close',event=>{state.closed=event.code;});
  return {socket,state,input};
}
const driver=connect();
await eventually(()=>!!driver.state.id,'driver joins');
const observer=connect();
let inputTimer:ReturnType<typeof setInterval>|undefined;
let finalCar:Entity|undefined, lowestNeutral=Infinity;
try {
  await eventually(()=>!!observer.state.id&&observer.state.history.some(world=>world.players.length===2),'observer joins');
  assert.equal(driver.state.version,PROTOCOL_VERSION);
  assert.equal(observer.state.version,PROTOCOL_VERSION);
  const first=observer.state.history.find(world=>world.players.length===2)!;
  const pilot=first.players.find(player=>player.id===driver.state.id)!;
  const staged=first.entities.find(entity=>entity.id===pilot.entityId)!;
  const lane=JET_STREAMS.find(current=>current.id==='skyline')!;
  assert.equal(pilot.delivery.level,0);
  assert.equal(staged.air,0,'the fixture starts with an empty air tank');
  assert.equal(staged.kind,'roadster');
  assert.equal(staged.supportId,null);
  assert.equal(staged.x,ACCESS_BOUNDARIES.oaklandX-.2);
  assert.equal(staged.y,lane.height);
  assert.equal(currentAt(staged)?.id,'skyline');

  // Let the real room run with neutral controls. The gate catches the initial
  // eastward motion but the car must continue descending while air refills.
  await eventually(()=>observer.state.history.some(world=>{
    const car=world.entities.find(entity=>entity.id===pilot.entityId);
    const player=world.players.find(item=>item.id===pilot.id);
    return !!car&&car.y<=staged.y-3&&car.air>0&&player?.delivery.lastBlocked?.level===1;
  }),'observer sees the checkpoint, falling, and air refill');
  const neutralFrames=observer.state.history.slice(1);
  lowestNeutral=Math.min(...neutralFrames.map(world=>world.entities.find(entity=>entity.id===pilot.entityId)?.y??Infinity));
  assert.ok(lowestNeutral<staged.y-3,'gravity progresses after the checkpoint collision');
  assert.ok(neutralFrames.every(world=>{
    const car=world.entities.find(entity=>entity.id===pilot.entityId);
    return !car||car.x<=ACCESS_BOUNDARIES.oaklandX;
  }),'the level-zero boundary remains enforced');

  // Face west and apply ordinary forward flight, without boost or hover.
  inputTimer=setInterval(()=>{if(driver.input.active)driver.input.send({...NEUTRAL,throttle:1});},50);
  await eventually(()=>observer.state.history.some(world=>{
    const car=world.entities.find(entity=>entity.id===pilot.entityId);
    return !!car&&car.x<ACCESS_BOUNDARIES.oaklandX-20&&car.vx<0;
  }),'observer sees ordinary forward thrust carry the driver away');
  const after=observer.state.history.at(-1)!;
  finalCar=after.entities.find(entity=>entity.id===pilot.entityId)!;
  assert.ok(finalCar.x<ACCESS_BOUNDARIES.oaklandX-20);
  await eventually(()=>(driver.input.control?.appliedSeq??0)>0,'the driver input is applied');
  assert.equal(observer.input.control?.appliedSeq,0,'applied sequences belong to each connection');
  assert.equal(requiredLevelAt(finalCar.x,finalCar.z),0);
  assert.ok(observer.state.history.some(world=>{
    const car=world.entities.find(entity=>entity.id===pilot.entityId);
    return !!car&&(car.thrusters&THRUSTER_REAR)!==0;
  }),'observer receives the actual thrust effect');
  assert.equal(driver.state.closed,undefined);
  assert.equal(observer.state.closed,undefined);
} finally {
  if(inputTimer)clearInterval(inputTimer);
  await Promise.all([closeCleanly(driver.socket),closeCleanly(observer.socket)]);
}
console.log(`PASS: two WebSockets observed empty-tank level-0 Skyline gate, refill, falling to ${lowestNeutral.toFixed(1)} m and escape to x=${finalCar!.x.toFixed(1)} m under ordinary thrust; protocol v${PROTOCOL_VERSION}. Local fixture only, not a load or physical-device test.`);
