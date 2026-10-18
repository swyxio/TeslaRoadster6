// Bounded headless clients, local Wrangler only. Example:
// pnpm exec tsx scripts/load-room.ts http://127.0.0.1:8787 8 10
// This includes client parsing and same-host scheduling; it does not isolate Worker CPU.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { RoomInputClient } from '../tests/room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, type World } from '../shared/game';

const base=process.argv[2]??"https://codex-driving-tick-contract-bay-drive.swyxio.workers.dev";
const count=Number(process.argv[3]??'8'),seconds=Number(process.argv[4]??'10');
if(base!=="https://codex-driving-tick-contract-bay-drive.swyxio.workers.dev")throw new Error('Only the designated preview is allowed.');
if(count!==8||seconds!==60)throw new Error('Only the approved eight-client, sixty-second check is allowed.');
if(!Number.isInteger(count)||count<1||count>128||!Number.isFinite(seconds)||seconds<2||seconds>60)throw new Error('Use 1–128 clients and a duration of 2–60 seconds.');
const health=await (await fetch(base+'/api/health')).json() as {version:number;capacity:number};
if(health.version!==PROTOCOL_VERSION||health.capacity!==8)throw new Error(`Server version/capacity mismatch: ${JSON.stringify(health)}`);
const room=`load-${Date.now()}`;
const url=base.replace(/^http/,'ws')+`/api/room/${room}`;
console.error(`ROOM: ${room}`);
const inputs:RoomInputClient[]=[];
const sockets:WebSocket[]=[],lastSnapshot=new Array<number>(count).fill(0),snapshotCounts=new Array<number>(count).fill(0);
const seenPlayers=new Array<number>(count).fill(0),firstTime=new Array<number|undefined>(count),lastTime=new Array<number|undefined>(count),gaps:number[]=[];
const loopDelay=monitorEventLoopDelay({resolution:20});
let measuring=false,snapshots=0,bytes=0,sent=0,closed=0;
let ninthClose:{code:number;reason:string}|undefined;
let timer:ReturnType<typeof setInterval>|undefined;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  const ready=Array.from({length:count},(_,i)=>new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url);sockets.push(socket);const input=new RoomInputClient(socket);inputs.push(input);let welcomed=false;
    socket.addEventListener('message',event=>{
      const raw=String(event.data),message=JSON.parse(raw) as {type:string;version?:number;world?:World};
      input.observe(message);
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
    for(let i=0;i<sockets.length;i++)if(inputs[i].ready){
      inputs[i].send({...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2});if(measuring)sent++;
    }
  },50);
  let joinTimeout:ReturnType<typeof setTimeout>;
  try {await Promise.race([Promise.all(ready),new Promise<never>((_,reject)=>{joinTimeout=setTimeout(()=>reject(new Error('Timed out joining clients')),40000);})]);}
  finally {clearTimeout(joinTimeout!);}
  await new Promise<void>((resolve,reject)=>{
    const extra=new WebSocket(url);
    const timeout=setTimeout(()=>{extra.close();reject(new Error('Ninth connection did not close within 5 seconds'));},5000);
    extra.addEventListener('message',event=>{
      if(JSON.parse(String(event.data)).type==='welcome'){
        clearTimeout(timeout);extra.close();reject(new Error('Ninth connection was welcomed into a full room'));
      }
    });
    extra.addEventListener('error',()=>{clearTimeout(timeout);extra.close();reject(new Error('Ninth connection failed before a full-room close'));},{once:true});
    extra.addEventListener('close',event=>{
      clearTimeout(timeout);ninthClose={code:event.code,reason:event.reason};
      if(event.code!==ROOM_FULL_CODE)reject(new Error(`Expected full-room close ${ROOM_FULL_CODE}, got ${event.code}: ${event.reason}`));
      else resolve();
    },{once:true});
  });
  await delay(2000);loopDelay.enable();const start=performance.now();measuring=true;await delay(seconds*1000);measuring=false;
  const elapsed=(performance.now()-start)/1000;loopDelay.disable();gaps.sort((a,b)=>a-b);
  const advances=firstTime.map((first,i)=>first===undefined||lastTime[i]===undefined?0:lastTime[i]!-first);
  console.log(JSON.stringify({preview:base,room,ninthClose,clients:count,elapsedSeconds:+elapsed.toFixed(2),closed,sentInputs:sent,inputRejections:inputs.reduce((sum,input)=>sum+input.rejectionCount,0),clientsWithAppliedInput:inputs.filter(input=>(input.control?.appliedSeq??0)>0).length,snapshots,
    clientsSeeingAll:seenPlayers.filter(players=>players===count).length,minSnapshots:Math.min(...snapshotCounts),
    snapshotRatePerClient:+(snapshots/count/elapsed).toFixed(2),p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),
    decodedJsonMiB:+(bytes/1048576).toFixed(2),minSimulatedSeconds:+Math.min(...advances).toFixed(2),medianSimulatedSeconds:+advances.sort((a,b)=>a-b)[Math.floor(count/2)].toFixed(2),
    clientEventLoopP95Ms:+(loopDelay.percentile(95)/1e6).toFixed(1),
    note:'Eight synthetic clients send input at 20 Hz to one remote preview room and parse all received JSON. One bounded run, not production, sustained, real-player or physical-device capacity evidence.'},null,2));
} finally {if(timer)clearInterval(timer);for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();}
