// Run against local Wrangler with MAX_PLAYERS=2.
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, ROOM_FULL_CODE } from '../shared/game';

const base=process.argv[2]??'http://localhost:8787';
const wsBase=base.replace(/^http/,'ws');
const health=await fetch(`${base}/api/health`);
assert.deepEqual(await health.json(),{ok:true,version:PROTOCOL_VERSION,capacity:2},'start Wrangler with MAX_PLAYERS=2');
const sockets:WebSocket[]=[];
type Result={kind:'welcome';id:string}|{kind:'close';code:number;reason:string};
function connect(path:string){
  const socket=new WebSocket(wsBase+path);sockets.push(socket);
  const states:{players:{id:string}[]}[]=[];
  let resolved=false;
  const result=new Promise<Result>((resolve,reject)=>{
    socket.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));
      if(message.type==='state')states.push(message.world);
      if(message.type==='welcome'&&!resolved){
        resolved=true;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
        assert.equal(message.version,PROTOCOL_VERSION);assert.equal(message.capacity,2);
        resolve({kind:'welcome',id:message.id});
      }
    });
    socket.addEventListener('close',event=>{if(!resolved){resolved=true;resolve({kind:'close',code:event.code,reason:event.reason});}});
    socket.addEventListener('error',()=>{if(!resolved){resolved=true;reject(new Error(`Connection failed: ${path}`));}});
  });
  const closed=new Promise<void>(resolve=>socket.addEventListener('close',()=>resolve(),{once:true}));
  return {socket,result,closed,states};
}
async function within<T>(promise:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>;
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out')),10_000);})]);}
  finally{clearTimeout(timer!);}
}
async function waitFor(check:()=>boolean):Promise<void>{
  const deadline=Date.now()+5000;
  while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for room snapshot');await new Promise(resolve=>setTimeout(resolve,25));}
}
function welcome(result:Result):string{assert.equal(result.kind,'welcome');return (result as Extract<Result,{kind:'welcome'}>).id;}

try{
  for(const path of ['/api/public-room/0','/api/public-room/01','/api/public-room/17','/api/public-room/-1','/api/public-room/1x','/api/public-room/1/','/api/public-room/%31'])
    assert.equal((await fetch(base+path)).status,404,`${path} must be rejected`);
  for(const path of ['/api/public-room/1','/api/public-room/16'])
    assert.equal((await fetch(base+path)).status,426,`${path} requires WebSocket upgrade`);

  const first=connect('/api/public-room/1');const firstId=welcome(await within(first.result));
  const contenders=Array.from({length:5},()=>connect('/api/public-room/1'));
  const results=await within(Promise.all(contenders.map(client=>client.result)));
  assert.equal(results.filter(result=>result.kind==='welcome').length,1,'exactly one contender wins the last seat');
  for(const result of results.filter(result=>result.kind==='close'))
    assert.deepEqual(result,{kind:'close',code:ROOM_FULL_CODE,reason:'Room full'});

  const named=connect('/api/room/public-1');const namedId=welcome(await within(named.result));
  const next=connect('/api/public-room/2');const nextId=welcome(await within(next.result));
  const last=connect('/api/public-room/16');welcome(await within(last.result));
  await waitFor(()=>[first,named,next].every(client=>client.states.length>0));
  const ids=(client:typeof first)=>client.states.at(-1)!.players.map(player=>player.id);
  assert.ok(ids(first).includes(firstId));assert.ok(!ids(first).includes(namedId));assert.ok(!ids(first).includes(nextId));
  assert.ok(ids(named).includes(namedId));assert.ok(!ids(named).includes(firstId));assert.ok(!ids(named).includes(nextId));
  assert.ok(ids(next).includes(nextId));assert.ok(!ids(next).includes(firstId));assert.ok(!ids(next).includes(namedId));

  first.socket.close();await within(first.closed);
  // The server's close event can follow the client close event.
  await new Promise(resolve=>setTimeout(resolve,100));
  const replacement=connect('/api/public-room/1');welcome(await within(replacement.result));
  console.log('PASS: public room route validation, concurrent final seat, namespace isolation, and freed-seat backfill.');
}finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
}
