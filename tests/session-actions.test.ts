import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, NEUTRAL, PROTOCOL_VERSION, setDestination, type World } from '../shared/game';
import { Session } from '../src/session';

class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = Socket.OPEN;
  sent: unknown[] = [];
  onmessage?: (event: {data:string}) => void;
  onclose?: (event: {code:number}) => void;
  onerror?: () => void;
  constructor(_url:string) { Socket.last = this; }
  send(value:string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.onclose?.({code:1000}); }
  message(value:unknown) { this.onmessage?.({data:JSON.stringify(value)}); }
}
Object.assign(globalThis, { WebSocket:Socket, window:globalThis, location:{protocol:'https:',host:'example.com'} });

const drive = {...NEUTRAL, throttle:1, steer:.4};

function online() {
  const session = new Session();
  session.join('bay','Driver');
  const socket = Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world = createWorld(), player = addPlayer(world,'p','Driver');
  world.entities = [world.entities.find(entity => entity.id === player.entityId)!];
  world.pickups = [];
  state(socket,world,0);
  return {session,socket,world};
}

function state(socket:Socket,world:World,inputAck:number,sync?:number) {
  socket.message({type:'state',world:structuredClone(world),inputAck,...(sync === undefined ? {} : {sync})});
}

test('a finish purchase waits for the room result and post-action snapshot',()=>{
  const {session,socket,world}=online();
  const requestId=session.buyVehicleStyle({category:'paint',choice:'violet'});
  assert.deepEqual(socket.sent.slice(-2),[
    {type:'vehicleStyle',category:'paint',choice:'violet',requestId},{type:'sync',token:1}
  ]);
  assert.equal(session.vehicleStyleResult,null);
  socket.message({type:'vehicleStyleResult',requestId,category:'paint',choice:'violet',ok:true});
  assert.deepEqual(session.vehicleStyleResult,{type:'vehicleStyleResult',requestId,category:'paint',choice:'violet',ok:true});
  assert.equal(session.renderWorld(),session.world,'the acknowledgement alone does not release prediction');
  state(socket,world,0,1);
  session.disconnect();
});

test('a new session stays empty until a completed room join',()=>{
  const session = new Session();
  assert.equal(session.status,'disconnected');
  assert.equal(session.id,'');
  assert.equal(session.world.players.length,0);
  assert.equal(session.world.entities.length,0);
  const time = session.world.time;
  session.tick(.1,drive);
  assert.equal(session.world.time,time);
  session.join('bay','Driver');
  assert.equal(session.status,'connecting');
  assert.equal(session.world.players.length,0);
  session.tick(.1,drive);
  assert.equal(session.world.time,time);
  assert.equal(session.world.entities.length,0);
  session.disconnect();
  const joined=online();
  assert.equal(joined.session.status,'online');
  assert.equal(joined.session.id,'p');
  joined.session.disconnect();
});

test('rejected destinations wait for the matching post-action snapshot before predicting again',()=>{
  const {session,socket,world} = online();
  session.tick(.05,drive);
  assert.notEqual(session.renderWorld(),session.world,'driving predicts before an action');
  const requestId = session.setDestination(180,-300);
  assert.deepEqual(socket.sent.slice(-2),[
    {type:'destination',x:180,z:-300,requestId}, {type:'sync',token:1}
  ]);
  assert.equal(session.renderWorld(),session.world,'action immediately suspends prediction');
  session.tick(.05,drive);
  socket.message({type:'destinationResult',requestId,ok:false});
  assert.deepEqual(session.destinationResult,{type:'destinationResult',requestId,ok:false});
  assert.equal(session.renderWorld(),session.world,'a result alone is not a snapshot barrier');
  state(socket,world,1);
  assert.equal(session.renderWorld(),session.world,'an ordinary snapshot is not a barrier');
  state(socket,world,1,0);
  assert.equal(session.renderWorld(),session.world,'an older barrier is not sufficient');
  state(socket,world,1,1);
  assert.notEqual(session.renderWorld(),session.world,'the rejected action resumes prediction after its barrier');
  session.disconnect();
});

test('an accepted destination respects autopilot after its barrier and predicts again after manual takeover',()=>{
  const {session,socket,world} = online();
  const requestId = session.setDestination(-180,60);
  assert.deepEqual(socket.sent.slice(-2),[
    {type:'destination',x:-180,z:60,requestId}, {type:'sync',token:1}
  ]);
  session.tick(.05,drive);
  socket.message({type:'destinationResult',requestId,ok:true});
  assert.equal(session.renderWorld(),session.world);
  const navigated=structuredClone(world);
  assert.equal(setDestination(navigated,'p',{x:-180,z:60}),true);
  state(socket,navigated,0,1);
  assert.equal(session.renderWorld(),session.world,'autopilot remains authoritative');
  const manual=structuredClone(navigated);
  Object.assign(manual.entities[0],{autopilot:false,navigation:null});
  state(socket,manual,1);
  session.tick(.05,drive);
  assert.notEqual(session.renderWorld(),session.world,'manual driving can predict after the server confirms takeover');
  session.disconnect();
});

test('mini-game barriers follow actions and keep prediction suspended until the latest state',()=>{
  const {session,socket,world} = online();
  session.tick(.05,drive);
  assert.notEqual(session.renderWorld(),session.world);
  session.enterMinigame('short');
  assert.deepEqual(socket.sent.slice(-2),[{type:'minigame',game:'short'},{type:'sync',token:1}]);
  assert.equal(session.renderWorld(),session.world);
  session.enterMinigame('oval');
  assert.deepEqual(socket.sent.slice(-2),[{type:'minigame',game:'oval'},{type:'sync',token:2}]);
  session.tick(.05,drive);
  const entered=structuredClone(world);
  assert.equal(enterMinigame(entered,'p','short'),true);
  assert.equal(enterMinigame(entered,'p','oval'),false,'a second game cannot replace an active one');
  state(socket,entered,1,1);
  assert.equal(session.renderWorld(),session.world,'the first barrier cannot release the second action');
  state(socket,entered,1,2);
  assert.deepEqual(session.world.races.rounds,entered.races.rounds,'the authoritative accepted game is retained');
  session.tick(.05,drive);
  assert.notEqual(session.renderWorld(),session.world,'prediction recovers after the latest barrier');
  session.disconnect();
});
