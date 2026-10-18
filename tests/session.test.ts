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

test('switching from a room to solo keeps a playable local world and ignores old socket events',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const online=createWorld();addPlayer(online,'p','Alex');socket.message({type:'state',world:online});
  session.solo('model-3','Solo Alex');
  assert.equal(session.status,'solo');assert.equal(session.room,'');assert.equal(socket.readyState,3);
  const player=session.world.players.find(p=>p.id===session.id)!;
  const car=session.world.entities.find(e=>e.id===player.entityId)!;
  assert.equal(player.name,'Solo Alex');assert.equal(car.kind,'model-3');
  socket.message({type:'state',world:online});socket.closed();
  assert.equal(session.status,'solo');assert.equal(session.world.players[0].id,'local');
  session.tick(.05,NEUTRAL);assert.ok(session.world.time>0);
  session.setName('Renamed');assert.equal(player.name,'Renamed');
  session.action('dome');assert.ok(car.inDome);
  assert.equal(session.parkingAction('leave'),true);
  const requestId=session.setOta(true);assert.deepEqual(session.otaResult,{requestId,enabled:true,ok:true});
  session.join('friends','Solo Alex');assert.equal(session.status,'connecting');assert.equal(session.world.players.length,0);
  Socket.last.closed();
});

test('a full-room error can be followed by an explicit solo drive',()=>{
  const session=new Session();session.join('bay','Driver');const socket=Socket.last;
  socket.closed(ROOM_FULL_CODE);assert.equal(session.roomFull,true);
  session.solo();assert.equal(session.status,'solo');assert.equal(session.roomFull,false);assert.equal(session.error,'');
  assert.equal(session.world.players.length,1);
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

test('offline navigation requests fail without starting a local session',()=>{
  const session=new Session(), requestId=session.setDestination(-180,60);
  assert.deepEqual(session.destinationResult,{requestId,ok:false});
  assert.equal(session.world.players.length,0);
});

test('solo mini-game requests use the local simulation',()=>{
  const session=new Session();session.solo('model-3','Scout');
  assert.equal(session.enterMinigame('park'),true);
  assert.ok(session.world.parking.rounds.some(round=>round.mode==='park'&&round.entrants.some(entry=>entry.playerId===session.id)));
  assert.equal(session.parkingAction('leave'),true);
  assert.equal(session.enterMinigame('oval'),true);
  assert.ok(session.world.races.rounds.some(round=>round.courseId==='oval'&&round.entrants.some(entry=>entry.playerId===session.id)));
});

test('online destination and mini-game requests use the current socket',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world});
  const requestId=session.setDestination(-180,60);
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'destination',x:-180,z:60,requestId});
  socket.message({type:'destinationResult',requestId,ok:true});
  assert.equal(session.destinationResult?.requestId,requestId);assert.equal(session.destinationResult?.ok,true);
  session.enterMinigame('park');assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'minigame',game:'park'});
  session.solo();assert.equal(session.destinationResult,null);
  socket.message({type:'destinationResult',requestId,ok:true});assert.equal(session.destinationResult,null);
});
