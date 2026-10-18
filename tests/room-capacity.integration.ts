// Run with MAX_PLAYERS=2 against local Wrangler: pnpm exec tsx tests/room-capacity.integration.ts [http://localhost:8787]
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, ROOM_FULL_CODE } from '../shared/game';

const base = process.argv[2] ?? 'http://localhost:8787';
const health = await fetch(base+'/api/health');
assert.equal(health.status,200);
assert.deepEqual(await health.json(),{ok:true,version:PROTOCOL_VERSION,capacity:2},'start Wrangler with MAX_PLAYERS=2');
const slug = `capacity-${Date.now()}`;
const url = (room:string) => base.replace(/^http/,'ws')+`/api/room/${room}`;
const sockets: WebSocket[] = [];
function connect(room:string) {
  const socket = new WebSocket(url(room)); sockets.push(socket);
  const welcome = new Promise<void>((resolve,reject)=>{
    socket.addEventListener('message',event=>{if(JSON.parse(String(event.data)).type==='welcome'){socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));resolve();}});
    socket.addEventListener('error',()=>reject(new Error('WebSocket connection failed')));
  });
  const closed = new Promise<CloseEvent>(resolve=>socket.addEventListener('close',resolve,{once:true}));
  return {socket,welcome,closed};
}
async function within<T>(promise:Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out')),10000);})]); }
  finally { clearTimeout(timer!); }
}
try {
  const first=connect(slug),second=connect(slug);
  await within(Promise.all([first.welcome,second.welcome]));
  const rejected=connect(slug); const close=await within(rejected.closed);
  assert.equal(close.code,ROOM_FULL_CODE);assert.equal(close.reason,'Room full');
  const other=connect(`${slug}-other`); await within(other.welcome);
  first.socket.close();await within(first.closed);
  const replacement=connect(slug);await within(replacement.welcome);
  console.log('PASS: full-room close code, separate named room, and a freed slot accepting a replacement.');
} finally { for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close(); }
