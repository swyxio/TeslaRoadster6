// Synthetic clients only. Use a disposable room on a local server or an authorized preview.
// pnpm exec tsx scripts/load-room.ts http://localhost:8797 64 10
import { NEUTRAL, PROTOCOL_VERSION } from '../shared/game';

const base=process.argv[2]??'http://localhost:8797';
const count=Number(process.argv[3]??'64'),seconds=Number(process.argv[4]??'10');
if(!Number.isInteger(count)||count<1||count>128||!Number.isFinite(seconds)||seconds<2||seconds>60)throw new Error('Use 1–128 clients and a duration of 2–60 seconds.');
const health=await (await fetch(base+'/api/health')).json() as {version:number;capacity:number};
if(health.version!==PROTOCOL_VERSION||count>health.capacity)throw new Error(`Server version/capacity mismatch: ${JSON.stringify(health)}`);
const url=base.replace(/^http/,'ws')+`/api/room/load-${Date.now()}`;
const sockets:WebSocket[]=[],lastSnapshot=new Array<number>(count).fill(0),gaps:number[]=[];
let measuring=false,snapshots=0,bytes=0,sent=0,closed=0,firstWorldTime:number|undefined,lastWorldTime:number|undefined;
let timer:ReturnType<typeof setInterval>|undefined;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  const ready=Array.from({length:count},(_,i)=>new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url);sockets.push(socket);
    let welcomed=false;
    socket.addEventListener('message',event=>{
      const raw=String(event.data),message=JSON.parse(raw);
      if(message.type==='welcome'){welcomed=true;resolve();}
      if(message.type==='state'&&measuring){
        const now=performance.now();
        if(lastSnapshot[i])gaps.push(now-lastSnapshot[i]);
        lastSnapshot[i]=now;snapshots++;bytes+=Buffer.byteLength(raw);
        if(i===0){firstWorldTime??=message.world.time;lastWorldTime=message.world.time;}
      }
    });
    socket.addEventListener('error',()=>{if(!welcomed)reject(new Error(`client ${i} failed to connect`));});
    socket.addEventListener('close',event=>{closed++;if(!welcomed)reject(new Error(`client ${i} closed before welcome: ${event.code}`));});
  }));
  timer=setInterval(()=>{
    for(let i=0;i<sockets.length;i++)if(sockets[i].readyState===WebSocket.OPEN){
      sockets[i].send(JSON.stringify({type:'input',input:{...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2}}));
      if(measuring)sent++;
    }
  },50);
  let joinTimeout:ReturnType<typeof setTimeout>;
  try { await Promise.race([Promise.all(ready),new Promise<never>((_,reject)=>{joinTimeout=setTimeout(()=>reject(new Error('Timed out joining clients')),40000);})]); }
  finally { clearTimeout(joinTimeout!); }
  await delay(2000);
  const start=performance.now();measuring=true;await delay(seconds*1000);measuring=false;
  const elapsed=(performance.now()-start)/1000;
  gaps.sort((a,b)=>a-b);
  console.log(JSON.stringify({clients:count,elapsedSeconds:+elapsed.toFixed(2),closed,sentInputs:sent,snapshots,snapshotRatePerClient:+(snapshots/count/elapsed).toFixed(2),p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),receivedMiB:+(bytes/1048576).toFixed(2),simulatedSeconds:firstWorldTime===undefined||lastWorldTime===undefined?null:+(lastWorldTime-firstWorldTime).toFixed(2)},null,2));
} finally {
  if(timer)clearInterval(timer);
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
}
