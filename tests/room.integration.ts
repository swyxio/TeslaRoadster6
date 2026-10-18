// Run against Wrangler or deployment: pnpm exec tsx tests/room.integration.ts [http://localhost:8787]
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, NEUTRAL, THRUSTER_REAR, THRUSTER_DOWN_LEFT, THRUSTER_DOWN_RIGHT, THRUSTER_SIDE_RIGHT, type World } from '../shared/game';
import { DOME } from '../shared/dome';
import { currentAt } from '../shared/sky-currents';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { supportHeight } from '../shared/map';
const base = process.argv[2] ?? 'http://localhost:8787';
let inputSeq=0, observerSeq=0;
// The combined protocol includes Caltrain, research sites and vehicle finishes.
assert.equal(PROTOCOL_VERSION, 33);
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
  const state: { id?: string; world?: World; capacity?: number; inputAck?:number; closed?: number; upgradeResults?: {requestId:number;upgrade:string;ok:boolean}[]; vehicleStyleResults?: {requestId:number;category:string;choice:string;ok:boolean}[]; otaResults?: {requestId:number;enabled:boolean;ok:boolean}[]; destinationResults?: {requestId:number;ok:boolean}[]; marsResults?: {requestId:number;action:string;ok:boolean;amount:number}[] } = {};
  socket.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.type === 'welcome') { assert.equal(data.version, PROTOCOL_VERSION); state.id = data.id; state.capacity = data.capacity; }
    if (data.type === 'state') {state.world = data.world;state.inputAck=data.inputAck;}
    if (data.type === 'upgradeResult') (state.upgradeResults??=[]).push(data);
    if (data.type === 'vehicleStyleResult') (state.vehicleStyleResults??=[]).push(data);
    if (data.type === 'otaResult') (state.otaResults??=[]).push(data);
    if (data.type === 'destinationResult') (state.destinationResults??=[]).push(data);
    if (data.type === 'marsResult') (state.marsResults??=[]).push(data);
  });
  socket.addEventListener('close', event => { state.closed = event.code; });
  return { socket, state };
}
const one = connect(), two = connect();
// Keep the observing client connected through the full five-goal match.
const keepObserverAlive=setInterval(()=>{if(two.socket.readyState===WebSocket.OPEN)two.socket.send(JSON.stringify({type:'input',seq:++observerSeq,input:NEUTRAL}));},5000);
try {
  await eventually(() => !!one.state.id && !!two.state.id && one.state.world?.players.length === 2 && two.state.world?.players.length === 2, 'two players visible in both snapshots');
  for(const state of [one.state,two.state]){
    assert.ok(state.world!.players.every(p=>p.delivery.cash===2500&&p.delivery.earned===0&&p.delivery.level===0&&p.delivery.completed===0&&p.delivery.lastBlocked===null&&p.delivery.order.stage==='pickup'&&p.delivery.order.pickupEstimate>0&&p.delivery.lastReward===null&&p.delivery.lastTicket===null&&p.delivery.flight.seconds===0&&p.achievements.unlocked.length===0));
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
    assert.ok(state.world!.entities.every(e=>e.style.paint==='stock'&&e.style.decal==='none'),'initial finishes are replicated');
    assert.ok(state.world!.entities.every(e=>e.tankLevel===1),'starter tank level is replicated');
    assert.ok(state.world!.mars.fund>=0&&state.world!.mars.fund<=1_000_000_000);assert.equal(state.world!.mars.launchAt,null);
  }
  const forger=connect();
  await eventually(()=>!!forger.state.id,'research forger joins');
  forger.socket.send(JSON.stringify({type:'research',site:'ucsf'}));
  await eventually(()=>forger.state.closed===1008&&two.state.world?.players.length===2,'a forged research claim is rejected and isolated');
  assert.equal(two.state.world!.players.find(p=>p.id===one.state.id)!.delivery.cash,2500);
  assert.ok(!two.state.world!.players.find(p=>p.id===one.state.id)!.achievements.unlocked.includes('ucsf-research'));
  one.socket.send(JSON.stringify({type:'vehicleStyle',category:'paint',choice:'mint',requestId:80}));
  one.socket.send(JSON.stringify({type:'vehicleStyle',category:'decal',choice:'stripe',requestId:81}));
  await eventually(()=>one.state.vehicleStyleResults?.some(r=>r.requestId===80&&!r.ok)??false,'unfunded finish rejected');
  await eventually(()=>one.state.vehicleStyleResults?.some(r=>r.requestId===81&&!r.ok)??false,'rate-limited finish rejected');
  assert.equal(two.state.vehicleStyleResults?.length??0,0,'finish purchase results are private');
  assert.deepEqual(two.state.world!.entities.find(e=>e.driver===one.state.id)!.style,{paint:'stock',decal:'none'},'rejected finish leaves remote car unchanged');
  await delay(500);
  await delay(500);one.socket.send(JSON.stringify({type:'mars',action:'board',requestId:91}));
  await eventually(()=>one.state.marsResults?.some(r=>r.requestId===91&&!r.ok)??false,'early remote boarding is rejected');
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
  for(let i=0;i<70;i++){one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,throttle:1}}));await delay(50);}
  await eventually(()=>!!two.state.world&&two.state.world.soccer.ball.x>DOME.x+2,'car impact moves the shared ball');
  one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:NEUTRAL}));
  await eventually(()=>one.state.world?.soccer.blueScore===1&&two.state.world?.soccer.blueScore===1,'goal score replicated to both clients',6000);
  await eventually(()=>two.state.world?.soccer.participants.some(p=>p.playerId===id&&p.touches.roadster&&p.goals.roadster===1)??false,'authoritative Roadster touch and goal credit replicated');
  assert.ok(!one.state.world!.players.find(p=>p.id===id)!.achievements.unlocked.includes('rocket-rookie'),'playing award waits for the completed match');
  for(let score=2;score<=5;score++){
    await eventually(()=>two.state.world?.soccer.phase==='play','next kickoff',15000);
    one.socket.send(JSON.stringify({type:'reset'}));
    await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&Math.abs(e.x-(DOME.x-30))<1&&Math.abs(e.z-DOME.z)<1;},'dome reset to shooting position',8000);
    for(let i=0;i<70;i++){one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,throttle:1}}));await delay(50);}
    one.socket.send(JSON.stringify({type:'input',seq:++inputSeq,input:NEUTRAL}));
    await eventually(()=>one.state.world?.soccer.blueScore===score&&two.state.world?.soccer.blueScore===score,`goal ${score} replicated`,12000);
  }
  await eventually(()=>{
    const soccer=two.state.world?.soccer,p=two.state.world?.players.find(p=>p.id===id);
    return soccer?.phase==='win'&&soccer.winningPlayers.includes(id)&&p?.achievements.unlocked.includes('rocket-rookie')&&p.achievements.unlocked.includes('roadster-champion');
  },'match winner and both Roadster awards replicated');
  assert.deepEqual(two.state.world!.players.find(p=>p.id===two.state.id)!.achievements.unlocked,[],'nonparticipant receives no Dome award');
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
  await delay(500);one.socket.send(JSON.stringify({type:'reset'}));await delay(700);
  one.socket.send(JSON.stringify({type:'destination',x:-120,z:60,requestId:9}));
  await eventually(()=>one.state.destinationResults?.some(r=>r.requestId===9&&r.ok)??false,'destination is accepted by the room');
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
  console.log(`PASS: two-client join, ferry and activity snapshots, shared sky-lane speed and refill, arena entry, shared ball impact, five goals, authoritative match winner and Roadster awards, spectator exclusion, wall refill and exit, traffic, room clock, surface, upgrade and vehicle finish snapshots, rejected finish purchases, movement, delivery, police, jump, flip, landing, Tesla-only selection, rejected purchase, autonomous mode, destination navigation, direct mini-game entry, invalid-input isolation, disconnect cleanup, route checks; advertised capacity ${two.state.capacity}. This is not a ferry crossing or load test.`);
} finally { clearInterval(keepObserverAlive); one.socket.close(); two.socket.close(); }
