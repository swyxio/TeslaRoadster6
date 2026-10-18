/** Local-only room load and actual plain/compressed WebSocket frame samples.
 * pnpm exec tsx scripts/bench-room-wire.ts http://127.0.0.1:8791 64 10
 */
import { randomBytes } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';

const base=new URL(process.argv[2]??'http://127.0.0.1:8791');
const count=Number(process.argv[3]??64),seconds=Number(process.argv[4]??10);
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Only local HTTP is allowed');
if(!Number.isInteger(count)||count<3||count>64||!Number.isFinite(seconds)||seconds<2||seconds>60)throw new Error('Use 3–64 clients and 2–60 seconds');
const health=await (await fetch(new URL('/api/health',base))).json() as {version:number;capacity:number};
if(health.version!==PROTOCOL_VERSION||count>health.capacity)throw new Error(`Server version/capacity mismatch: ${JSON.stringify(health)}`);
const room=`wire-${Date.now()}-${randomBytes(3).toString('hex')}`;
const path=`/api/room/${room}`,url=`ws://${base.host}${path}`;
let measuring=false,seq=0,normalClosed=0;
const sockets:WebSocket[]=[],sendTimes=Array.from({length:count-2},()=>new Map<number,number>()),acks:number[]=[],normalBytes:number[]=[],gaps:number[]=[];
const firstTime=new Array<number|undefined>(count-2),lastTime=new Array<number|undefined>(count-2),lastFrame=new Array<number>(count-2).fill(0);
const lastAck=new Array<number>(count-2).fill(0),seenPlayers=new Array<number>(count-2).fill(0),snapshotCounts=new Array<number>(count-2).fill(0);
const loopDelay=monitorEventLoopDelay({resolution:20});
type Wire={socket:Socket;ready:boolean;extension:string;sizes:number[];compressed:number;frames:number;error?:string};
const wire:Wire[]=[];
function maskText(text:string):Buffer{
  const data=Buffer.from(text),mask=randomBytes(4);let header:Buffer;
  if(data.length<126)header=Buffer.from([0x81,0x80|data.length]);
  else if(data.length<65536){header=Buffer.alloc(4);header[0]=0x81;header[1]=0xfe;header.writeUInt16BE(data.length,2);}
  else throw new Error('Input frame too large');
  const payload=Buffer.alloc(data.length);for(let i=0;i<data.length;i++)payload[i]=data[i]^mask[i%4];
  return Buffer.concat([header,mask,payload]);
}
async function openWire(compression:boolean):Promise<Wire>{
  const socket=connect({host:base.hostname.replace(/^\[|\]$/g,''),port:Number(base.port||80)});
  const result:Wire={socket,ready:false,extension:'',sizes:[],compressed:0,frames:0};wire.push(result);
  let pending=Buffer.alloc(0),handshake=true,textFrames=0;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{socket.destroy();reject(new Error('wire handshake timed out'));},30000);
    socket.on('error',error=>{result.error=error.message;clearTimeout(timeout);if(handshake)reject(error);});
    socket.on('close',()=>{if(!result.error)result.error='wire connection closed';});
    socket.on('connect',()=>{
      const ext=compression?'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n':'';
      socket.write(`GET ${path} HTTP/1.1\r\nHost: ${base.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n${ext}\r\n`);
    });
    socket.on('data',chunk=>{
      pending=Buffer.concat([pending,chunk]);
      if(handshake){
        const end=pending.indexOf('\r\n\r\n');if(end<0)return;
        const headers=pending.subarray(0,end).toString();pending=pending.subarray(end+4);
        if(!/^HTTP\/1\.1 101\b/.test(headers)){clearTimeout(timeout);socket.destroy();reject(new Error(`Upgrade failed: ${headers.split('\r\n')[0]}`));return;}
        result.extension=headers.match(/^sec-websocket-extensions:\s*(.*)$/im)?.[1]?.trim()??'';
        handshake=false;result.ready=true;clearTimeout(timeout);resolve(result);
      }
      while(pending.length>=2){
        const first=pending[0],second=pending[1];let length=second&127,header=2;
        if(length===126){if(pending.length<4)return;length=pending.readUInt16BE(2);header=4;}
        else if(length===127){if(pending.length<10)return;length=Number(pending.readBigUInt64BE(2));header=10;}
        if((second&128)||!(first&128)){result.error='masked or fragmented server frame unsupported';socket.destroy();return;}
        if(pending.length<header+length)return;
        if((first&15)===1&&textFrames++>0&&measuring){result.frames++;result.sizes.push(header+length);if(first&64)result.compressed++;}
        if((first&15)===8){result.error='server closed wire connection';socket.destroy();return;}
        pending=pending.subarray(header+length);
      }
    });
  });
}
const ready=Array.from({length:count-2},(_,i)=>new Promise<void>((resolve,reject)=>{
  const socket=new WebSocket(url);sockets.push(socket);let welcomed=false;
  socket.addEventListener('message',event=>{
    const raw=String(event.data),message=JSON.parse(raw) as {type:string;version?:number;world?:World;inputAck?:number};
    if(message.type==='welcome'){
      if(message.version!==PROTOCOL_VERSION){reject(new Error(`client ${i} protocol mismatch`));return;}
      welcomed=true;resolve();
    }
    if(message.type==='state'&&message.world&&measuring){
      const now=performance.now();if(lastFrame[i])gaps.push(now-lastFrame[i]);lastFrame[i]=now;
      snapshotCounts[i]++;normalBytes.push(Buffer.byteLength(raw));seenPlayers[i]=message.world.players.length;
      firstTime[i]??=message.world.time;lastTime[i]=message.world.time;
      const ack=message.inputAck??0;
      if(ack>lastAck[i]){const sent=sendTimes[i].get(ack);if(sent!==undefined)acks.push(now-sent);lastAck[i]=ack;}
    }
  });
  socket.addEventListener('error',()=>{if(!welcomed)reject(new Error(`client ${i} failed to connect`));});
  socket.addEventListener('close',event=>{normalClosed++;if(!welcomed)reject(new Error(`client ${i} closed before welcome: ${event.code}`));});
}));
const timer=setInterval(()=>{
  const current=++seq;
  for(const [i,socket] of sockets.entries())if(socket.readyState===WebSocket.OPEN){
    const input=JSON.stringify({type:'input',seq:current,input:{...NEUTRAL,throttle:.5,steer:Math.sin(i+Math.floor(current/20))*.2}});
    sendTimes[i].set(current,performance.now());sendTimes[i].delete(current-500);socket.send(input);
  }
  for(const [i,client] of wire.entries())if(client.ready&&!client.socket.destroyed){
    client.socket.write(maskText(JSON.stringify({type:'input',seq:current,input:{...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2}})));
  }
},50);
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  const wireReady=Promise.all([openWire(false),openWire(true)]);
  const normalReady=Promise.all(ready);
  let timeout:ReturnType<typeof setTimeout>;
  let plain:Wire,compressed:Wire;
  try{[[plain,compressed]]=await Promise.race([Promise.all([wireReady,normalReady]),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('clients timed out joining')),60000);})]);}
  finally{clearTimeout(timeout!);}
  await delay(2000);loopDelay.enable();const started=performance.now();measuring=true;
  await delay(seconds*1000);measuring=false;const elapsed=(performance.now()-started)/1000;loopDelay.disable();
  const percentile=(values:number[],p:number)=>{const s=[...values].sort((a,b)=>a-b);return s.length?+s[Math.floor((s.length-1)*p)].toFixed(1):null;};
  const describe=(s:Wire)=>{
    if(s.error||s.frames<2)throw new Error(`wire sampling failed: ${s.error??'too few frames'}`);
    return {extension:s.extension||'(none)',frames:s.frames,compressedFrames:s.compressed,p50FrameBytes:percentile(s.sizes,.5),p95FrameBytes:percentile(s.sizes,.95),frameBytesPerWallSecond:Math.round(s.sizes.reduce((a,b)=>a+b,0)/elapsed)};
  };
  const a=describe(plain),b=describe(compressed);
  if(!compressed.extension.toLowerCase().includes('permessage-deflate')||compressed.compressed!==compressed.frames)throw new Error('Compression not negotiated or not used for all frames');
  const advances=firstTime.map((first,i)=>first===undefined||lastTime[i]===undefined?0:lastTime[i]!-first);
  console.log(JSON.stringify({clients:count,normalClients:count-2,elapsedSeconds:+elapsed.toFixed(2),closed:normalClosed,
    clientsSeeingAll:seenPlayers.filter(p=>p===count).length,minSnapshots:Math.min(...snapshotCounts),
    minSimulatedSeconds:+Math.min(...advances).toFixed(2),medianSimulatedSeconds:percentile(advances,.5),
    p95SnapshotGapMs:percentile(gaps,.95),p95InputAckAgeMs:percentile(acks,.95),ackedSamples:acks.length,
    decodedNormal:{snapshots:normalBytes.length,p50JsonBytes:percentile(normalBytes,.5),totalBytes:normalBytes.reduce((a,b)=>a+b,0)},
    wireObservers:{plain:a,compressed:b},clientEventLoopP95Ms:+(loopDelay.percentile(95)/1e6).toFixed(1),
    note:'Same-host local synthetic drivers, with two additional raw wire observers in the same room. Normal clients parse JSON; per-send acknowledgment ages include client and host scheduling, and pooled samples weight clients with more acknowledgments. Frame sizes include WebSocket headers, exclude TCP/IP; extension negotiation is local only. No WAN, mobile, sustained or production-capacity claim.'},null,2));
}finally{clearInterval(timer);for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();for(const client of wire)client.socket.destroy();}
