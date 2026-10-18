// Run against a local Wrangler: pnpm exec tsx tests/prediction.integration.ts http://localhost:8787
import assert from 'node:assert/strict';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';

const base=process.argv[2]??'http://localhost:8787';
const health=await fetch(base+'/api/health');assert.equal((await health.json() as {version:number}).version,PROTOCOL_VERSION);
const socket=new WebSocket(base.replace(/^http/,'ws')+`/api/room/predict-${Date.now()}`);
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let id='',world:World|undefined,ack=-1,sync=0,states=0,destinationResult:{requestId:number;ok:boolean}|undefined;
socket.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data));
  if(message.type==='welcome'){assert.equal(message.version,PROTOCOL_VERSION);id=message.id;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
  if(message.type==='state'){states++;world=message.world;ack=message.inputAck;sync=message.sync??sync;}
  if(message.type==='destinationResult')destinationResult=message;
});
async function until(check:()=>boolean,label:string){
  const end=Date.now()+4000;while(Date.now()<end){if(check())return;await delay(10);}throw new Error(`Timed out: ${label}`);
}
try{
  await until(()=>!!id&&!!world,'initial state');assert.equal(ack,0);
  const send=(seq:number,steer:number)=>socket.send(JSON.stringify({type:'input',seq,input:{...NEUTRAL,steer}}));
  // Batched input is latest-wins; an acknowledgement need not imply every
  // earlier message was applied. Re-sent old sequence cannot replace it.
  send(1,-1);send(2,1);send(3,-1);
  await until(()=>ack===3&&!!world?.entities.find(e=>e.driver===id&&e.steering<-.1),'latest sequence applied and acknowledged');
  send(2,1);await delay(200);
  assert.equal(ack,3);assert.ok(world!.entities.find(e=>e.driver===id)!.steering<0,'older input cannot replace the latest');
  // Server can apply one input over multiple ticks while ACK remains stable.
  const time=world!.time;await until(()=>world!.time>time+.1,'repeated server ticks');assert.equal(ack,3);
  // Socket order guarantees this snapshot follows the reset; the token cannot
  // be confused with an ordinary state.
  socket.send(JSON.stringify({type:'reset'}));socket.send(JSON.stringify({type:'sync',token:17}));
  await until(()=>sync===17,'post-action snapshot barrier');
  const car=world!.entities.find(e=>e.driver===id)!;assert.equal(car.supportId,'ground');assert.equal(car.speed,0);
  send(4,1);await until(()=>ack===4,'new input accepted after barrier');
  const before=states;for(let token=100;token<120;token++)socket.send(JSON.stringify({type:'sync',token}));
  await until(()=>sync===119,'coalesced barriers');
  assert.ok(states-before<10,'barrier burst must not force a snapshot per request');
  await delay(500);
  socket.send(JSON.stringify({type:'minigame',game:'short'}));socket.send(JSON.stringify({type:'sync',token:120}));
  await until(()=>sync===120&&!!world?.races.rounds.some(round=>round.courseId==='short'&&round.entrants.some(entrant=>entrant.playerId===id)),'barrier follows mini-game entry');
  // Mini-game entry bypasses the action cooldown; reset starts a fresh one so
  // the following destination is rejected and the barrier still follows it.
  socket.send(JSON.stringify({type:'reset'}));
  socket.send(JSON.stringify({type:'destination',x:-120,z:60,requestId:42}));socket.send(JSON.stringify({type:'sync',token:121}));
  await until(()=>sync===121&&destinationResult?.requestId===42,'barrier follows rejected action');
  assert.equal(destinationResult!.ok,false,'action cooldown rejects the immediate destination request');
  console.log('PASS: sequence ACK, batched/skipped and repeated intents, stale input rejection and coalesced post-action and mini-game/rejection snapshot barriers');
}finally{socket.close();}
