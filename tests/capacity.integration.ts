/** Bounded same-host capacity smoke; not a latency SLA or sustained load test. */
import assert from 'node:assert/strict';
import { NEUTRAL, type Entity } from '../shared/game';
const base = process.argv[2] ?? 'http://localhost:8787';
const count = Number(process.argv[3] ?? 64);
if (!Number.isInteger(count) || count < 2 || count > 128) throw new Error('Use 2–128 clients');
const room = `/api/room/capacity-${Date.now()}`;
const sockets: WebSocket[] = [];
const counts = new Map<WebSocket, number>();
const snapshots = new Map<WebSocket, number>();
const seen = new Map<WebSocket, number[]>();
let maxSnapshotEntities=0,maxSnapshotNpcs=0,maxSnapshotAmbient=0,maxSnapshotBytes=0,maxWorldTime=0;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let timer: ReturnType<typeof setInterval> | undefined;
try {
  for (let i = 0; i < count; i++) {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + room); sockets.push(ws);
    ws.addEventListener('message', e => {
      const raw=String(e.data),msg=JSON.parse(raw);
      if(msg.type !== 'state')return;
      counts.set(ws,msg.world.players.length);snapshots.set(ws,(snapshots.get(ws)??0)+1);
      const times=seen.get(ws)??[];times.push(Date.now());seen.set(ws,times);
      const entities=msg.world.entities as Entity[];
      maxSnapshotEntities=Math.max(maxSnapshotEntities,entities.length);
      maxSnapshotNpcs=Math.max(maxSnapshotNpcs,entities.filter(entity=>entity.npc).length);
      maxSnapshotAmbient=Math.max(maxSnapshotAmbient,entities.filter(entity=>entity.id.startsWith('ambient-')).length);
      maxSnapshotBytes=Math.max(maxSnapshotBytes,Buffer.byteLength(raw));
      maxWorldTime=Math.max(maxWorldTime,msg.world.time);
    });
    await wait(20);
  }
  timer=setInterval(()=>sockets.forEach((ws)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:.3}}));}),50);
  await wait(8000);
  assert.equal(sockets.filter(ws=>ws.readyState===WebSocket.OPEN).length,count);
  assert.ok(sockets.every(ws=>counts.get(ws)===count),'all clients see all peers');
  assert.ok(sockets.every(ws=>(snapshots.get(ws)??0)>25),'all clients receive continuous snapshots');
  const gaps=[...seen.values()].flatMap(times=>times.slice(1).map((t,i)=>t-times[i])).sort((a,b)=>a-b);
  console.log(JSON.stringify({result:'PASS',clients:count,minimumSnapshots:Math.min(...snapshots.values()),snapshotGapP95Ms:gaps[Math.floor(gaps.length*.95)],maxSnapshotEntities,maxSnapshotNpcs,maxSnapshotAmbient,maxSnapshotBytes,maxWorldTimeSeconds:maxWorldTime,note:'8-second same-host synthetic smoke. Entity counts and bytes are per recipient, not room-wide. Peak/reserve traffic, mobile rendering, WAN latency and sustained load are not validated.'},null,2));
} finally {clearInterval(timer);sockets.forEach(ws=>ws.close());}
