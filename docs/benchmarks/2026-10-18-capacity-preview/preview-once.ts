// One bounded 8- or 64-client check of this branch's isolated preview.
// The synthetic input helper is not the shipping Session clock. No rendering.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { RoomInputClient } from '../../../tests/room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, type World } from '../../../shared/game';

const base='https://codex-restore-room-capacity-bay-drive.swyxio.workers.dev';
const count=Number(process.argv[2]);
if(count!==8&&count!==64)throw new Error('Only 8 or 64 clients are allowed');
const seconds=60;
const health=await (await fetch(base+'/api/health')).json() as {ok:boolean;version:number;capacity:number};
if(!health.ok||health.version!==PROTOCOL_VERSION||health.capacity!==64)throw new Error(`Unexpected preview: ${JSON.stringify(health)}`);
const room=`capacity-${Date.now()}`;
const url=base.replace(/^http/,'ws')+`/api/room/${room}`;
const sockets:WebSocket[]=[],inputs:RoomInputClient[]=[];
const lastSnapshot=new Array<number>(count).fill(0),snapshotCounts=new Array<number>(count).fill(0);
const seenPlayers=new Array<number>(count).fill(0),firstTime=new Array<number|undefined>(count),lastTime=new Array<number|undefined>(count),gaps:number[]=[];
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const loop=monitorEventLoopDelay({resolution:20});
let measuring=false,closed=0,snapshots=0,bytes=0,sent=0,maxWorld=-Infinity,lastProgress=performance.now();
let failure='',timer:ReturnType<typeof setInterval>|undefined,watchdog:ReturnType<typeof setInterval>|undefined,measurementTimeout:ReturnType<typeof setTimeout>|undefined;
try{
  const ready=Array.from({length:count},(_,i)=>new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url);sockets.push(socket);const input=new RoomInputClient(socket);inputs.push(input);let joined=false;
    socket.addEventListener('message',event=>{
      const raw=String(event.data),message=JSON.parse(raw) as {type:string;version?:number;world?:World};
      input.observe(message);
      if(message.type==='welcome'){
        if(message.version!==PROTOCOL_VERSION){reject(new Error(`client ${i} protocol mismatch`));return;}
        socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
      }
      if(!joined&&input.active){joined=true;resolve();}
      if(message.type==='state'&&message.world){
        if(message.world.time>maxWorld){maxWorld=message.world.time;lastProgress=performance.now();}
        if(measuring){
          const now=performance.now();if(lastSnapshot[i])gaps.push(now-lastSnapshot[i]);lastSnapshot[i]=now;
          snapshots++;snapshotCounts[i]++;bytes+=Buffer.byteLength(raw);seenPlayers[i]=message.world.players.length;
          firstTime[i]??=message.world.time;lastTime[i]=message.world.time;
        }
      }
    });
    socket.addEventListener('error',()=>{if(!joined)reject(new Error(`client ${i} failed to connect`));});
    socket.addEventListener('close',event=>{closed++;if(!joined)reject(new Error(`client ${i} closed before identity: ${event.code} ${event.reason}`));});
  }));
  timer=setInterval(()=>{
    if(failure)return;
    for(let i=0;i<inputs.length;i++)if(inputs[i].active){
      if(sockets[i].bufferedAmount>1_000_000){failure=`client ${i} send buffer exceeded 1 MB`;return;}
      inputs[i].send({...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2});if(measuring)sent++;
    }
  },50);
  let joinTimeout:ReturnType<typeof setTimeout>;
  try{await Promise.race([Promise.all(ready),new Promise<never>((_,reject)=>{joinTimeout=setTimeout(()=>reject(new Error('Timed out joining clients')),40000);})]);}
  finally{clearTimeout(joinTimeout!);}
  if(failure)throw new Error(failure);
  let extraClose:{code:number;reason:string}|null=null;
  if(count===64){
    const extra=new WebSocket(url);sockets.push(extra);
    extraClose=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{extra.close();reject(new Error('65th connection did not close'));},10000);
      extra.addEventListener('close',event=>{clearTimeout(timeout);resolve({code:event.code,reason:event.reason});},{once:true});
      extra.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('65th connection failed'));},{once:true});
    });
    if(extraClose.code!==ROOM_FULL_CODE)throw new Error(`Unexpected 65th close: ${JSON.stringify(extraClose)}`);
  }
  await delay(2000);loop.enable();const start=performance.now();measuring=true;lastProgress=start;
  await Promise.race([
    new Promise<void>(resolve=>{measurementTimeout=setTimeout(resolve,seconds*1000);}),
    new Promise<void>(resolve=>{watchdog=setInterval(()=>{
      if(performance.now()-lastProgress>10000)failure='No observed world progress for 10 seconds';
      if(failure)resolve();
    },500);}),
  ]);
  measuring=false;const elapsed=(performance.now()-start)/1000;loop.disable();gaps.sort((a,b)=>a-b);
  const advances=firstTime.map((first,i)=>first===undefined||lastTime[i]===undefined?0:lastTime[i]!-first);
  console.log(JSON.stringify({preview:base,room,clients:count,requestedSeconds:seconds,elapsedSeconds:+elapsed.toFixed(2),failure,extraClose,closed,sentInputs:sent,
    inputRejections:inputs.reduce((sum,input)=>sum+input.rejectionCount,0),clientsWithAppliedInput:inputs.filter(input=>(input.control?.appliedSeq??0)>0).length,
    snapshots,clientsSeeingAll:seenPlayers.filter(players=>players===count).length,minSnapshots:Math.min(...snapshotCounts),
    snapshotRatePerClient:+(snapshots/count/elapsed).toFixed(2),p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),
    decodedJsonMiB:+(bytes/1048576).toFixed(2),minSimulatedSeconds:+Math.min(...advances).toFixed(2),medianSimulatedSeconds:+advances.sort((a,b)=>a-b)[Math.floor(count/2)].toFixed(2),
    clientEventLoopP95Ms:+(loop.percentile(95)/1e6).toFixed(1),
    note:'Synthetic inputs use a helper, not the game Session. Input rejections include warm-up; decoded bytes are not wire bytes. Shared client host and WAN affect results; no tick-work, rendering, physical-device, sustained or production claim.'},null,2));
  if(failure)process.exitCode=1;
}finally{
  if(timer)clearInterval(timer);if(watchdog)clearInterval(watchdog);if(measurementTimeout)clearTimeout(measurementTimeout);loop.disable();
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
}
