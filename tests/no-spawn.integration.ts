// Run against the local-only fixture in tests/fixtures/wrangler.no-spawn.jsonc.
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE } from '../shared/game';

const base=process.argv[2]??'http://localhost:8787';
const sockets:WebSocket[]=[];
type Result={type:'welcome';version:number;capacity:number}|{type:'close';code:number;reason:string};
function connect():Promise<Result>{
  const socket=new WebSocket(base.replace(/^http/,'ws')+'/api/room/blocked');
  sockets.push(socket);
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Timed out waiting for welcome or close')),10000);
    socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(message.type==='welcome'){socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));clearTimeout(timeout);resolve(message);}
    });
    socket.addEventListener('close',event=>{clearTimeout(timeout);resolve({type:'close',code:event.code,reason:event.reason});},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('WebSocket connection failed'));},{once:true});
  });
}
try{
  // A leaked session would make the third failure report room-full at capacity 2.
  for(let i=0;i<3;i++)assert.deepEqual(await connect(),{type:'close',code:ROOM_NO_SPAWN_CODE,reason:'No safe starting space'});
  const release=await fetch(base+'/release');
  assert.equal(release.status,200);
  for(let i=0;i<2;i++){
    const result=await connect();
    assert.equal(result.type,'welcome');
    if(result.type==='welcome'){assert.equal(result.version,PROTOCOL_VERSION);assert.equal(result.capacity,2);}
  }
  assert.deepEqual(await connect(),{type:'close',code:ROOM_FULL_CODE,reason:'Room full'});
  console.log('PASS: blocked spawns close with retryable code without consuming seats; both seats work after space is released.');
}finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
}
