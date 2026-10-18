// Local-only staged fixture. Run with:
// pnpm exec wrangler dev --config tests/fixtures/wrangler.room-behavior.jsonc --local --ip 127.0.0.1 --port 8792 --persist-to /tmp/tesland-room-behavior
// pnpm exec tsx tests/room-behavior.integration.ts http://127.0.0.1:8792
import assert from 'node:assert/strict';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
import { FERRY_DOCKS } from '../shared/map';
import { RoomInputClient } from './room-input-client';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8792');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'fixture must run on local Wrangler');
const health = await fetch(new URL('/api/health', base));
assert.equal(health.status, 200);
assert.equal((await health.json() as {version:number}).version, PROTOCOL_VERSION);
const delay = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check:()=>boolean, label:string, timeout=10_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) { if(check()) return; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}

type Client = ReturnType<typeof connect>;
function connect(slug:string) {
  const url=new URL(`/api/room/${slug}`,base); url.protocol='ws:';
  const socket=new WebSocket(url);
  const input=new RoomInputClient(socket);
  const state:{id?:string; world?:World; closed?:number; history:World[]}={history:[]};
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    input.observe(message);
    if(message.type==='welcome') {
      assert.equal(message.version,PROTOCOL_VERSION); state.id=message.id;
      socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
    }
    if(message.type==='state') {
      state.world=message.world;
      state.history.push(message.world); if(state.history.length>100) state.history.shift();
    }
  });
  socket.addEventListener('close',event=>{state.closed=event.code;});
  return {socket,state,input};
}
function send(client:Client,message:unknown) { client.socket.send(JSON.stringify(message)); }
function car(world:World|undefined,id:string|undefined) { return world?.entities.find(entity=>entity.driver===id); }
async function close(client:Client) {
  if(client.socket.readyState===WebSocket.CLOSED) { assert.equal(client.state.closed,1000); return; }
  if(client.socket.readyState===WebSocket.OPEN)client.socket.close(1000,'Test complete');
  await until(()=>client.state.closed!==undefined,'clean socket close');
  assert.equal(client.state.closed,1000);
}

const sockets:Client[]=[];
const open=async(slug:string)=>{
  const client=connect(slug);sockets.push(client);
  await until(()=>!!client.state.id&&!!client.state.world&&client.input.active,'identified client joins');
  return client;
};
let heartbeat:ReturnType<typeof setInterval>|undefined;
try {
  // Two player vehicles are staged on opposite ends of the docked deck. A third
  // player observes from shore. The shortened dock countdown is synthetic.
  const ferryRoom=`ferry-${Date.now()}`;
  const departing=await open(ferryRoom), rider=await open(ferryRoom), observer=await open(ferryRoom);
  const departingId=departing.state.id!, riderId=rider.state.id!;
  await until(()=>observer.state.world?.players.length===3&&car(observer.state.world,departingId)?.supportId==='ferry'&&car(observer.state.world,riderId)?.supportId==='ferry','staged deck cars visible');
  const departingCar=car(observer.state.world,departingId)!.id, riderCar=car(observer.state.world,riderId)!.id;
  let securedInput=false, returning:Client|undefined;
  heartbeat=setInterval(()=>{
    if(departing.input.active) departing.input.send(NEUTRAL);
    if(rider.input.active) rider.input.send(securedInput?{...NEUTRAL,throttle:1,jump:1}:NEUTRAL);
    if(observer.input.active) observer.input.send(NEUTRAL);
    if(returning?.input.active) returning.input.send(NEUTRAL);
  },200);
  await until(()=>observer.state.world?.ferry.phase==='to-island'&&observer.state.world.ferry.passengers.length===2,'both cars depart on ferry');
  securedInput=true;
  const departure=observer.state.world!;
  const riderOffset=departure.ferry.passengers.find(passenger=>passenger.entityId===riderCar)!;
  const startAir=car(departure,riderId)!.air;
  await until(()=>observer.state.world?.ferry.phase==='to-island'&&observer.state.world.ferry.z<departure.ferry.z-25,'ferry progresses under authoritative timer');
  const underway=observer.state.world!, fixed=car(underway,riderId)!;
  assert.equal(fixed.supportId,'ferry');
  assert.ok(Math.abs(fixed.x-underway.ferry.x-riderOffset.x)<.001&&Math.abs(fixed.z-underway.ferry.z-riderOffset.z)<.001,'passenger remains at its deck-local offset despite driving and jump input');
  assert.equal(fixed.air,startAir);assert.equal(fixed.thrusters,0);
  const securedSeq=rider.input.lastSeq;
  await until(()=>(rider.input.control?.appliedSeq??0)>=securedSeq,'secured rider input applied');
  securedInput=false;

  // Disconnect one passenger mid-crossing and reconnect as a new session while
  // the surviving rider and a shore observer keep the same room alive.
  assert.equal(departing.socket.readyState,WebSocket.OPEN,'passenger is still connected before the intentional disconnect');
  await close(departing);
  await until(()=>{
    const world=observer.state.world;
    return !!world&&!world.players.some(player=>player.id===departingId)&&!world.entities.some(entity=>entity.id===departingCar)&&!world.ferry.passengers.some(passenger=>passenger.entityId===departingCar);
  },'disconnect removes player, car and passenger manifest');
  returning=await open(ferryRoom);
  assert.notEqual(returning.state.id,departingId,'reconnect creates a new session');
  assert.equal(returning.input.control?.receivedSeq,0,'new session starts with a fresh input sequence');
  const returningId=returning.state.id!;
  await until(()=>observer.state.world?.players.some(player=>player.id===returningId)??false,'reconnected session visible to observer');
  const fresh=observer.state.world!.players.find(player=>player.id===returningId)!;
  assert.equal(fresh.delivery.cash,2500);assert.equal(fresh.delivery.completed,0);
  await until(()=>(returning!.input.control?.appliedSeq??0)>0,'reconnected input is applied');
  returning.input.action({type:'minigame',game:'queue'});send(returning,{type:'parking',action:'start'});
  await until(()=>observer.state.world?.parking.rounds.some(round=>round.mode==='queue'&&round.phase==='active'&&round.entrants.some(entry=>entry.playerId===returningId))??false,'new session starts an authoritative activity');
  await close(returning);
  await until(()=>!!observer.state.world&&!observer.state.world.players.some(player=>player.id===returningId)&&!observer.state.world.parking.rounds.some(round=>round.entrants.some(entry=>entry.playerId===returningId)),'activity membership cleaned on disconnect');

  await until(()=>observer.state.world?.ferry.phase==='island','ferry arrives on island',85_000);
  const arrived=observer.state.world!;
  assert.equal(arrived.ferry.z,FERRY_DOCKS.island.deckZ);
  assert.ok(arrived.ferry.arrivals.includes(riderCar));
  assert.equal(car(arrived,riderId)?.supportId,'ferry');
  assert.ok(!arrived.ferry.arrivals.includes(departingCar),'disconnected car does not reappear on arrival');
  assert.equal(observer.state.closed,undefined);assert.equal(rider.state.closed,undefined);
  clearInterval(heartbeat);heartbeat=undefined;
  await Promise.all([close(rider),close(observer)]);

  // A second room stages two cars apart inside the dome. Only the first is
  // driven; the impulse, damage and replication are from the production tick.
  const collisionRoom=`collision-${Date.now()}`;
  const striker=await open(collisionRoom), target=await open(collisionRoom), witness=await open(collisionRoom);
  const strikerId=striker.state.id!, targetId=target.state.id!;
  await until(()=>!!car(witness.state.world,strikerId)&&!!car(witness.state.world,targetId),'collision cars visible to witness');
  const startTarget=car(witness.state.world,targetId)!;
  const startX=startTarget.x, startHealth=startTarget.health;
  heartbeat=setInterval(()=>{
    if(striker.input.active)striker.input.send({...NEUTRAL,throttle:1});
    if(target.input.active)target.input.send(NEUTRAL);
    if(witness.input.active)witness.input.send(NEUTRAL);
  },100);
  await until(()=>{
    const hit=car(witness.state.world,targetId);
    return !!hit&&hit.health<startHealth&&hit.x>startX+1;
  },'remote observer receives collision damage and displacement',15_000);
  clearInterval(heartbeat);heartbeat=undefined;
  await until(()=>(striker.input.control?.appliedSeq??0)>0,'striker input applied');
  // Compare each recipient at one identical server world time, not at two
  // independently sampled instants.
  await until(()=>witness.state.history.some(w=>target.state.history.some(t=>t.time===w.time&&(car(w,targetId)?.health??startHealth)<startHealth)),'shared post-collision tick visible to both recipients');
  const observed=witness.state.history.find(w=>target.state.history.some(t=>t.time===w.time&&(car(w,targetId)?.health??startHealth)<startHealth))!;
  const sameTick=target.state.history.find(t=>t.time===observed.time)!;
  assert.deepEqual(car(observed,targetId),car(sameTick,targetId),'collision state agrees across recipients at the same tick');
  assert.deepEqual(car(observed,strikerId),car(sameTick,strikerId));
  assert.equal(striker.state.closed,undefined);assert.equal(target.state.closed,undefined);assert.equal(witness.state.closed,undefined);
  console.log('PASS: staged local ferry crossing, secured inputs, mid-crossing disconnect and manifest cleanup, fresh reconnect and activity cleanup, island arrival, and replicated player-car collision. Fixture stages car poses and dock countdown; it does not test boarding or load.');
} finally {
  if(heartbeat)clearInterval(heartbeat);
  await Promise.all(sockets.map(async client=>{
    if(client.socket.readyState===WebSocket.OPEN)client.socket.close(1000,'Test complete');
  }));
}
