import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, NEUTRAL, PROTOCOL_VERSION, setDestination, type World } from '../shared/game';
import { ScheduledInput, type ControlSnapshot } from '../shared/tick-input';
import { Session } from '../src/session';

class Socket {
  static OPEN=1;
  static last:Socket;
  readyState=Socket.OPEN;
  sent:any[]=[];
  onmessage?: (event:{data:string})=>void;
  onclose?: (event:{code:number})=>void;
  constructor(_url:string){Socket.last=this;}
  send(value:string){this.sent.push(JSON.parse(value));}
  close(){this.readyState=3;this.onclose?.({code:1000});}
  message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
Object.assign(globalThis,{WebSocket:Socket,window:globalThis,location:{protocol:'https:',host:'example.com'}});
const drive={...NEUTRAL,throttle:1,steer:.4};

function online(edges?:()=>{jump:number;flip:number}){
  let now=0;
  const session=new Session(()=>now,edges);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64,roomEpoch:'test',tick:0,poseRevision:0});
  const world=createWorld(),player=addPlayer(world,'p','Driver');
  world.entities=[world.entities.find(entity=>entity.id===player.entityId)!];world.pickups=[];
  const state=(value:World,tick:number,revision=0,poseRevision=0,sync?:number,confirmed?:ControlSnapshot)=>{
    const control=confirmed??new ScheduledInput(NEUTRAL).snapshot();control.revision=revision;
    socket.message({type:'state',world:structuredClone(value),roomEpoch:'test',tick,poseRevision,substeps:1,control,sync});
  };
  state(world,0);
  return {session,socket,world,state,advance:(ms:number)=>{now+=ms;}};
}

test('a new session stays empty until a completed room join',()=>{
  const session=new Session();assert.equal(session.status,'disconnected');
  assert.equal(session.world.players.length,0);session.tick(.1,drive);
  session.join('bay','Driver');assert.equal(session.status,'connecting');
  assert.equal(session.world.entities.length,0);session.disconnect();
  const joined=online();assert.equal(joined.session.status,'online');joined.session.disconnect();
});

test('an accepted reset consumes its atomic baseline but sends later presses without waiting for sync',()=>{
  const edges={jump:0,flip:0};
  const {session,socket,advance}=online(()=>({...edges}));
  const server=new ScheduledInput(NEUTRAL);
  session.tick(.05,NEUTRAL);socket.sent.length=0;
  edges.jump=1;session.queueEdge('jump',1);session.action('reset');
  assert.deepEqual(socket.sent,[{type:'reset',actionSeq:1,edgeBaseline:{jump:1,flip:0}},{type:'sync',token:1}]);
  assert.equal(server.beginAction(1,socket.sent[0].edgeBaseline),true);
  server.invalidate(NEUTRAL,{type:'action',edgeBaseline:socket.sent[0].edgeBaseline});
  edges.jump=2;session.queueEdge('jump',2);
  advance(25);session.tick(.025,{...NEUTRAL,jump:2});
  let command=socket.sent.at(-1);
  assert.equal(command.input.jump,1,'the actual earlier press remains ordered');
  assert.equal(command.actionSeq,1);assert.equal(server.receive(command,0,25).rejection,'revision');
  advance(25);session.tick(.025,{...NEUTRAL,jump:2});command=socket.sent.at(-1);
  assert.equal(command.input.jump,2);assert.equal(command.controlRevision,0);
  const result=server.receive(command,0,50);
  assert.equal(result.rejection,'revision');assert.ok(result.outcomes.some(event=>event.id===2&&event.status==='accepted'));
  assert.deepEqual(server.advance(command.targetTick,100).outcomes.filter(event=>event.kind==='jump').map(event=>event.id),[2]);
  advance(25);session.tick(.025,{...NEUTRAL,jump:2});
  if(socket.sent.at(-1).type==='input')assert.equal(server.receive(socket.sent.at(-1),command.targetTick,125).outcomes.length,0);
  session.disconnect();
});

test('a cooldown-rejected second action retains presses between actions',()=>{
  const edges={jump:0,flip:0};
  const {session,socket,advance}=online(()=>({...edges}));
  const server=new ScheduledInput(NEUTRAL);
  session.tick(.05,NEUTRAL);socket.sent.length=0;
  session.action('reset');const first=socket.sent[0];assert.equal(server.beginAction(first.actionSeq,first.edgeBaseline),true);
  server.invalidate(NEUTRAL,{type:'action',edgeBaseline:first.edgeBaseline});
  edges.jump=1;session.queueEdge('jump',1);advance(10);session.action('reset');
  const second=socket.sent.at(-2);assert.deepEqual(second.edgeBaseline,{jump:1,flip:0});
  assert.equal(server.beginAction(second.actionSeq,second.edgeBaseline),true); // gameplay rejects this reset
  edges.jump=2;session.queueEdge('jump',2);
  advance(20);session.tick(.03,{...NEUTRAL,jump:2});const firstInput=socket.sent.at(-1);
  advance(25);session.tick(.025,{...NEUTRAL,jump:2});const secondInput=socket.sent.at(-1);
  assert.deepEqual([firstInput.input.jump,secondInput.input.jump],[1,2]);
  assert.deepEqual([firstInput.actionSeq,secondInput.actionSeq],[2,2]);
  const one=server.receive(firstInput,0,30),two=server.receive(secondInput,0,55);
  assert.equal(one.rejection,'revision');assert.equal(two.rejection,'revision');
  const outcomes=[...server.advance(firstInput.targetTick,60).outcomes,...server.advance(firstInput.targetTick+1,110).outcomes];
  assert.deepEqual(outcomes.filter(event=>event.kind==='jump').map(event=>event.id),[1,2]);
  session.disconnect();
});

test('distinct presses are sent individually while a rejected action awaits its result',()=>{
  const edges={jump:0,flip:0};
  const {session,socket,advance}=online(()=>({...edges}));
  session.tick(.05,NEUTRAL);socket.sent.length=0;
  session.setDestination(180,-300);edges.flip=1;session.queueEdge('flip',1);edges.flip=2;session.queueEdge('flip',2);
  advance(25);session.tick(.025,{...NEUTRAL,flip:2});advance(25);session.tick(.025,{...NEUTRAL,flip:2});
  assert.deepEqual(socket.sent.filter(message=>message.type==='input').map(message=>message.input.flip),[1,2]);
  session.disconnect();
});

test('an action sends its atomic baseline even when snapshots have stalled',()=>{
  const edges={jump:1,flip:0};
  const {session,socket,advance}=online(()=>({...edges}));
  socket.sent.length=0;
  advance(800);session.action('reset');
  assert.deepEqual(socket.sent,[{type:'reset',actionSeq:1,edgeBaseline:{jump:1,flip:0}},{type:'sync',token:1}]);
  session.disconnect();
});

test('expired and overflowing unsent presses are counted and never replayed',()=>{
  const {session,socket,advance}=online();session.tick(.05,NEUTRAL);socket.sent.length=0;
  for(let id=1;id<=17;id++)session.queueEdge('jump',id);
  assert.equal(session.droppedInputEdges,1);
  advance(301);session.tick(.05,{...NEUTRAL,jump:17});
  assert.equal(session.droppedInputEdges,17);
  assert.equal(socket.sent.at(-1).input.jump,0);
  session.disconnect();
});

test('a spontaneous relocation discards presses captured before its snapshot',()=>{
  const {session,socket,world,state,advance}=online();
  session.tick(.05,NEUTRAL);session.queueEdge('jump',1);
  const control=new ScheduledInput(NEUTRAL).snapshot();control.revision=1;control.edgeFloorRevision=1;
  advance(50);state(world,1,1,1,undefined,control);socket.sent.length=0;
  session.tick(.05,{...NEUTRAL,jump:1});
  assert.equal(session.droppedInputEdges,1);assert.equal(socket.sent.at(-1).input.jump,0);
  session.queueEdge('jump',2);advance(25);session.tick(.025,{...NEUTRAL,jump:2});
  assert.equal(socket.sent.at(-1).input.jump,2,'a new press after relocation is still delivered');
  session.disconnect();
});

test('actions that cannot change control revision do not delay a new jump',()=>{
  const edges={jump:0,flip:0};
  const {session,socket,advance}=online(()=>({...edges}));
  session.tick(.05,NEUTRAL);socket.sent.length=0;
  session.buyUpgrade('motor');
  assert.deepEqual(socket.sent.map(message=>message.type),['upgrade','sync']);
  edges.jump=1;session.queueEdge('jump',1);advance(50);session.tick(.05,{...NEUTRAL,jump:1});
  assert.equal(socket.sent.at(-1).input.jump,1);
  session.disconnect();
});

test('every potentially invalidating control action carries a new fence',()=>{
  const {session,socket}=online();socket.sent.length=0;
  for(const type of ['interact','autopilot','dome','reset'] as const)session.action(type);
  assert.deepEqual(socket.sent.filter(message=>message.type!=='sync'),
    ['interact','autopilot','dome','reset'].map((type,index)=>({type,actionSeq:index+1,edgeBaseline:{jump:0,flip:0}})));
  session.disconnect();
});

test('a rejected action keeps motion visible while its ordered result arrives',()=>{
  const {session,socket,world,state,advance}=online();
  session.tick(.05,drive);assert.notEqual(session.renderWorld(),session.world);
  const requestId=session.setDestination(180,-300);
  assert.deepEqual(socket.sent.slice(-2),[{type:'destination',x:180,z:-300,requestId,actionSeq:1,edgeBaseline:{jump:0,flip:0}},{type:'sync',token:1}]);
  assert.notEqual(session.renderWorld(),session.world,'the barrier alone does not rewind motion');
  socket.message({type:'destinationResult',requestId,ok:false});advance(100);state(world,2,0,0,1);
  assert.deepEqual(session.destinationResult,{type:'destinationResult',requestId,ok:false});
  assert.equal(session.takeCameraSnap(),false,'a rejected action is not a relocation');
  session.disconnect();
});

test('an accepted destination changes the control generation without cutting the camera',()=>{
  const {session,socket,world,state,advance}=online();
  const requestId=session.setDestination(-180,60);
  socket.message({type:'destinationResult',requestId,ok:true});
  const navigated=structuredClone(world);assert.equal(setDestination(navigated,'p',{x:-180,z:60}),true);
  advance(100);state(navigated,2,1,0,1);
  assert.equal(session.world.entities[0].autopilot,true);assert.equal(session.takeCameraSnap(),false);
  session.tick(.05,drive);
  const input=socket.sent.filter(message=>message.type==='input').at(-1);
  assert.equal(input.controlRevision,1,'new input is tied to the confirmed generation');
  session.disconnect();
});

test('a mini-game relocation cuts the camera when confirmed by authority',()=>{
  const {session,socket,world,state,advance}=online();
  session.tick(.05,drive);session.enterMinigame('short');
  assert.deepEqual(socket.sent.slice(-2),[{type:'minigame',game:'short',actionSeq:1,edgeBaseline:{jump:0,flip:0}},{type:'sync',token:1}]);
  assert.equal(session.takeCameraSnap(),false,'the request alone does not cut');
  const entered=structuredClone(world);assert.equal(enterMinigame(entered,'p','short'),true);
  advance(100);state(entered,2,1,1,1);
  assert.deepEqual(session.world.races.rounds,entered.races.rounds);
  assert.equal(session.takeCameraSnap(),true);session.disconnect();
});
