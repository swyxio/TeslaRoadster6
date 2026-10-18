// Local two-client measurement of input -> authoritative movement; not screen latency or WAN performance.
import assert from 'node:assert/strict';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
const base=process.argv[2]??'http://127.0.0.1:18943';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Use a local server.');
const health=await (await fetch(base+'/api/health')).json() as {version:number};assert.equal(health.version,PROTOCOL_VERSION);
const url=base.replace(/^http/,'ws')+`/api/room/latency-${Date.now()}`;
const sockets=[new WebSocket(url),new WebSocket(url)];
const ids:string[]=[],worlds:(World|undefined)[]=[],seen:(number|undefined)[]=[];
let started:number|undefined,initial:{x:number;z:number}|undefined,timer:ReturnType<typeof setInterval>|undefined;
let inputSeq=0;
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  for(let i=0;i<sockets.length;i++)sockets[i].addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.type==='welcome')ids[i]=message.id;
    if(message.type!=='state')return;
    const world=message.world as World;worlds[i]=world;
    if(started===undefined||!initial||seen[i]!==undefined)return;
    const driver=world.players.find(player=>player.id===ids[0]);
    const car=world.entities.find(entity=>entity.id===driver?.entityId);
    if(car&&Math.hypot(car.x-initial.x,car.z-initial.z)>.2)seen[i]=performance.now()-started;
  });
  const deadline=performance.now()+10000;
  while((ids.length<2||!worlds[0]||!worlds[1]||worlds[0]!.players.length<2||worlds[1]!.players.length<2)&&performance.now()<deadline)await wait(20);
  assert.ok(ids[0]&&ids[1]&&worlds[0]&&worlds[1]&&worlds[0]!.players.length===2&&worlds[1]!.players.length===2,'both clients joined');
  const player=worlds[0]!.players.find(p=>p.id===ids[0])!,car=worlds[0]!.entities.find(entity=>entity.id===player.entityId)!;
  initial={x:car.x,z:car.z};started=performance.now();
  const send=()=>{for(let i=0;i<sockets.length;i++)if(sockets[i].readyState===WebSocket.OPEN)sockets[i].send(JSON.stringify({type:'input',seq:++inputSeq,input:{...NEUTRAL,throttle:i===0?1:0}}));};
  send();timer=setInterval(send,50);
  while((seen[0]===undefined||seen[1]===undefined)&&performance.now()-started<5000)await wait(20);
  assert.ok(seen[0]!==undefined&&seen[1]!==undefined,'both clients observe authoritative driving');
  console.log(JSON.stringify({driverObservedMs:Math.round(seen[0]),peerObservedMs:Math.round(seen[1]),
    note:'Single same-host two-client input to >0.2m authoritative displacement; includes acceleration and snapshots, not browser display, WAN, or percentile latency.'},null,2));
} finally {if(timer)clearInterval(timer);for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();}
