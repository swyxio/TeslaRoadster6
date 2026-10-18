import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE } from '../shared/game';
import { DEFAULT_ROOM, Session, validRoom } from '../src/session';

class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = Socket.OPEN;
  sent: string[] = [];
  onmessage?: (event: {data:string}) => void;
  onclose?: (event: {code:number}) => void;
  onerror?: () => void;
  constructor(public url:string) { Socket.last = this; }
  send(value:string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  message(value:unknown) { this.onmessage?.({data:JSON.stringify(value)}); }
  closed(code=1000) { this.readyState = 3; this.onclose?.({code}); }
}
Object.assign(globalThis, { WebSocket:Socket, window:globalThis, location:{protocol:'https:',host:'example.com'} });

test('a shared room connects and a disconnect never starts a solo simulation',()=>{
  assert.equal(DEFAULT_ROOM,'bay'); assert.ok(validRoom('friends-2')); assert.ok(!validRoom('../bay'));
  const session=new Session();session.join(DEFAULT_ROOM,'Alex');const socket=Socket.last;
  assert.equal(socket.url,'wss://example.com/api/room/bay');
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  assert.equal(session.status,'online');assert.equal(session.id,'p');
  session.tick(.05,NEUTRAL);assert.equal(JSON.parse(socket.sent.at(-1)!).type,'input');
  socket.closed();assert.equal(session.status,'disconnected');const time=session.world.time;
  session.tick(1,{...NEUTRAL,throttle:1});assert.equal(session.world.time,time);
  session.solo('model-3','Alex');assert.equal(session.status,'solo');
  session.tick(.1,NEUTRAL);assert.ok(session.world.time>0);
});

test('full rooms are distinct and stale sockets cannot overwrite a new session',()=>{
  const session=new Session();session.join('bay','Driver');const old=Socket.last;
  old.onerror?.();old.closed(ROOM_FULL_CODE);
  assert.equal(session.status,'disconnected');assert.equal(session.roomFull,true);assert.match(session.error,/full/i);
  session.join('another-room','Driver');const current=Socket.last;
  old.message({type:'welcome',id:'stale',version:PROTOCOL_VERSION,capacity:64});old.closed();old.onerror?.();
  assert.equal(session.status,'connecting');assert.equal(session.id,'');assert.equal(session.error,'');
  current.closed();assert.equal(session.status,'disconnected');
});

test('a blocked spawn reports a retryable error rather than a full room or solo mode',()=>{
  const session=new Session();session.join('bay','Driver');const socket=Socket.last;
  socket.onerror?.();socket.closed(ROOM_NO_SPAWN_CODE);
  assert.equal(session.status,'disconnected');assert.equal(session.roomFull,false);
  assert.match(session.error,/no safe starting space/i);
  session.join('bay','Driver');assert.equal(session.status,'connecting');assert.equal(session.error,'');
  Socket.last.closed();
});

test('joining the current room keeps its seat and may select a car',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:2});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});const existingWorld=session.world;
  const sentBefore=socket.sent.length;
  session.join('bay','Alex');
  assert.equal(socket.sent.length,sentBefore+1);
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'name',name:'Alex'});
  session.join('bay','Alex','model-3');
  assert.equal(Socket.last,socket);assert.equal(socket.readyState,Socket.OPEN);assert.equal(session.world,existingWorld);assert.equal(session.id,'p');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3'});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.closed();
});

test('offline navigation requests fail without starting a local session',()=>{
  const session=new Session(), requestId=session.setDestination(-180,60);
  assert.deepEqual(session.destinationResult,{requestId,ok:false});
  assert.equal(session.world.players.length,0);
});

test('solo is explicit, advances locally and ignores an old room socket',()=>{
  const session=new Session();session.join('bay','Alex');const old=Socket.last;
  session.solo('model-3','Scout');
  assert.equal(session.status,'solo');assert.equal(session.room,'');
  assert.equal(session.world.players[0].name,'Scout');
  assert.equal(session.world.entities.find(entity=>entity.driver==='local')?.kind,'model-3');
  session.tick(.1,NEUTRAL);assert.ok(session.world.time>0);
  old.message({type:'welcome',id:'stale',version:PROTOCOL_VERSION,capacity:64});old.closed();
  assert.equal(session.status,'solo');assert.equal(session.id,'local');
  const id=session.setDestination(-180,60);
  assert.deepEqual(session.destinationResult,{requestId:id,ok:true});
});

test('a displayed Tesla can be requested again after taking a same-kind street car',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld(),player=addPlayer(world,'p','Alex');
  const borrowed=world.entities.find(entity=>entity.id===player.entityId)!;
  borrowed.owner=null;world.entities=[borrowed];world.pickups=[];
  socket.message({type:'state',world,inputAck:0});
  session.join('bay','Alex','roadster');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'roadster'});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.message({type:'state',world,inputAck:0});assert.equal(session.vehicleResult,null);
  const accepted=structuredClone(world);assert.equal(chooseVehicle(accepted,'p','roadster'),true);
  socket.message({type:'state',world:accepted,inputAck:0,sync:1});
  assert.deepEqual(session.vehicleResult,{kind:'roadster',ok:true});
  assert.notEqual(accepted.players[0].entityId,borrowed.id);
  socket.closed();
});

test('a rejected vehicle change stays unconfirmed until its ordered state and reports failure',()=>{
  for(const condition of ['moving','ferry'] as const){
    const session=new Session();session.join('bay','Alex');const socket=Socket.last;
    socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
    const world=createWorld(),player=addPlayer(world,'p','Alex'),car=world.entities.find(entity=>entity.id===player.entityId)!;
    world.entities=[car];world.pickups=[];
    if(condition==='moving')car.speed=4;else car.supportId='ferry';
    socket.message({type:'state',world,inputAck:0});
    session.selectVehicle('model-3');
    assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3'});
    assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
    assert.equal(chooseVehicle(world,'p','model-3'),false);
    socket.message({type:'state',world,inputAck:0,sync:0});assert.equal(session.vehicleResult,null);
    socket.message({type:'state',world,inputAck:0,sync:1});
    assert.deepEqual(session.vehicleResult,{kind:'model-3',ok:false},condition);
    assert.equal(session.world.players[0].entityId,car.id);
    socket.closed();
  }
});
