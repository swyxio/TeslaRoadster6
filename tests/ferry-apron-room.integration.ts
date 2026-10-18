// Synthetic local staging of the same-tick ferry-apron relocation race.
import assert from 'node:assert/strict';
import { RoomInputClient } from './room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
import { isRocketIsland, terrainHeight } from '../shared/map';
import type { ControlSnapshot } from '../shared/tick-input';

const base=new URL(process.argv[2]??'http://127.0.0.1:18948');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),'fixture must run on local Wrangler');
const health=await fetch(new URL('/api/health',base));
assert.equal((await health.json() as {version:number}).version,PROTOCOL_VERSION);
const url=new URL(`/api/room/ferry-apron-${Date.now()}`,base);url.protocol='ws:';
const socket=new WebSocket(url),input=new RoomInputClient(socket);
const states:{tick:number;world:World;poseRevision:number;control:ControlSnapshot}[]=[];
let id:string|undefined;
socket.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data));input.observe(message);
  if(message.type==='welcome'){id=message.id;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
  if(message.type==='state')states.push(message);
});
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,label:string,timeout=6000){
  const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await delay(5);}throw new Error(`Timed out: ${label}`);
}
try{
  await until(()=>input.active&&!!id&&states.some(({world})=>world.entities.some(car=>car.driver===id&&car.supportId==='ferry')),'identified staged arriving driver');
  const staged=states.at(-1)!;
  const car=staged.world.entities.find(entity=>entity.driver===id)!;
  assert.equal(staged.world.ferry.phase,'island');
  assert.ok(staged.world.ferry.arrivals.includes(car.id));
  assert.equal(staged.control.revision,0);assert.equal(staged.poseRevision,0);
  const target=input.tick+4;
  const seq=input.send({...NEUTRAL,jump:1,throttle:1},{targetTick:target});
  await until(()=>states.some(state=>state.tick<target&&state.control.queued.some(slot=>slot.seq===seq&&slot.targetTick===target)&&state.control.jump.pending.some(edge=>edge.id===1&&edge.targetTick===target)),'frame and edge queued before due tick');
  // Keep a later level frame queued without replacing the frame under test.
  const heartbeat=input.send({...NEUTRAL,jump:1},{targetTick:target+1});
  await until(()=>states.some(state=>state.tick===target&&state.poseRevision===1),'apron relocation on the queued tick');
  const at=states.find(state=>state.tick===target)!;
  const landed=at.world.entities.find(entity=>entity.driver===id)!;
  assert.equal(at.control.revision,1);assert.equal(at.poseRevision,1);
  assert.equal(at.control.appliedSeq,seq,'the scheduler selected the due slot before relocation');
  assert.deepEqual(at.control.queued,[],'relocation clears the future heartbeat');
  assert.equal(at.control.held.throttle,0);assert.equal(at.control.jump.seen,1);assert.equal(at.control.jump.processed,0);
  assert.deepEqual(at.control.jump.pending,[]);
  assert.equal(landed.supportId,'ground');assert.ok(isRocketIsland(landed.x,landed.z));
  assert.equal(landed.y,terrainHeight(landed.x,landed.z));
  assert.equal(landed.lastJump,0);assert.equal(landed.air,car.air);
  assert.equal(landed.speed,0);assert.equal(landed.vy,0);assert.equal(landed.thrusters,0);
  assert.equal(at.world.ferry.arrivals.includes(car.id),false);
  assert.ok(!input.rejections.some(item=>item.seq===seq||item.seq===heartbeat),'both input frames were accepted');
  await until(()=>input.edges.some(edge=>edge.kind==='jump'&&edge.id===1&&edge.targetTick===target&&edge.status==='superseded'),'due jump reported superseded');
  assert.equal(input.edges.filter(edge=>edge.kind==='jump'&&edge.id===1).length,1,'jump has exactly one terminal outcome');
  await until(()=>input.tick>=target+4,'post-relocation state');
  const after=states.at(-1)!.world.entities.find(entity=>entity.driver===id)!;
  assert.equal(after.lastJump,0);assert.equal(after.supportId,'ground');assert.equal(after.air,car.air);
  assert.equal(after.speed,0);assert.ok(Math.hypot(after.x-landed.x,after.z-landed.z)<.001,'queued throttle did not move the car after relocation');
  const repeated=input.send({...NEUTRAL,jump:1});
  await until(()=>(input.control?.appliedSeq??0)>=repeated,'same-counter frame applied after relocation');
  assert.equal(states.at(-1)!.world.entities.find(entity=>entity.driver===id)!.lastJump,0,'superseded jump cannot replay');
  assert.equal(input.edges.filter(edge=>edge.kind==='jump'&&edge.id===1).length,1);
  assert.equal(input.control!.edgeFloorRevision,1,'autonomous relocation closes the old-revision edge bridge');
  const stale=input.send({...NEUTRAL,jump:2},{controlRevision:0});
  await until(()=>input.rejections.some(item=>item.seq===stale&&item.reason==='revision')&&input.edges.some(edge=>edge.kind==='jump'&&edge.id===2&&edge.status==='expired'),'pre-relocation revision expires a new press');
  input.action({type:'reset'});
  await until(()=>input.control!.revision===2,'later explicit reset invalidates controls');
  assert.equal(input.control!.edgeFloorRevision,1,'explicit action cannot reopen an older relocation');
  const tooOld=input.send({...NEUTRAL,jump:3},{controlRevision:0});
  await until(()=>input.rejections.some(item=>item.seq===tooOld&&item.reason==='revision')&&input.edges.some(edge=>edge.kind==='jump'&&edge.id===3&&edge.status==='expired'),'later action leaves the older revision closed');
  const afterRelocation=input.send({...NEUTRAL,jump:4},{controlRevision:1});
  await until(()=>input.rejections.some(item=>item.seq===afterRelocation&&item.reason==='revision')&&input.edges.some(edge=>edge.kind==='jump'&&edge.id===4&&(edge.status==='accepted'||edge.status==='rescheduled')),'post-relocation revision bridges the later action');
  await until(()=>input.edges.some(edge=>edge.kind==='jump'&&edge.id===4&&edge.status==='processed'),'eligible post-relocation press is processed');
  console.log(`PASS: real local room superseded the jump and cleared throttle on ferry-apron relocation at tick ${target}; revisions advanced and the car remained safely grounded. Ferry pose and deadline were synthetically staged.`);
}finally{if(socket.readyState===WebSocket.OPEN)socket.close(1000,'Test complete');}
