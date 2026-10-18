/** Bounded same-host capacity smoke; not a latency SLA or sustained load test. */
import assert from 'node:assert/strict';
import { NEUTRAL } from '../shared/game';
const base = process.argv[2] ?? 'http://localhost:8787';
const count = Number(process.argv[3] ?? 64);
if (!Number.isInteger(count) || count < 2 || count > 128) throw new Error('Use 2–128 clients');
const room = `/api/room/capacity-${Date.now()}`;
const sockets: WebSocket[] = [];
const counts = new Map<WebSocket, number>();
const snapshots = new Map<WebSocket, number>();
const seen = new Map<WebSocket, number[]>();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let timer: ReturnType<typeof setInterval> | undefined;
try {
  for (let i = 0; i < count; i++) {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + room); sockets.push(ws);
    ws.addEventListener('message', e => { const msg = JSON.parse(String(e.data)); if (msg.type === 'state') { counts.set(ws, msg.world.players.length); snapshots.set(ws,(snapshots.get(ws)??0)+1); const times=seen.get(ws)??[];times.push(Date.now());seen.set(ws,times); } });
    await wait(20);
  }
  timer=setInterval(()=>sockets.forEach((ws,i)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:.3,lift:i%4===0}}));}),50);
  await wait(8000);
  assert.equal(sockets.filter(ws=>ws.readyState===WebSocket.OPEN).length,count);
  assert.ok(sockets.every(ws=>counts.get(ws)===count),'all clients see all peers');
  assert.ok(sockets.every(ws=>(snapshots.get(ws)??0)>25),'all clients receive continuous snapshots');
  const gaps=[...seen.values()].flatMap(times=>times.slice(1).map((t,i)=>t-times[i])).sort((a,b)=>a-b);
  console.log(JSON.stringify({result:'PASS',clients:count,minimumSnapshots:Math.min(...snapshots.values()),snapshotGapP95Ms:gaps[Math.floor(gaps.length*.95)],note:'8-second same-host synthetic smoke. Not mobile rendering, WAN latency, or sustained-load validation.'},null,2));
} finally {clearInterval(timer);sockets.forEach(ws=>ws.close());}
