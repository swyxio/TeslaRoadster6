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
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'identity',code:null,requestId:1},'guest choice follows welcome');
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  assert.equal(session.status,'online');assert.equal(session.id,'p');
  session.tick(.05,NEUTRAL);assert.equal(JSON.parse(socket.sent.at(-1)!).type,'input');
  socket.closed();assert.equal(session.status,'disconnected');const time=session.world.time;
  session.tick(1,{...NEUTRAL,throttle:1});assert.equal(session.world.time,time);
});

test('a guest sends its decision before the starting vehicle request',()=>{
  const session=new Session();session.join('bay','Guest','model-3');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  assert.deepEqual(socket.sent.slice(-3).map(value=>JSON.parse(value)),[
    {type:'identity',code:null,requestId:1},{type:'selectVehicle',kind:'model-3'},{type:'sync',token:1},
  ]);
  session.disconnect();
});

test('input cadence keeps fractional frame time without catching up in a burst',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  for(let frame=0;frame<120;frame++)session.tick(1/60,NEUTRAL);
  const inputs=socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input');
  assert.ok(inputs.length>=39&&inputs.length<=40,`expected approximately 40 sends, got ${inputs.length}`);
  assert.deepEqual(inputs.map(value=>value.seq),inputs.map((_,index)=>index+1));
  session.tick(1,NEUTRAL);
  assert.equal(socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input').length,inputs.length+1);
  session.disconnect();
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

test('online Mars actions use an ordered sync barrier and clear stale results on a new drive',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  const requestId=session.mars();
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'mars',action:'board',requestId});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.message({type:'marsResult',requestId,action:'board',ok:true});
  assert.equal(session.marsResult?.ok,true);
  session.join('friends','Alex');assert.equal(session.marsResult,null);
  socket.message({type:'marsResult',requestId,action:'board',ok:true});assert.equal(session.marsResult,null);
  session.disconnect();
});

test('identity replies match the latest request and recovery is replayed on rejoin',()=>{
  const session=new Session(),first=session.setIdentity('first-code');
  session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'identity',code:'first-code',requestId:first});
  const second=session.setIdentity('second-code');
  socket.message({type:'identityResult',requestId:first,ok:true,message:'old'});
  assert.equal(session.identityResult,null);
  const cancelled=session.setIdentity();
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'identity',code:null,requestId:cancelled});
  socket.message({type:'identityResult',requestId:second,ok:true,message:'superseded'});
  assert.equal(session.identityResult,null);
  const latest=session.setIdentity('second-code');
  socket.message({type:'identityResult',requestId:latest,ok:true,message:'bound'});
  assert.equal(session.identityResult?.message,'bound');
  session.join('friends','Alex');const next=Socket.last;
  next.message({type:'welcome',id:'q',version:PROTOCOL_VERSION,capacity:64});
  assert.deepEqual(JSON.parse(next.sent.at(-1)!),{type:'identity',code:'second-code',requestId:latest});
  session.disconnect();
});

test('identity confirmation captures its wallet baseline before later snapshots or earnings',()=>{
  const session=new Session(),requestId=session.setIdentity('saved-code');
  session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  socket.message({type:'wallet',level:2,eligibleIncome:200_000,cash:55_000,earned:200_000,unlocked:[],ownedLuxury:[]});
  socket.message({type:'identityResult',requestId,ok:true,message:'Saved driver connected.'});
  socket.message({type:'wallet',level:3,eligibleIncome:260_000,cash:260_000,earned:260_000,unlocked:[],ownedLuxury:[]});
  socket.message({type:'state',world,inputAck:0});
  assert.deepEqual(session.identityResult?.levelBaseline,{level:2,eligibleIncome:200_000,afterSnapshot:1});
  assert.equal(session.snapshotVersion,2);
  session.disconnect();
});

test('a saved driver cannot drive or spend until recovery and its following snapshot',()=>{
  const session=new Session(),requestId=session.setIdentity('saved-code');
  session.join('bay','Alex','model-3');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  socket.message({type:'wallet',level:0,eligibleIncome:0,cash:2_500,earned:0,unlocked:[],ownedLuxury:[]});
  assert.equal(session.walletStatus,'connecting');assert.equal(session.walletBlocked,true);
  const before=socket.sent.length;
  session.tick(.1,{...NEUTRAL,throttle:1});session.buyUpgrade('rocket');session.luxury('buy','ducati-panigale-v4');session.setOta(true);
  assert.equal(socket.sent.length,before,'guest input and purchases are not sent');
  socket.message({type:'wallet',level:8,eligibleIncome:14_000_000,cash:14_000_000,earned:14_000_000,unlocked:['luxury-visit'],ownedLuxury:[]});
  socket.message({type:'identityResult',requestId,ok:true,message:'Saved driver connected.'});
  assert.equal(session.walletStatus,'syncing');session.tick(.1,{...NEUTRAL,throttle:1});
  assert.equal(socket.sent.length,before,'identity reply alone does not expose the guest snapshot');
  world.players[0].delivery.cash=14_000_000;world.players[0].delivery.level=8;
  socket.message({type:'state',world,inputAck:0});
  assert.equal(session.walletStatus,'ready');assert.equal(session.walletBlocked,false);
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3'},'starting ride is requested after recovery');
  session.tick(.1,{...NEUTRAL,throttle:1});assert.equal(JSON.parse(socket.sent.at(-1)!).type,'input');
  session.disconnect();
});

test('a failed saved-driver lookup stays blocked until a deliberate guest rejoin',()=>{
  const session=new Session(),requestId=session.setIdentity('bad-code');
  session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  socket.message({type:'identityResult',requestId,ok:false,message:'Invalid recovery code.'});
  assert.equal(session.walletStatus,'failed');assert.match(session.walletError,/Invalid recovery/);
  const before=socket.sent.length;session.tick(.1,{...NEUTRAL,throttle:1});session.buyUpgrade('rocket');
  assert.equal(socket.sent.length,before);
  session.setIdentity();assert.equal(session.walletBlocked,true,'selecting guest requires a new room session');
  session.disconnect();session.join('bay','Guest');const guest=Socket.last;
  guest.message({type:'welcome',id:'g',version:PROTOCOL_VERSION,capacity:64});
  const guestWorld=createWorld();addPlayer(guestWorld,'g','Guest');guest.message({type:'state',world:guestWorld,inputAck:0});
  assert.equal(session.walletStatus,'guest');assert.equal(session.walletBlocked,false);
  session.tick(.1,{...NEUTRAL,throttle:1});assert.equal(JSON.parse(guest.sent.at(-1)!).type,'input');
  session.disconnect();
});

test('a timed-out recovery never becomes playable on a late success',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const session=new Session(),requestId=session.setIdentity('slow-code');
  session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  t.mock.timers.tick(15_000);
  assert.equal(session.walletStatus,'failed');assert.match(session.walletError,/taking too long/);
  assert.equal(socket.readyState,3,'the timed-out room is closed before a late recovery can start playing');
  socket.message({type:'identityResult',requestId,ok:true,message:'late'});socket.message({type:'state',world,inputAck:0});
  assert.equal(session.walletBlocked,true);assert.equal(session.walletStatus,'failed');
  session.disconnect();
});

test('online destination and mini-game requests use ordered barriers and ignore stale results',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  const requestId=session.setDestination(-180,60);
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'destination',x:-180,z:60,requestId});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.message({type:'destinationResult',requestId,ok:true});
  assert.equal(session.destinationResult?.requestId,requestId);assert.equal(session.destinationResult?.ok,true);
  session.enterMinigame('park');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'minigame',game:'park'});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:2});
  session.join('friends','Alex');assert.equal(session.destinationResult,null);
  socket.message({type:'destinationResult',requestId,ok:true});assert.equal(session.destinationResult,null);
  session.disconnect();
});
