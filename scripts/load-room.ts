// Bounded headless clients, local Wrangler only. Example:
// pnpm exec tsx scripts/load-room.ts http://127.0.0.1:18943 64 10
// This includes client parsing and same-host scheduling; it does not isolate Worker CPU.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';

const base=process.argv[2]??'http://127.0.0.1:18943';
const count=Number(process.argv[3]??'64'),seconds=Number(process.argv[4]??'10');
const host=new URL(base).hostname;
if(!['127.0.0.1','localhost','[::1]'].includes(host))throw new Error('Run this synthetic load only against a local server.');
if(!Number.isInteger(count)||count<1||count>128||!Number.isFinite(seconds)||seconds<2||seconds>60)throw new Error('Use 1–128 clients and a duration of 2–60 seconds.');
const health=await (await fetch(base+'/api/health')).json() as {version:number;capacity:number};
if(health.version!==PROTOCOL_VERSION||count>health.capacity)throw new Error(`Server version/capacity mismatch: ${JSON.stringify(health)}`);
const url=base.replace(/^http/,'ws')+`/api/room/load-${Date.now()}`;
const sockets:WebSocket[]=[],lastSnapshot=new Array<number>(count).fill(0),snapshotCounts=new Array<number>(count).fill(0);
const seenPlayers=new Array<number>(count).fill(0),firstTime=new Array<number|undefined>(count),lastTime=new Array<number|undefined>(count),gaps:number[]=[];
const loopDelay=monitorEventLoopDelay({resolution:20});
let measuring=false,snapshots=0,bytes=0,sent=0,closed=0;
let timer:ReturnType<typeof setInterval>|undefined;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  const ready=Array.from({length:count},(_,i)=>new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url);sockets.push(socket);let welcomed=false;
    socket.addEventListener('message',event=>{
      const raw=String(event.data),message=JSON.parse(raw) as {type:string;version?:number;world?:World};
      if(message.type==='welcome'){if(message.version!==PROTOCOL_VERSION){reject(new Error(`client ${i} received an incompatible welcome`));return;}welcomed=true;resolve();}
      if(message.type==='state'&&message.world&&measuring){
        const now=performance.now();if(lastSnapshot[i])gaps.push(now-lastSnapshot[i]);lastSnapshot[i]=now;
        snapshots++;snapshotCounts[i]++;bytes+=Buffer.byteLength(raw);seenPlayers[i]=message.world.players.length;
        firstTime[i]??=message.world.time;lastTime[i]=message.world.time;
      }
    });
    socket.addEventListener('error',()=>{if(!welcomed)reject(new Error(`client ${i} failed to connect`));});
    socket.addEventListener('close',event=>{closed++;if(!welcomed)reject(new Error(`client ${i} closed before welcome: ${event.code}`));});
  }));
  timer=setInterval(()=>{
    for(let i=0;i<sockets.length;i++)if(sockets[i].readyState===WebSocket.OPEN){
      sockets[i].send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2}}));if(measuring)sent++;
    }
  },50);
  let joinTimeout:ReturnType<typeof setTimeout>;
  try {await Promise.race([Promise.all(ready),new Promise<never>((_,reject)=>{joinTimeout=setTimeout(()=>reject(new Error('Timed out joining clients')),40000);})]);}
  finally {clearTimeout(joinTimeout!);}
  await delay(2000);loopDelay.enable();const start=performance.now();measuring=true;await delay(seconds*1000);measuring=false;
  const elapsed=(performance.now()-start)/1000;loopDelay.disable();gaps.sort((a,b)=>a-b);
  const advances=firstTime.map((first,i)=>first===undefined||lastTime[i]===undefined?0:lastTime[i]!-first);
  console.log(JSON.stringify({clients:count,elapsedSeconds:+elapsed.toFixed(2),closed,sentInputs:sent,snapshots,
    clientsSeeingAll:seenPlayers.filter(players=>players===count).length,minSnapshots:Math.min(...snapshotCounts),
    snapshotRatePerClient:+(snapshots/count/elapsed).toFixed(2),p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),
    decodedJsonMiB:+(bytes/1048576).toFixed(2),minSimulatedSeconds:+Math.min(...advances).toFixed(2),medianSimulatedSeconds:+advances.sort((a,b)=>a-b)[Math.floor(count/2)].toFixed(2),
    clientEventLoopP95Ms:+(loopDelay.percentile(95)/1e6).toFixed(1),
    note:'Bounded local synthetic clients send input at 20 Hz and parse all received JSON. Same-host client parsing and contention affect the result; no WAN, sustained, mobile or production capacity claim.'},null,2));
} finally {if(timer)clearInterval(timer);for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();}
