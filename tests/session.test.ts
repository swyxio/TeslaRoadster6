import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE } from '../shared/game';
import { DEFAULT_ROOM, Session, validRoom } from '../src/session';

class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = Socket.OPEN;
  sent: string[] = [];
  onmessage?: (event: {data:string}) => void;
  onclose?: (event: {code:number}) => void;
  onerror?: () => void;
  constructor(public url: string) { Socket.last = this; }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  message(value: unknown) { this.onmessage?.({data:JSON.stringify(value)}); }
  closed(code = 1000) { this.readyState = 3; this.onclose?.({code}); }
}
Object.assign(globalThis, { WebSocket: Socket, window: globalThis, location: {protocol:'https:',host:'example.com'} });

test('sessions join a room and never simulate a local player while disconnected',()=>{
  assert.equal(DEFAULT_ROOM,'bay');
  assert.ok(validRoom('bay')); assert.ok(validRoom('friends-2')); assert.ok(!validRoom('../bay'));
  const session = new Session();
  assert.equal(session.status,'disconnected'); assert.equal(session.world.players.length,0);
  const requestId = session.buyUpgrade('rocket');
  assert.deepEqual(session.upgradeResult,{requestId,upgrade:'rocket',ok:false});
  session.tick(1,NEUTRAL); assert.equal(session.world.time,0);
  session.join(DEFAULT_ROOM,'Alex'); const socket=Socket.last;
  assert.equal(socket.url,'wss://example.com/api/room/bay');
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld(); addPlayer(world,'p','Alex'); socket.message({type:'state',world});
  assert.equal(session.status,'online'); assert.equal(session.id,'p');
  session.tick(.05,NEUTRAL);
  assert.equal(JSON.parse(socket.sent[0]).type,'name'); assert.equal(JSON.parse(socket.sent[1]).type,'input');
  socket.closed(); assert.equal(session.status,'disconnected');
  assert.match(session.error,/room disconnected/i);
});

test('full rooms report a distinct error and old sockets cannot replace the new session',()=>{
  const session=new Session();session.join('bay','Driver');const old=Socket.last;
  old.onerror?.();old.closed(ROOM_FULL_CODE);
  assert.equal(session.status,'disconnected');assert.equal(session.roomFull,true);assert.match(session.error,/full/i);
  session.join('another-room','Driver');const current=Socket.last;
  old.message({type:'welcome',id:'stale',version:PROTOCOL_VERSION,capacity:64});
  old.closed(1000);
  assert.equal(session.status,'connecting');assert.equal(session.id,'');assert.equal(session.roomFull,false);
  current.closed();assert.equal(session.status,'disconnected');
});

test('joining the current room keeps the occupied seat and current ride',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:2});
  const world=createWorld();const player=addPlayer(world,'p','Alex');
  world.entities.find(entity=>entity.id===player.entityId)!.kind='zoox';
  socket.message({type:'state',world});const existingWorld=session.world;
  session.join('bay','Alex','model-3');
  assert.equal(Socket.last,socket);assert.equal(socket.readyState,Socket.OPEN);
  assert.equal(session.world,existingWorld);assert.equal(session.id,'p');
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'name',name:'Alex'});
  assert.ok(!socket.sent.some(message=>JSON.parse(message).type==='selectVehicle'));
  socket.closed();
});
