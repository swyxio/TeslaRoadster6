// Run against isolated local Wrangler with MAX_PLAYERS=2.
import assert from 'node:assert/strict';
import { Session } from '../src/session';
import { PROTOCOL_VERSION } from '../shared/game';

const base=process.argv[2]??'http://127.0.0.1:8787',url=new URL(base);
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Local servers only');
assert.deepEqual(await (await fetch(`${base}/api/health`)).json(),{ok:true,version:PROTOCOL_VERSION,capacity:2});
Object.assign(globalThis,{window:globalThis,location:{protocol:url.protocol,host:url.host}});
const sockets:WebSocket[]=[],sessions:Session[]=[];
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check:()=>boolean,label:string){
  const deadline=Date.now()+20_000;
  while(!check()){if(Date.now()>deadline)throw new Error(`Timed out: ${label}`);await delay(20);}
}
async function hold(path:string){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path);sockets.push(socket);
  let result='';
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.type==='welcome'){
    result='welcome';socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
  }});
  socket.addEventListener('close',event=>{if(!result)result=`closed ${event.code}`;});
  await eventually(()=>!!result,`filler ${path}`);assert.equal(result,'welcome');return socket;
}
async function join(room:string,automatic:boolean){
  const session=new Session();sessions.push(session);
  const start=performance.now();let joinedAt=0;
  session.onRoomJoined=()=>{joinedAt=performance.now();};
  session.join(room,'Placement test',undefined,automatic);
  await eventually(()=>session.status!=='connecting',`join ${room}`);
  return {session,joinMs:joinedAt?Math.round(joinedAt-start):null};
}
try{
  const first=await hold('/api/room/bay');await hold('/api/room/bay');
  const overflow=await join('bay',true);assert.equal(overflow.session.room,'public:1');assert.equal(overflow.session.status,'online');
  await hold('/api/public-room/1');
  const explicit=await join('public:1',false);assert.equal(explicit.session.status,'disconnected');assert.equal(explicit.session.roomFull,true);assert.equal(explicit.session.room,'public:1');
  const next=await join('bay',true);assert.equal(next.session.room,'public:2');assert.equal(next.session.status,'online');
  first.close();await delay(250);
  const backfill=await join('bay',true);assert.equal(backfill.session.room,'bay');assert.equal(backfill.session.status,'online');
  console.log(JSON.stringify({result:'PASS',firstOverflowMs:overflow.joinMs,secondOverflowMs:next.joinMs,backfillMs:backfill.joinMs,
    note:'Local MAX_PLAYERS=2; timings are single functional samples on this host, not production latency or playable-capacity measurements.'}));
}finally{
  for(const session of sessions)session.disconnect();
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
}
