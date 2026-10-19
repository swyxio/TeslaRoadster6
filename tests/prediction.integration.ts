// Protocol-v49 local candidate control test. Run only against local Wrangler:
// pnpm exec tsx tests/prediction.integration.ts http://127.0.0.1:8787
import assert from 'node:assert/strict';
import { RoomInputClient } from './room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';

const base=new URL(process.argv[2]??'http://127.0.0.1:8787');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname),'run only against local Wrangler');
const health=await fetch(new URL('/api/health',base));assert.equal((await health.json() as {version:number}).version,PROTOCOL_VERSION);
assert.equal(PROTOCOL_VERSION,49);
const url=new URL(`/api/room/predict-${Date.now()}`,base);url.protocol='ws:';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean,label:string,timeout=6000){
  const end=Date.now()+timeout;while(Date.now()<end){if(check())return;await delay(10);}throw new Error(`Timed out: ${label}`);
}
function connect(){
  const socket=new WebSocket(url),input=new RoomInputClient(socket);
  const state:{id?:string;world?:World;sync?:number;states:number;closed?:number;destinationResult?:{requestId:number;ok:boolean}}={states:0};
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));input.observe(message);
    if(message.type==='welcome'){assert.equal(message.version,PROTOCOL_VERSION);state.id=message.id;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
    if(message.type==='state'){state.states++;state.world=message.world;state.sync=message.sync??state.sync;}
    if(message.type==='destinationResult')state.destinationResult=message;
  });
  socket.addEventListener('close',event=>{state.closed=event.code;});
  return {socket,input,state};
}
const driver=connect(), observer=connect(),sockets=[driver.socket,observer.socket];
const timeline:{type:string;kind?:string;id?:number;seq?:number;status?:string}[]=[];
driver.socket.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data));
  if(message.type==='inputEdge'||message.type==='inputRejected')timeline.push(message);
});
try{
  await until(()=>driver.input.active&&observer.input.active&&driver.state.world?.players.length===2&&observer.state.world?.players.length===2,'both identified clients and control states');
  assert.equal(driver.input.control!.appliedSeq,0);assert.equal(observer.input.control!.appliedSeq,0);
  const send=(value:Parameters<RoomInputClient['send']>[0],options?:Parameters<RoomInputClient['send']>[1])=>driver.input.send(value,options);
  const waitReject=(seq:number,reason:string)=>until(()=>driver.input.rejections.some(item=>item.seq===seq&&item.reason===reason),`${reason} rejection for ${seq}`);
  const edge=(kind:'jump'|'flip',id:number,status:string)=>driver.input.edges.filter(item=>item.kind===kind&&item.id===id&&item.status===status);

  // A far-enough, still valid target remains queued for a snapshot. Another
  // player's control snapshot contains only their own state, never this queue.
  const target=driver.input.tick+7;
  const a=send({...NEUTRAL,steer:-1},{targetTick:target});
  const b=send({...NEUTRAL,steer:1},{targetTick:target});
  const c=send({...NEUTRAL,steer:-1},{targetTick:target});
  await until(()=>driver.input.control?.queued.some(slot=>slot.seq===c&&slot.targetTick===target)??false,'owner sees the superseding future slot');
  assert.ok(!driver.input.control!.queued.some(slot=>slot.seq===a||slot.seq===b),'same-tick slots are replaced');
  assert.equal(observer.input.control!.receivedSeq,0);assert.deepEqual(observer.input.control!.queued,[]);
  // A +7 target can be later than the 300 ms watchdog, so keep the session
  // alive with a later slot without superseding the frame under test.
  send({...NEUTRAL,steer:-1},{targetTick:target+2});
  try { await until(()=>driver.input.control?.appliedSeq===c&&!!driver.state.world?.entities.find(entity=>entity.driver===driver.state.id&&entity.steering<-.1),'last same-tick frame applied'); }
  catch(error) { throw new Error(`${error}: ${JSON.stringify({control:driver.input.control,car:driver.state.world?.entities.find(entity=>entity.driver===driver.state.id),rejections:driver.input.rejections})}`); }
  assert.ok(!driver.input.rejections.some(item=>[a,b,c].includes(item.seq)),'scheduled frames were not rejected');

  // Explicit late/future, revision, epoch and order rejections are private.
  await until(()=>driver.input.tick>=5,'room advances before late-frame checks');
  const late=send(NEUTRAL,{targetTick:Math.max(1,driver.input.tick-4)});await waitReject(late,'late');
  const future=send(NEUTRAL,{targetTick:driver.input.tick+100});await waitReject(future,'future');
  const badRevision=send(NEUTRAL,{controlRevision:driver.input.control!.revision+1});await waitReject(badRevision,'revision');
  const badFence=send(NEUTRAL,{actionSeq:driver.input.lastActionSeq+1});await waitReject(badFence,'action');
  const wrongEpoch=send(NEUTRAL,{roomEpoch:'00000000-0000-0000-0000-000000000000'});await waitReject(wrongEpoch,'epoch');
  const correctEpoch=send(NEUTRAL,{seq:wrongEpoch});
  await until(()=>(driver.input.control?.appliedSeq??0)>=correctEpoch,'wrong epoch did not consume the input sequence');
  send(NEUTRAL,{seq:c});await waitReject(c,'order');
  assert.equal(observer.input.rejectionCount,0,'rejections are private to the sender');

  // An edge aimed at the last observed tick is late but within the grace
  // window locally. The server schedules it once at the next tick; repetition
  // of the same counter cannot trigger a second jump.
  const lateTarget=driver.input.tick;
  const jump=send({...NEUTRAL,jump:1},{targetTick:lateTarget});
  await waitReject(jump,'late');
  assert.equal(edge('jump',1,'rescheduled').length,1,'late press is acknowledged immediately');
  assert.ok(edge('jump',1,'rescheduled')[0].targetTick>lateTarget,'acknowledgement supplies the new target tick');
  assert.ok(timeline.findIndex(item=>item.type==='inputEdge'&&item.id===1&&item.status==='rescheduled')<
    timeline.findIndex(item=>item.type==='inputRejected'&&item.seq===jump),'edge acknowledgement precedes the level rejection');
  await until(()=>edge('jump',1,'processed').length===1,'near-late jump processed once');
  const repeat=send({...NEUTRAL,jump:1});
  await until(()=>(driver.input.control?.appliedSeq??0)>=repeat,'repeated counter frame applied');
  await delay(200);
  assert.equal(edge('jump',1,'processed').length,1);
  assert.equal(observer.input.edges.length,0,'edge outcomes are private');
  assert.equal(driver.state.world?.entities.find(entity=>entity.driver===driver.state.id)?.lastJump,1);
  const expired=send({...NEUTRAL,jump:2},{targetTick:driver.input.tick+100});
  await waitReject(expired,'future');
  await until(()=>edge('jump',2,'expired').length===1,'future jump expires');
  const repeatedExpired=send({...NEUTRAL,jump:2});
  await until(()=>(driver.input.control?.appliedSeq??0)>=repeatedExpired,'repeated expired counter frame applied');
  assert.equal(edge('jump',2,'processed').length,0,'expired edge cannot fire later');

  // The reset carries an unsampled press as its baseline. The server consumes
  // that baseline atomically, while newer presses can cross the old revision.
  const revision=driver.input.control!.revision;
  const pending=send({...NEUTRAL,steer:1},{targetTick:driver.input.tick+7});
  const resetAction=driver.input.action({type:'reset'},{jump:3,flip:0});
  const oldPress=send({...NEUTRAL,jump:3},{controlRevision:revision});
  await delay(25);
  const firstAfter=send({...NEUTRAL,jump:4,throttle:1},{controlRevision:revision});
  const rejectedReset=driver.input.action({type:'reset'});
  await delay(60);
  const secondAfter=send({...NEUTRAL,jump:5,throttle:1},{controlRevision:revision});
  driver.socket.send(JSON.stringify({type:'sync',token:17}));
  await until(()=>driver.state.sync===17&&driver.input.control!.revision>revision,'post-reset barrier and control revision');
  await waitReject(oldPress,'revision');
  await waitReject(firstAfter,'revision');await waitReject(secondAfter,'revision');
  assert.equal(rejectedReset,resetAction+1);
  assert.equal(driver.input.control!.revision,revision+1,'cooldown-rejected reset did not invalidate again');
  assert.equal(driver.input.control!.actionSeq,rejectedReset,'the rejected action still advances the fence');
  assert.ok(!driver.input.control!.queued.some(slot=>slot.seq===pending),'reset clears pending controls');
  assert.equal(edge('jump',3,'processed').length,0,'unsampled pre-action baseline cannot replay');
  for(const [seq,id] of [[firstAfter,4],[secondAfter,5]] as const){
    await until(()=>edge('jump',id,'processed').length===1,`post-reset press ${id} processed once`);
    const acknowledgement=timeline.findIndex(item=>item.type==='inputEdge'&&item.id===id&&(item.status==='accepted'||item.status==='rescheduled'));
    assert.ok(acknowledgement>=0&&acknowledgement<timeline.findIndex(item=>item.type==='inputRejected'&&item.seq===seq),'bridge acknowledgement precedes level rejection');
  }
  const repeatOldPress=send({...NEUTRAL,jump:5});
  await until(()=>(driver.input.control?.appliedSeq??0)>=repeatOldPress,'current-revision frame applied');
  await delay(100);
  assert.equal(edge('jump',4,'processed').length,1);assert.equal(edge('jump',5,'processed').length,1);
  const staleRevision=send(NEUTRAL,{controlRevision:revision});await waitReject(staleRevision,'revision');
  const before=driver.state.states;
  for(let token=100;token<120;token++)driver.socket.send(JSON.stringify({type:'sync',token}));
  await until(()=>driver.state.sync===119,'coalesced barriers');
  assert.ok(driver.state.states-before<10,'barriers do not force snapshots or ticks');

  await until(()=>driver.state.world?.entities.find(entity=>entity.driver===driver.state.id)?.supportId==='ground','post-action jump lands');

  // Autopilot changes control ownership, not pose. Two immediate attempts
  // also verify that the cooldown-rejected second action adds no revision.
  await delay(500);
  const beforeAutopilot=driver.input.control!.revision,poseBeforeAutopilot=driver.input.poseRevision;
  driver.input.action({type:'autopilot'});
  driver.input.action({type:'autopilot'});
  driver.socket.send(JSON.stringify({type:'sync',token:121}));
  await until(()=>driver.state.sync===121,'autopilot and cooldown barrier');
  assert.equal(driver.input.control!.revision,beforeAutopilot+1,'only successful autopilot invalidates controls');
  assert.equal(driver.input.poseRevision,poseBeforeAutopilot,'autopilot does not invalidate the pose');
  assert.equal(driver.state.world?.entities.find(entity=>entity.driver===driver.state.id)?.autopilot,true,'the immediate cooldown-rejected toggle did not undo autopilot');

  const beforeDome=driver.input.control!.revision,poseBeforeDome=driver.input.poseRevision;
  driver.input.action({type:'dome'});driver.socket.send(JSON.stringify({type:'sync',token:122}));
  await until(()=>driver.state.sync===122,'dome travel barrier');
  assert.equal(driver.input.control!.revision,beforeDome+1);
  assert.equal(driver.input.poseRevision,poseBeforeDome+1,'dome teleport changes pose and control revisions');
  assert.equal(driver.state.world?.entities.find(entity=>entity.driver===driver.state.id)?.inDome,true);

  // Dome entry starts on its fixed reset spawn. An idle reset at that exact
  // pose changes the control revision but is not a relocation.
  await delay(500);
  const beforeNoop=driver.input.control!.revision,poseBeforeNoop=driver.input.poseRevision;
  const entityBeforeNoop=structuredClone(driver.state.world!.entities.find(entity=>entity.driver===driver.state.id));
  driver.input.action({type:'reset'});driver.socket.send(JSON.stringify({type:'sync',token:123}));
  await until(()=>driver.state.sync===123,'idle dome reset barrier');
  assert.equal(driver.input.control!.revision,beforeNoop+1);
  assert.equal(driver.input.poseRevision,poseBeforeNoop,`same-pose reset preserves the pose revision: ${JSON.stringify({before:entityBeforeNoop,after:driver.state.world!.entities.find(entity=>entity.driver===driver.state.id)})}`);

  // Preserve barriers across mini-game entry and an action rejected by cooldown.
  driver.input.action({type:'minigame',game:'short'});driver.socket.send(JSON.stringify({type:'sync',token:124}));
  await until(()=>driver.state.sync===124&&!!driver.state.world?.races.rounds.some(round=>round.courseId==='short'&&round.entrants.some(entrant=>entrant.playerId===driver.state.id)),'barrier follows mini-game entry');
  await delay(500);
  driver.input.action({type:'reset'});
  driver.input.action({type:'destination',x:-120,z:60,mode:'road',requestId:42});driver.socket.send(JSON.stringify({type:'sync',token:125}));
  await until(()=>driver.state.sync===125&&driver.state.destinationResult?.requestId===42,'barrier follows rejected destination');
  assert.equal(driver.state.destinationResult!.ok,false,'action cooldown rejects the immediate destination request');

  // A reconnect is a new session with fresh controls, while the other player
  // keeps the room instance alive.
  const oldId=driver.state.id!,oldEpoch=driver.input.roomEpoch;
  driver.socket.close(1000,'reconnect test');
  await until(()=>driver.state.closed===1000&&!observer.state.world?.players.some(player=>player.id===oldId),'disconnected session removed');
  const again=connect();sockets.push(again.socket);
  await until(()=>again.input.active&&!!again.state.id,'new session joins');
  assert.notEqual(again.state.id,oldId);assert.equal(again.input.roomEpoch,oldEpoch);
  assert.equal(again.input.control!.receivedSeq,0);assert.equal(again.input.control!.appliedSeq,0);assert.equal(again.input.control!.revision,0);
  const first=again.input.send({...NEUTRAL,steer:1});
  await until(()=>again.input.control?.appliedSeq===first,'reconnected input applied');
  again.socket.close();await until(()=>again.state.closed!==undefined,'close reconnected client');

  const duplicate=connect();sockets.push(duplicate.socket);
  await until(()=>duplicate.input.active,'duplicate-action test client');
  duplicate.input.action({type:'reset'});
  await until(()=>duplicate.input.control?.actionSeq===1,'first action sequence recorded');
  duplicate.socket.send(JSON.stringify({type:'reset',actionSeq:1,edgeBaseline:{jump:0,flip:0}}));
  await until(()=>duplicate.state.closed===1008,'duplicate action sequence closes only that client');

  const backward=connect();sockets.push(backward.socket);
  await until(()=>backward.input.active,'backward-baseline test client');
  backward.input.send({...NEUTRAL,jump:1});
  await until(()=>backward.input.control?.jump.seen===1,'new jump counter observed');
  backward.socket.send(JSON.stringify({type:'reset',actionSeq:1,edgeBaseline:{jump:0,flip:0}}));
  await until(()=>backward.state.closed===1008,'backward action baseline closes only that client');
  console.log(`PASS: v${PROTOCOL_VERSION} owner-only tick controls, action fence and relocation-safe edge bridge, reset/cooldown ordering, rejection and invalid-action checks, coalesced sync and fresh reconnect. Local room protocol test, not a load or latency test.`);
}finally{for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();}
