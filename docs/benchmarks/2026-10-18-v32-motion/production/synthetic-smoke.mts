import assert from 'node:assert/strict';
import { RoomInputClient } from '/private/tmp/tesland-driving-ticks/tests/room-input-client.ts';
import { NEUTRAL } from '/private/tmp/tesland-driving-ticks/shared/game.ts';

const base='https://tesland.swyx.io';
const health=await (await fetch(base+'/api/health')).json();
assert.equal(health.version,32);assert.equal(health.capacity,8);
const room=`perf-release-${Date.now()}`;
const clients=[0,1].map(()=>{
  const socket=new WebSocket(base.replace('https:','wss:')+'/api/room/'+room);
  const input=new RoomInputClient(socket);
  const state={id:'',world:null as any,closed:0};
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));input.observe(message);
    if(message.type==='welcome'){assert.equal(message.version,32);assert.equal(message.capacity,8);state.id=message.id;}
    if(message.type==='state')state.world=message.world;
  });
  socket.addEventListener('close',event=>{state.closed=event.code;});
  return {socket,input,state};
});
async function until(check:()=>boolean,label:string){
  const end=Date.now()+12000;
  while(Date.now()<end){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error('Timed out: '+label);
}
let timer:ReturnType<typeof setInterval>|undefined;
try {
  await until(()=>clients.every(c=>c.input.ready&&c.state.world?.players.length===2),'two players');
  const initial=clients[0].state.world.entities.find((e:any)=>e.driver===clients[0].state.id);
  const start=Date.now();
  timer=setInterval(()=>clients.forEach((c,i)=>c.input.ready&&c.input.send({...NEUTRAL,throttle:i===0&&Date.now()-start<3000?1:0,steer:i===0&&Date.now()-start>2000?.3:0})),50);
  await new Promise(resolve=>setTimeout(resolve,3500));
  clearInterval(timer);timer=undefined;
  await new Promise(resolve=>setTimeout(resolve,500));
  const cars=clients.map(c=>c.state.world.entities.find((e:any)=>e.driver===clients[0].state.id));
  const displacement=cars.map(c=>Math.hypot(c.x-initial.x,c.z-initial.z));
  assert.ok(displacement.every(d=>d>10),'both clients see the driver move');
  assert.ok(clients.every(c=>(c.input.control?.appliedSeq??0)>0&&!c.state.closed),'inputs applied without disconnect');
  console.log(JSON.stringify({at:new Date().toISOString(),base,room,health,displacement,applied:clients.map(c=>c.input.control?.appliedSeq),rejections:clients.map(c=>c.input.rejections),note:'Short production functional smoke using the synthetic RoomInputClient helper, not browser latency or capacity evidence. No persistent actions.'},null,2));
} finally {if(timer)clearInterval(timer);for(const c of clients)if(c.socket.readyState===WebSocket.OPEN)c.socket.close();}
