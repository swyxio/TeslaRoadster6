// Run against Wrangler or deployment: pnpm exec tsx tests/room.integration.ts [http://localhost:8787]
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, NEUTRAL, THRUSTER_REAR, THRUSTER_DOWN_LEFT, THRUSTER_DOWN_RIGHT, THRUSTER_SIDE_RIGHT, type World } from '../shared/game';
import { DOME } from '../shared/dome';
const base = process.argv[2] ?? 'http://localhost:8787';
const url = base.replace(/^http/, 'ws') + `/api/room/test-${Date.now()}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check: () => boolean, label: string, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
function connect() {
  const socket = new WebSocket(url);
  const state: { id?: string; world?: World; capacity?: number; closed?: number; upgradeResults?: {requestId:number;upgrade:string;ok:boolean}[] } = {};
  socket.addEventListener('message', event => {
    const data = JSON.parse(String(event.data));
    if (data.type === 'welcome') { assert.equal(data.version, PROTOCOL_VERSION); state.id = data.id; state.capacity = data.capacity; }
    if (data.type === 'state') state.world = data.world;
    if (data.type === 'upgradeResult') (state.upgradeResults??=[]).push(data);
  });
  socket.addEventListener('close', event => { state.closed = event.code; });
  return { socket, state };
}
const one = connect(), two = connect();
try {
  await eventually(() => !!one.state.id && !!two.state.id && one.state.world?.players.length === 2 && two.state.world?.players.length === 2, 'two players visible in both snapshots');
  for(const state of [one.state,two.state]){
    assert.ok(state.world!.players.every(p=>p.delivery.cash===0&&p.delivery.order.stage==='pickup'&&p.delivery.order.pickupEstimate>0&&p.delivery.lastReward===null&&p.delivery.lastTicket===null&&p.delivery.flight.seconds===0&&p.achievements.unlocked.length===0));
    assert.equal(state.world!.entities.filter(e=>e.police).length,4);
  }
  assert.ok(one.state.world!.entities.some(e=>e.id===one.state.world!.players.find(p=>p.id===two.state.id)!.entityId),'nearby player entity is present');
  assert.ok(two.state.world!.entities.some(e=>e.npc),'nearby traffic is present in the room snapshot');
  assert.ok(two.state.world!.entities.every(e=>Object.hasOwn(e,'supportId')),'surface identity is present in every replicated entity');
  assert.ok(two.state.world!.entities.every(e=>Object.hasOwn(e,'upgrades')),'vehicle upgrades are present in room snapshots');
  assert.ok(two.state.world!.entities.every(e=>e.tankLevel===1),'starter tank level is replicated');
  const initialTime=two.state.world!.time;
  await eventually(()=>!!two.state.world&&two.state.world.time>initialTime,'authoritative room clock advances');
  const id = one.state.id!;
  const entityId = one.state.world!.players.find(p => p.id === id)!.entityId;
  const initial = one.state.world!.entities.find(e => e.id === entityId)!;
  const origin={x:initial.x,z:initial.z,yaw:initial.yaw};
  for (let i = 0; i < 20; i++) { one.socket.send(JSON.stringify({ type: 'input', input: { ...NEUTRAL, throttle: 1, cockpit: true } })); await delay(50); }
  await eventually(() => {const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&((e.x-origin.x)*-Math.sin(origin.yaw)+(e.z-origin.z)*-Math.cos(origin.yaw)>4);}, 'remote player receives authoritative movement');
  await eventually(()=>{const p=two.state.world?.players.find(p=>p.id===id);return !!p&&p.delivery.activeSeconds>.5&&p.delivery.order.elapsed>.5;},'active pickup time replicated');
  await eventually(()=>{const p=two.state.world?.players.find(p=>p.id===id);return !!p&&p.cockpit.active&&p.cockpit.activeSeconds>.5;},'self-reported cockpit view and active time replicated');
  one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,steer:1,brake:true}}));
  await eventually(()=>two.state.world?.players.find(p=>p.id===id)?.cockpit.active===false,'leaving cockpit view replicated');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&Math.hypot(e.pushX,e.pushZ)>.4;},'drift lateral motion replicated');
  one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:1,boost:true}}));
  await eventually(()=>!!(two.state.world?.entities.find(e=>e.id===entityId)?.thrusters!&THRUSTER_REAR),'remote boost exhaust replicated');
  one.socket.send(JSON.stringify({type:'input',input:NEUTRAL}));
  one.socket.send(JSON.stringify({type:'reset'}));await delay(500);
  // The press is counted, so a complete tap between input frames is retained.
  one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,jump:1}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.y>.5&&e.air<100&&(e.thrusters&(THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT))===(THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT);},'jump exhaust and air use replicated');
  const remaining=two.state.world!.entities.find(e=>e.id===entityId)!.air;
  one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,jump:1,flip:1}}));
  await eventually(()=>!!(two.state.world?.entities.find(e=>e.id===entityId)?.thrusters!&THRUSTER_SIDE_RIGHT),'remote flip exhaust replicated');
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.stunts===1&&Math.abs(e.air-(remaining-4.5))<.01;},'one-tap flip completion replicated');
  const flightStart=two.state.world!.entities.find(e=>e.id===entityId)!;
  const flightOrigin={x:flightStart.x,z:flightStart.z,yaw:flightStart.yaw};
  for(let i=0;i<12;i++){one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,jump:1,flip:1,throttle:1,hover:true}}));await delay(50);}
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.supportId===null&&((e.x-flightOrigin.x)*-Math.sin(flightOrigin.yaw)+(e.z-flightOrigin.z)*-Math.cos(flightOrigin.yaw)>1)&&(e.thrusters&THRUSTER_REAR)!==0;},'remote forward flight and hover replicated');
  one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,jump:1,flip:1}}));
  await eventually(()=>{const e=two.state.world?.entities.find(e=>e.id===entityId);return !!e&&e.y===0;},'assisted landing replicated');
  await delay(500);one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&e.inDome)??false,'arena entry replicated');
  assert.equal(two.state.world!.soccer.blueScore,0);assert.equal(two.state.world!.soccer.orangeScore,0);
  for(let i=0;i<70;i++){one.socket.send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:1}}));await delay(50);}
  await eventually(()=>!!two.state.world&&two.state.world.soccer.ball.x>DOME.x+2,'car impact moves the shared ball');
  one.socket.send(JSON.stringify({type:'input',input:NEUTRAL}));
  await eventually(()=>one.state.world?.soccer.blueScore===1&&two.state.world?.soccer.blueScore===1,'goal score replicated to both clients',6000);
  await delay(500);one.socket.send(JSON.stringify({type:'dome'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.id===entityId&&!e.inDome)??false,'arena exit replicated');
  await delay(500);one.socket.send(JSON.stringify({type:'reset'}));await delay(500);
  one.socket.send(JSON.stringify({type:'selectVehicle',kind:'zoox'}));await delay(500);
  assert.ok(!two.state.world?.entities.some(e=>e.driver===id&&e.kind==='zoox'),'non-Tesla selection rejected by room');
  one.socket.send(JSON.stringify({type:'selectVehicle',kind:'model-3'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.driver===id&&e.kind==='model-3')??false,'Tesla fleet change visible to remote player');
  await delay(500);one.socket.send(JSON.stringify({type:'upgrade',upgrade:'rocket',requestId:1}));
  one.socket.send(JSON.stringify({type:'upgrade',upgrade:'rocket',requestId:2}));
  await eventually(()=>one.state.upgradeResults?.some(r=>r.requestId===1&&r.upgrade==='rocket'&&!r.ok)??false,'rejected purchase receives an explicit result');
  await eventually(()=>one.state.upgradeResults?.some(r=>r.requestId===2&&!r.ok)??false,'rate-limited purchase receives an explicit result');
  assert.equal(two.state.upgradeResults?.length??0,0,'purchase results go only to the requester');
  assert.equal(two.state.world?.entities.find(e=>e.driver===id)?.upgrades.rocket,false,'remote purchase without cash and outside a shop rejected');
  await delay(500);one.socket.send(JSON.stringify({type:'autopilot'}));
  await eventually(()=>two.state.world?.entities.some(e=>e.driver===id&&e.autopilot)??false,'autonomous mode replicated');
  one.socket.send(JSON.stringify({ type: 'input', input: { ...NEUTRAL, throttle: 900 } }));
  await eventually(() => one.state.closed === 1008 && two.state.world?.players.length === 1, 'invalid input closes only offending player and removes entity');
  const response = await fetch(base + '/api/room/test'); assert.equal(response.status, 426);
  const invalid = await fetch(base + '/api/room/INVALID'); assert.equal(invalid.status, 404);
  console.log(`PASS: two-client join, arena entry, shared ball impact, replicated goal and exit, traffic, room clock, surface and upgrade snapshots, movement, delivery, police, jump, flip, landing, Tesla-only selection, rejected purchase, autonomous mode, invalid-input isolation, disconnect cleanup, route checks; advertised capacity ${two.state.capacity}. This is not a load test.`);
} finally { one.socket.close(); two.socket.close(); }
