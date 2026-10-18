// Run against Wrangler or deployment: pnpm exec tsx tests/room.integration.ts [http://localhost:8787]
// Local award round trip only: TESLAND_ROOM_AWARDS_ONLY=1 pnpm exec tsx tests/room.integration.ts
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, NEUTRAL, THRUSTER_REAR, THRUSTER_DOWN_LEFT, THRUSTER_DOWN_RIGHT, THRUSTER_SIDE_RIGHT, type World } from '../shared/game';
import { DOME } from '../shared/dome';
import { currentAt } from '../shared/sky-currents';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { supportHeight } from '../shared/map';
const base = process.argv[2] ?? 'http://localhost:8787';
let inputSeq=0, observerSeq=0;
// Protocol 31 adds the private, authenticated award binding.
assert.equal(PROTOCOL_VERSION, 31);
const url = base.replace(/^http/, 'ws') + `/api/room/test-${Date.now()}`;
// A stale server would simulate a different map, so health and room handshakes
// must both advertise the same version as this client's static terrain data.
const health = await fetch(base + '/api/health');
assert.equal(health.status, 200);
assert.equal((await health.json() as {version:number}).version, PROTOCOL_VERSION);
for(const jump of ISLAND_JUMPS)assert.equal(supportHeight('island-jump',(jump.start+jump.end)/2,jump.z),jump.height/2);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, label: string, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
function connect() {
  const socket = new WebSocket(url);
  const state: { id?: string; world?: World; capacity?: number; inputAck?:number; sync?:number; closed?: number; awardBindings?: {requestId:number;ok:boolean}[]; upgradeResults?: {requestId:number;upgrade:string;ok:boolean}[]; otaResults?: {requestId:number;enabled:boolean;ok:boolean}[]; destinationResults?: {requestId:number;ok:boolean}[]; marsResults?: {requestId:number;action:string;ok:boolean;amount:number}[] } = {};
  socket.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.type === 'welcome') { assert.equal(data.version, PROTOCOL_VERSION); state.id = data.id; state.capacity = data.capacity; }
    if (data.type === 'state') {state.world = data.world;state.inputAck=data.inputAck;if(data.sync)state.sync=Math.max(state.sync??0,data.sync);}
    if (data.type === 'awardsBound') (state.awardBindings??=[]).push(data);
    if (data.type === 'upgradeResult') (state.upgradeResults??=[]).push(data);
    if (data.type === 'otaResult') (state.otaResults??=[]).push(data);
    if (data.type === 'destinationResult') (state.destinationResults??=[]).push(data);
    if (data.type === 'marsResult') (state.marsResults??=[]).push(data);
  });
  socket.addEventListener('close', event => { state.closed = event.code; });
  return { socket, state };
}
const one = connect(), two = connect();
type ChatEvent = { type:string; playerId?:string; name?:string; code?:string; ticket?:string; requestId?:number; awards?:{room:string[];solo:string[]}|null };
const chatSockets:WebSocket[] = [];
function chatConnection() {
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/api/chat');
  const events:ChatEvent[] = [];
  socket.addEventListener('message', event => events.push(JSON.parse(String(event.data))));
  chatSockets.push(socket);
  return { socket, events };
}
async function savedDriver(name:string) {
  const chat=chatConnection();
  await eventually(()=>chat.socket.readyState===WebSocket.OPEN, 'chat opens');
  chat.socket.send(JSON.stringify({type:'hello',name}));
  await eventually(()=>chat.events.some(event=>event.type==='ready'), 'chat identity');
  chat.socket.send(JSON.stringify({type:'save'}));
  await eventually(()=>chat.events.some(event=>event.type==='recovery'), 'saved driver');
  const code=chat.events.find(event=>event.type==='recovery')!.code!;
  chat.socket.send(JSON.stringify({type:'awardTicket',requestId:1}));
  await eventually(()=>chat.events.some(event=>event.type==='awardTicket'&&event.requestId===1), 'private room award ticket');
  return {...chat,code,ticket:chat.events.find(event=>event.type==='awardTicket')!.ticket!,playerId:chat.events.find(event=>event.type==='ready')!.playerId!};
}
async function recoverDriver(code:string) {
  const chat=chatConnection();
  await eventually(()=>chat.socket.readyState===WebSocket.OPEN, 'recovery chat opens');
  // Closing a socket and releasing its identity can cross in flight. Retry an
  // active-identity response on the same socket, as the browser client does.
  for(let attempt=0;attempt<5;attempt++) {
    const start=chat.events.length;
    chat.socket.send(JSON.stringify({type:'hello',name:'Recovery',code}));
    await eventually(()=>chat.events.slice(start).some(event=>event.type==='ready'||event.type==='error'), 'recovery response');
    const ready=chat.events.slice(start).find(event=>event.type==='ready');
    if(ready)return {...chat,ready};
    await delay(250);
  }
  throw new Error('Saved identity did not reconnect');
}
// The extra checks create durable identities, so run them only on local Wrangler.
const localAwards=['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname);
const awardsOnly=process.env.TESLAND_ROOM_AWARDS_ONLY==='1';
if(awardsOnly&&!localAwards)throw new Error('The awards-only integration test requires local Wrangler.');
let winningDriver:Awaited<ReturnType<typeof savedDriver>>|undefined;
let spectatorDriver:Awaited<ReturnType<typeof savedDriver>>|undefined;
// Keep both clients connected during long, heavily loaded local runs without
// interfering with the driver's controls.
const keepObserverAlive=setInterval(()=>{
  if(one.socket.readyState===WebSocket.OPEN)one.socket.send(JSON.stringify({type:'sync',token:1}));
  if(two.socket.readyState===WebSocket.OPEN)two.socket.send(JSON.stringify({type:'input',seq:++observerSeq,input:NEUTRAL}));
},5000);
try {
  await eventually(() => !!one.state.id && !!two.state.id && one.state.world?.players.length === 2 && two.state.world?.players.length === 2, 'two players visible in both snapshots');
  if(localAwards) {
    [winningDriver,spectatorDriver]=await Promise.all([savedDriver('Award Driver'),savedDriver('Award Spectator')]);
    one.socket.send(JSON.stringify({type:'bindAwards',ticket:winningDriver.ticket,requestId:101}));
    await eventually(()=>one.state.awardBindings?.some(result=>result.requestId===101&&result.ok)??false, 'winner binds saved driver');
    two.socket.send(JSON.stringify({type:'bindAwards',ticket:winningDriver.ticket,requestId:102}));
    await eventually(()=>two.state.awardBindings?.some(result=>result.requestId===102&&!result.ok)??false, 'room ticket cannot be replayed');
    two.socket.send(JSON.stringify({type:'bindAwards',ticket:spectatorDriver.ticket,requestId:103}));
    await eventually(()=>two.state.awardBindings?.some(result=>result.requestId===103&&result.ok)??false, 'spectator binds their own driver');
    assert.ok(!(one.state.awardBindings??[]).some(result=>result.requestId===103),'binding results are private');
  }
  for(const state of [one.state,two.state]){
    assert.ok(state.world!.players.every(p=>p.delivery.cash===0&&p.delivery.earned===0&&p.delivery.level===0&&p.delivery.completed===0&&p.delivery.lastBlocked===null&&p.delivery.order.stage==='pickup'&&p.delivery.order.pickupEstimate>0&&p.delivery.lastReward===null&&p.delivery.lastTicket===null&&p.delivery.flight.seconds===0&&p.achievements.unlocked.length===0));
    assert.equal(state.world!.entities.filter(e=>e.police).length,4);
  }
  assert.ok(one.state.world!.entities.some(e=>e.id===one.state.world!.players.find(p=>p.id===two.state.id)!.entityId),'nearby player entity is present');
  assert.ok(two.state.world!.entities.some(e=>e.npc),'nearby traffic is present in the room snapshot');
  assert.ok(two.state.world!.entities.every(e=>Object.hasOwn(e,'supportId')),'surface identity is present in every replicated entity');
  assert.ok(two.state.world!.entities.every(e=>e.domeReturn==='sf'||e.domeReturn==='island'),'Dome return side is replicated');
  for(const state of [one.state,two.state]){
    assert.equal(state.world!.ferry.phase,'sf');assert.equal(state.world!.ferry.passengers.length,0);
    assert.equal(state.world!.parking.rounds.length,0);assert.equal(state.world!.races.rounds.length,0);
    assert.ok(state.world!.pickups.some(p=>p.id==='rocket-island'&&p.kind==='rocket'),'island Rocket kit is replicated');
    assert.ok(state.world!.pickups.some(p=>p.id==='rocket-0'&&p.kind==='rocket'),'city Rocket kit is replicated');
    assert.ok(state.world!.entities.every(e=>Object.hasOwn(e,'upgrades')),'vehicle upgrades are present in room snapshots');
    assert.ok(state.world!.entities.every(e=>e.tankLevel===1),'starter tank level is replicated');
    assert.deepEqual(state.world!.mars,{fund:0,launchAt:null});
  }
  one.socket.send(JSON.stringify({type:'mars',action:'contribute',amount:1,requestId:90}));
  await eventually(()=>one.state.marsResults?.some(r=>r.requestId===90&&!r.ok)??false,'unfunded contribution is rejected');
  await delay(500);one.socket.send(JSON.stringify({type:'mars',action:'board',requestId:91}));
  try { await eventually(()=>one.state.marsResults?.some(r=>r.requestId===91&&!r.ok)??false,'early remote boarding is rejected'); }
  catch(error) { throw new Error(`Boarding request failed: ${JSON.stringify({results:one.state.marsResults,closed:one.state.closed,socket:one.socket.readyState})}`,{cause:error}); }
  assert.equal(two.state.marsResults?.length??0,0,'Mars action results are private');
  await delay(500);
  one.socket.send(JSON.stringify({type:'parking',action:'park'}));
  await delay(450);
  assert.equal(two.state.world!.parking.rounds.length,0,'remote parking intent cannot join from outside a lot');
  one.socket.send(JSON.stringify({type:'race',action:'join',courseId:'short'}));
  await delay(450);
  assert.equal(two.state.world!.races.rounds.length,0,'remote race intent cannot join from outside the start');
  const initialTime=two.state.world!.time;
  await eventually(()=>!!two.state.world&&two.state.world.time>initialTime,'authoritative room clock advances');
  const id = one.state.id!;
  const entityId = one.state.world!.players.find(p => p.id === id)!.entityId;
  const initial = one.state.world!.entities.find(e => e.id === entityId)!;
  const origin={x:initial.x,z:initial.z,yaw:initial.yaw};
  for (let i = 0; i < 20; i++) { one.socket.send(JSON.stringify({ type: 'input', seq:++inputSeq, input: { ...NEUTRAL, throttle: 1, cockpit: true } })); await delay(50); }
  await eventually(()=>one.state.inputAck===inputSeq,'the server acknowledges the latest driver input');
  await eventually(() => {const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&((e.x-origin.x)*-Math.sin(origin.yaw)+(e.z-origin.z)*-Math.cos(origin.yaw)>4);}, 'remote player receives authoritative movement');
  await eventually(()=>{const p=two.state.world?.players.find(p=>p.id===id);return !!p&&p.delivery.activeSeconds>.5&&p.delivery.order.elapsed>.5;},'active pickup time replicated');
  await eventually(()=>{const p=two.state.world?.players.find(p=>p.id===id);return !!p&&p.cockpit.active&&p.cockpit.activeSeconds>.5;},'self-reported cockpit view and active time replicated');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,steer:1,brake:true}}));
  await eventually(()=>two.state.world?.players.find(p=>p.id===id)?.cockpit.active===false,'leaving cockpit view replicated');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&Math.hypot(e.pushX,e.pushZ)>.4;},'drift lateral motion replicated');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,throttle:1,boost:true}}));
  await eventually(()=>!!(two.state.world?.entities.find(e=>e.id===entityId)?.thrusters!&THRUSTER_REAR),'remote boost exhaust replicated');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:NEUTRAL}));
  one.socket.send(JSON.stringify({type:'reset'}));await delay(500);
  // The press is counted, so a complete tap between input frames is retained.
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:1}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.y>.5&&e.air<100&&(e.thrusters&(THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT))===(THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT);},'jump exhaust and air use replicated');
  const remaining=two.state.world!.entities.find(e=>e.id===entityId)!.air;
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:1,flip:1}}));
  await eventually(()=>!!(two.state.world?.entities.find(e=>e.id===entityId)?.thrusters!&THRUSTER_SIDE_RIGHT),'remote flip exhaust replicated');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.stunts===1&&Math.abs(e.air-(remaining-4.5))<.01;},'one-tap flip completion replicated');
  const flightStart=two.state.world!.entities.find(e=>e.id===entityId)!;
  const flightOrigin={x:flightStart.x,z:flightStart.z,yaw:flightStart.yaw};
  for(let i=0;i<12;i++){one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:1,flip:1,throttle:1,hover:true}}));await delay(50);}
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.supportId===null&&((e.x-flightOrigin.x)*-Math.sin(flightOrigin.yaw)+(e.z-flightOrigin.z)*-Math.cos(flightOrigin.yaw)>1)&&(e.thrusters&THRUSTER_REAR)!==0;},'remote forward flight and hover replicated');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:1,flip:1}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.supportId!==null;},'assisted landing on a shared surface replicated');
  // A double jump from the Bay approach reaches the low City Glide lane.
  // Check its server-applied refill from the other client's snapshots.
  // The second connection can win the first spawn on a real network. Move it
  // if it occupies the Bay approach, then retry around traffic or our own car.
  const otherCar=two.state.world?.entities.find(e=>e.driver===two.state.id);
  if(otherCar&&Math.hypot(otherCar.x-40,otherCar.z-60)<8){
    two.socket.send(JSON.stringify({type:'reset'}));await delay(700);
  }
  let laneSpawn=false;
  const spawnAttempts:unknown[]=[];
  for(let attempt=0;attempt<8&&!laneSpawn;attempt++){
    one.socket.send(JSON.stringify({type:'reset'}));await delay(700);
    const e=two.state.world?.entities.find(e=>e.id===entityId);
    laneSpawn=!!e&&e.supportId==='ground'&&Math.abs(e.speed)<=1&&currentAt({...e,y:12,supportId:null})?.id==='market';
    spawnAttempts.push(e&&{x:e.x,y:e.y,z:e.z,supportId:e.supportId,speed:e.speed});
  }
  assert.ok(laneSpawn,`a free ground spawn beneath City Glide is available: ${JSON.stringify(spawnAttempts)}`);
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:2}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.y>4.5;},'first jump near its peak toward sky lane');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump:3}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.lastJump===3&&e.vy<=11;},'air jump restores capped upward speed');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&currentAt(e)?.id==='market';},'remote car enters shared sky lane');
  const streamAir=two.state.world!.entities.find(e=>e.id===entityId)!.air;
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.air>streamAir+2&&e.vx>2;},'server applies sky-lane speed and air');
  one.socket.send(JSON.stringify({type:'reset'}));await delay(500);
  await delay(500);one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&e.inDome)??false,'arena entry replicated');
  one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&!e.inDome)??false,'immediate arena exit replicated');
  one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&e.inDome)??false,'immediate arena re-entry replicated');
  assert.equal(two.state.world!.soccer.blueScore,0);assert.equal(two.state.world!.soccer.orangeScore,0);
  // A busy host can skip timer callbacks; drive for simulation time, not a
  // fixed number of real-time sends, to reproduce the same shot reliably.
  const shoot=async()=>{
    const start=two.state.world!.time,deadline=Date.now()+25000;
    while((two.state.world?.time??start)-start<3.5&&Date.now()<deadline){
      one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,throttle:1}}));await delay(50);
    }
    assert.ok((two.state.world?.time??start)-start>=3.5,`the room advanced enough simulation time for the shot: ${JSON.stringify({start,end:two.state.world?.time,oneClosed:one.state.closed,twoClosed:two.state.closed,oneSocket:one.socket.readyState,twoSocket:two.socket.readyState,oneAck:one.state.inputAck,car:two.state.world?.entities.find(e=>e.id===entityId)})}`);
  };
  await shoot();
  await eventually(()=>!!two.state.world&&two.state.world.soccer.ball.x>DOME.x+2,'car impact moves the shared ball');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:NEUTRAL}));
  try { await eventually(()=>one.state.world?.soccer.blueScore===1&&two.state.world?.soccer.blueScore===1,'goal score replicated to both clients',6000); }
  catch (error) {
    throw new Error(`First goal did not complete: ${JSON.stringify({soccer:two.state.world?.soccer,car:two.state.world?.entities.find(e=>e.id===entityId),inputAck:one.state.inputAck,expectedInput:inputSeq})}`, { cause:error });
  }
  await eventually(()=>two.state.world?.soccer.participants.some(p=>p.playerId===id&&p.touches.roadster&&p.goals.roadster===1)??false,'authoritative Roadster touch and goal credit replicated');
  assert.ok(!one.state.world!.players.find(p=>p.id===id)!.achievements.unlocked.includes('rocket-rookie'),'playing award waits for the completed match');
  for(let score=2;score<=5;score++){
    await eventually(()=>two.state.world?.soccer.phase==='play','next kickoff',15000);
    one.socket.send(JSON.stringify({type:'reset'}));
    await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&Math.abs(e.x-(DOME.x-30))<1&&Math.abs(e.z-DOME.z)<1;},'dome reset to shooting position',8000);
    await shoot();
    one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:NEUTRAL}));
    await eventually(()=>one.state.world?.soccer.blueScore===score&&two.state.world?.soccer.blueScore===score,`goal ${score} replicated`,12000);
  }
  await eventually(()=>{
    const soccer=two.state.world?.soccer,p=two.state.world?.players.find(p=>p.id===id);
    return soccer?.phase==='win'&&soccer.winningPlayers.includes(id)&&p?.achievements.unlocked.includes('rocket-rookie')&&p.achievements.unlocked.includes('roadster-champion');
  },'match winner and both Roadster awards replicated');
  assert.deepEqual(two.state.world!.players.find(p=>p.id===two.state.id)!.achievements.unlocked,[],'nonparticipant receives no Dome award');
  if(winningDriver&&spectatorDriver) {
    const ownsAwards=(event:ChatEvent)=>event.type==='awards'&&!!event.awards?.room.includes('rocket-rookie')&&event.awards.room.includes('roadster-champion');
    await eventually(()=>winningDriver!.events.some(ownsAwards),'room-earned awards are durably confirmed to the winner',15000);
    assert.ok(!spectatorDriver.events.some(ownsAwards),'room-earned awards are not sent to another identity');
    winningDriver.socket.close();
    spectatorDriver.socket.close();
    const [winnerRecovered,spectatorRecovered]=await Promise.all([recoverDriver(winningDriver.code),recoverDriver(spectatorDriver.code)]);
    assert.equal(winnerRecovered.ready.playerId,winningDriver.playerId);
    assert.ok(winnerRecovered.ready.awards?.room.includes('rocket-rookie'));
    assert.ok(winnerRecovered.ready.awards?.room.includes('roadster-champion'));
    assert.equal(spectatorRecovered.ready.playerId,spectatorDriver.playerId);
    assert.deepEqual(spectatorRecovered.ready.awards,{room:[],solo:[]},'another saved driver cannot inherit the winner’s awards');
  }
  if(awardsOnly) {
    console.log('PASS: saved drivers bind privately; room ticket replay is rejected; a real five-goal Dome match saves awards to the winning driver; recovery restores those awards and isolates the spectator.');
  } else {
  // Drive from the kickoff onto a wall; the room must refill air for both clients.
  await delay(500);one.socket.send(JSON.stringify({type:'reset'}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.inDome&&Math.abs(e.x-(DOME.x-30))<.1&&e.y<.1;},'arena reset for wall charge');
  const reset=two.state.world!.entities.find(e=>e.id===entityId)!;
  const beforeCharge=reset.air,jump=reset.lastJump,flip=reset.lastFlip;
  assert.ok(beforeCharge<90,'earlier flight leaves room to observe a refill');
  let maxOne=beforeCharge,maxTwo=beforeCharge,wallSeen=false,maxHeight=0;
  for(let i=0;i<200;i++){
    one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,jump,flip,throttle:1,steer:i<20?1:0}}));
    await delay(50);
    const a=one.state.world?.entities.find(e=>e.id===entityId),b=two.state.world?.entities.find(e=>e.id===entityId);
    if(a)maxOne=Math.max(maxOne,a.air);
    if(b){maxTwo=Math.max(maxTwo,b.air);maxHeight=Math.max(maxHeight,b.y);wallSeen||=b.supportId==='dome'&&b.y>=8;}
    if(wallSeen&&maxOne>beforeCharge+3&&maxTwo>beforeCharge+3)break;
  }
  assert.ok(wallSeen&&maxOne>beforeCharge+3&&maxTwo>beforeCharge+3,`moving wall refill replicated to both clients: ${JSON.stringify({beforeCharge,maxOne,maxTwo,maxHeight,wallSeen,car:two.state.world?.entities.find(e=>e.id===entityId)})}`);
  await delay(500);one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&!e.inDome)??false,'arena exit replicated');
  // Leave ample network margin around the server's 400 ms action cooldown.
  await delay(1000);
  const beforeReset=two.state.world!.entities.find(e=>e.id===entityId)!;
  const resetOrigin={x:beforeReset.x,z:beforeReset.z};
  one.socket.send(JSON.stringify({type:'reset'}));
  await eventually(()=>{
    const e=two.state.world?.entities.find(e=>e.id===entityId);
    return !!e&&!e.inDome&&e.supportId==='ground'&&Math.abs(e.speed)<=1&&Math.hypot(e.x-resetOrigin.x,e.z-resetOrigin.z)>1;
  },'reset to a stationary ground spawn replicated');
  await delay(1000);one.socket.send(JSON.stringify({type:'selectVehicle',kind:'zoox'}));await delay(1000);
  assert.ok(!two.state.world?.entities.some(e=>e.driver===id&&e.kind==='zoox'),'non-Tesla selection rejected by room');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.driver===id);return !!e&&e.supportId==='ground'&&Math.abs(e.speed)<=1;},'car stationary and grounded before Tesla selection');
  one.socket.send(JSON.stringify({type:'selectVehicle',kind:'model-3'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.driver===id&&e.kind==='model-3')??false,'Tesla fleet change visible to remote player');
  await delay(500);one.socket.send(JSON.stringify({type:'upgrade',upgrade:'rocket',requestId:1}));
  one.socket.send(JSON.stringify({type:'upgrade',upgrade:'rocket',requestId:2}));
  await eventually(()=>one.state.upgradeResults?.some(r=>r.requestId===1&&r.upgrade==='rocket'&&!r.ok)??false,'rejected purchase receives an explicit result');
  await eventually(()=>one.state.upgradeResults?.some(r=>r.requestId===2&&!r.ok)??false,'rate-limited purchase receives an explicit result');
  assert.equal(two.state.upgradeResults?.length??0,0,'purchase results go only to the requester');
  assert.equal(two.state.world?.entities.find(e=>e.driver===id)?.upgrades.rocket,false,'remote purchase without cash and outside a shop rejected');
  await delay(500);one.socket.send(JSON.stringify({type:'ota',enabled:true,requestId:3}));
  one.socket.send(JSON.stringify({type:'ota',enabled:false,requestId:4}));
  await eventually(()=>one.state.otaResults?.some(r=>r.requestId===3&&r.ok)??false,'subscription receives an explicit result');
  await eventually(()=>two.state.world?.players.find(p=>p.id===id)?.delivery.ota.enabled??false,'subscription state replicated');
  assert.equal(two.state.world?.players.find(p=>p.id===id)?.delivery.ota.active,false,'unfunded subscription pauses');
  assert.equal(two.state.otaResults?.length??0,0,'subscription result goes only to requester');
  await eventually(()=>one.state.otaResults?.some(r=>r.requestId===4&&!r.enabled&&!r.ok)??false,'rate-limited subscription receives an explicit result');
  assert.equal(two.state.world?.players.find(p=>p.id===id)?.delivery.ota.enabled,true,'rate-limited cancellation did not alter subscription');
  await delay(500);one.socket.send(JSON.stringify({type:'ota',enabled:false,requestId:5}));
  await eventually(()=>two.state.world?.players.find(p=>p.id===id)?.delivery.ota.enabled===false,'cancellation replicated');
  await delay(500);one.socket.send(JSON.stringify({type:'autopilot'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.driver===id&&e.autopilot)??false,'autonomous mode replicated');
  // Reset can choose an occupied-avoidance spawn off this connected route.
  // A sync barrier observes the processed action, rather than assuming a fixed
  // delay implies a reset under load. The Bay approach is a known route origin.
  let routeOrigin=false;
  const routeSpawns:unknown[]=[];
  for(let attempt=0;attempt<8&&!routeOrigin;attempt++){
    await delay(700);
    const token=10+attempt;
    one.socket.send(JSON.stringify({type:'reset'}));
    one.socket.send(JSON.stringify({type:'sync',token}));
    await eventually(()=>(one.state.sync??0)>=token,'reset processed before destination',8000);
    const car=one.state.world?.entities.find(e=>e.driver===id);
    routeOrigin=!!car&&!car.autopilot&&car.supportId==='ground'&&Math.abs(car.speed)<=1&&Math.hypot(car.x-40,car.z-60)<1;
    routeSpawns.push(car&&{x:car.x,z:car.z,yaw:car.yaw,supportId:car.supportId,speed:car.speed,autopilot:car.autopilot});
  }
  assert.ok(routeOrigin,`known connected route origin is available: ${JSON.stringify(routeSpawns)}`);
  await delay(500);
  one.socket.send(JSON.stringify({type:'destination',x:-120,z:60,requestId:9}));
  try { await eventually(()=>one.state.destinationResults?.some(r=>r.requestId===9)??false,'destination receives a result'); }
  catch (error) {
    throw new Error(`Destination request failed: ${JSON.stringify({results:one.state.destinationResults,car:two.state.world?.entities.find(e=>e.driver===id),player:two.state.world?.players.find(p=>p.id===id)})}`, {cause:error});
  }
  assert.equal(one.state.destinationResults?.find(r=>r.requestId===9)?.ok,true,'destination is accepted by the room');
  await eventually(()=>two.state.world?.entities.some(e=>e.driver===id&&e.autopilot&&e.navigation?.status==='driving')??false,'destination route is replicated');
  assert.equal(two.state.destinationResults?.length??0,0,'destination response goes only to the requester');
  await delay(500);one.socket.send(JSON.stringify({type:'minigame',game:'short'}));
  one.socket.send(JSON.stringify({type:'race',action:'start',courseId:'short'}));
  await eventually(()=>two.state.world?.races.rounds.some(r=>r.courseId==='short'&&r.phase==='countdown'&&r.entrants.some(e=>e.playerId===id))??false,'race starts immediately after direct entry');
  assert.ok(two.state.world?.entities.some(e=>e.driver===id&&e.z< -1200&&!e.autopilot),'car is placed at the island race start');
  one.socket.send(JSON.stringify({type:'race',action:'leave',courseId:'short'}));
  one.socket.send(JSON.stringify({type:'minigame',game:'queue'}));
  one.socket.send(JSON.stringify({type:'parking',action:'start'}));
  await eventually(()=>!!two.state.world&&!two.state.world.races.rounds.some(r=>r.entrants.some(e=>e.playerId===id))&&two.state.world.parking.rounds.some(r=>r.mode==='queue'&&r.phase==='active'&&r.entrants.some(e=>e.playerId===id)),'immediate switch and parking start are replicated');
  one.socket.send(JSON.stringify({type:'parking',action:'leave'}));
  await eventually(()=>!two.state.world?.parking.rounds.some(r=>r.entrants.some(e=>e.playerId===id)),'parking leave is replicated immediately');
  one.socket.send(JSON.stringify({ type: 'input', seq:++inputSeq, input: { ...NEUTRAL, throttle: 900 } }));
  await eventually(() => one.state.closed === 1008 && two.state.world?.players.length === 1, 'invalid input closes only offending player and removes entity');
  const response = await fetch(base + '/api/room/test'); assert.equal(response.status, 426);
  const invalid = await fetch(base + '/api/room/INVALID'); assert.equal(invalid.status, 404);
  console.log(`PASS: two-client join, ferry and activity snapshots, shared sky-lane speed and refill, arena entry, shared ball impact, five goals, authoritative match winner and Roadster awards, spectator exclusion, wall refill and exit, traffic, room clock, surface and upgrade snapshots, movement, delivery, police, jump, flip, landing, Tesla-only selection, rejected purchase, autonomous mode, destination navigation, direct mini-game entry, invalid-input isolation, disconnect cleanup, route checks; advertised capacity ${two.state.capacity}. This is not a ferry crossing or load test.`);
  }
} finally { clearInterval(keepObserverAlive); one.socket.close(); two.socket.close(); for(const socket of chatSockets)socket.close(); }
