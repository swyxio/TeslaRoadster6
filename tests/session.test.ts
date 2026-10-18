import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, ROOM_NO_SPAWN_CODE } from '../shared/game';
import { DEFAULT_ROOM, Session, validRoom } from '../src/session';
import { ScheduledInput } from '../shared/tick-input';
import { connectDriverWallet, stageDriverRecovery, DRIVER_PENDING_KEY, DRIVER_RECOVERY_KEY } from '../src/driver-recovery';
import { normalizeAchievementTiers } from '../shared/achievement-tiers';
import { emptyVehicleCollections } from '../shared/vehicle-collections';

class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = Socket.OPEN;
  sent: string[] = [];
  onmessage?: (event: {data:string}) => void;
  onclose?: (event: {code:number;reason:string}) => void;
  onerror?: () => void;
  constructor(public url:string) { Socket.last = this; }
  send(value:string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  message(value:unknown) {
    const message=value as Record<string,unknown>;
    const defaults=message.type==='wallet'?{achievementTiers:normalizeAchievementTiers(undefined,0,[]),vehicleCollections:emptyVehicleCollections()}:
      message.type==='welcome'?{roomEpoch:'test-room',tick:0,poseRevision:0}:
      message.type==='state'?{roomEpoch:'test-room',tick:0,poseRevision:0,substeps:1,control:new ScheduledInput(NEUTRAL).snapshot()}:{};
    this.onmessage?.({data:JSON.stringify({...defaults,...message})});
  }
  closed(code=1000,reason='') { this.readyState = 3; this.onclose?.({code,reason}); }
}
Object.assign(globalThis, { WebSocket:Socket, window:globalThis, location:{protocol:'https:',host:'example.com'} });

test('committed reward messages queue in order without crossing identity changes',()=>{
  const session=new Session();session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:8});
  const world=createWorld();addPlayer(world,'p','Driver');socket.message({type:'state',world});
  const delivery={id:1,kind:'delivery-research' as const,amount:800},research={id:2,kind:'research' as const,amount:250};
  socket.message({type:'reward',reward:delivery});socket.message({type:'reward',reward:research});
  socket.message({type:'reward',reward:delivery});
  world.players[0].delivery.lastReward=research;
  socket.message({type:'state',world,tick:1});
  assert.deepEqual(session.takeRewards(),[delivery,research]);assert.deepEqual(session.takeRewards(),[]);
  socket.message({type:'reward',reward:{id:3,kind:'pickup',amount:100}});
  const requestId=session.setIdentity('recovery-code');
  socket.message({type:'reward',reward:{id:4,kind:'research',amount:250}});
  assert.deepEqual(session.takeRewards(),[],'rewards wait until binding is resolved');
  socket.message({type:'identityResult',requestId,ok:true,message:'Saved driver connected.'});
  socket.message({type:'state',world,tick:2});
  assert.deepEqual(session.takeRewards(),[{id:4,kind:'research',amount:250}], 'an in-flight reward for the same driver is preserved');
  session.disconnect();
});

test('owner wallet rejects malformed vehicle collections',()=>{
  const session=new Session();session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'wallet',vehicleCollections:{driven:['roadster'],stolen:[]}});
  assert.deepEqual(session.wallet?.vehicleCollections,{driven:['roadster'],stolen:[]});
  const log=console.error;console.error=()=>{};
  try{socket.message({type:'wallet',vehicleCollections:{driven:['bad-model'],stolen:[]}});}finally{console.error=log;}
  assert.equal(socket.readyState,3);assert.equal(session.error,'Invalid server message. Please reconnect.');
  session.disconnect();
});

test('owner wallet accepts valid tier progress and rejects malformed progress',()=>{
  const session=new Session();session.join('bay','Driver');const socket=Socket.last;
  const tiers=normalizeAchievementTiers(undefined,0,[]);
  socket.message({type:'wallet',achievementTiers:tiers});
  assert.deepEqual(session.wallet?.achievementTiers,tiers);
  const log=console.error;console.error=()=>{};
  try{socket.message({type:'wallet',achievementTiers:{deliveries:{count:-1,claimed:0}}});}finally{console.error=log;}
  assert.equal(socket.readyState,3);
  assert.equal(session.error,'Invalid server message. Please reconnect.');
  assert.deepEqual(session.wallet?.achievementTiers,tiers);
  session.disconnect();
});

test('an incompatible protocol closes before identity or driving',()=>{
  assert.equal(PROTOCOL_VERSION,47);
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:46,capacity:64});
  assert.equal(socket.readyState,3);
  assert.equal(session.error,'Game updated. Reload to reconnect.');
  assert.deepEqual(socket.sent,[]);
  assert.equal(session.id,'');
  session.disconnect();
});

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
    {type:'identity',code:null,requestId:1},{type:'selectVehicle',kind:'model-3',actionSeq:1,edgeBaseline:{jump:0,flip:0}},{type:'sync',token:1},
  ]);
  session.disconnect();
});

test('a failed award save is explained on disconnect',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:8});
  socket.closed(1011,'Award could not be saved. Rejoin.');
  assert.equal(session.error,'Award could not be saved. Rejoin.');
  assert.equal(session.status,'disconnected');
});

test('input cadence keeps fractional frame time without catching up in a burst',()=>{
  let now=0;
  const session=new Session(()=>now);session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  for(let frame=0;frame<120;frame++){
    now=frame*1000/60;
    if(frame%6===0)socket.message({type:'state',world,tick:frame/3});
    session.tick(1/60,NEUTRAL);
  }
  const inputs=socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input');
  assert.ok(inputs.length>=39&&inputs.length<=41,`expected approximately 40 sends plus an initial sample, got ${inputs.length}`);
  assert.deepEqual(inputs.map(value=>value.seq),inputs.map((_,index)=>index+1));
  now+=1000;socket.message({type:'state',world,tick:60});session.tick(1,NEUTRAL);
  assert.equal(socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input').length,inputs.length+1);
  session.disconnect();
});

test('rejected inputs retry on the normal cadence while changes and presses remain prompt',()=>{
  let now=0;
  const session=new Session(()=>now);session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world});
  session.tick(.05,NEUTRAL);
  const inputs=()=>socket.sent.map(value=>JSON.parse(value)).filter(value=>value.type==='input');
  const rejected=inputs().at(-1)!;
  socket.message({type:'inputRejected',seq:rejected.seq,targetTick:rejected.targetTick,reason:'late'});
  now=20;session.tick(.02,NEUTRAL);
  assert.equal(inputs().length,1,'a late rejection does not force an early unchanged retry');
  now=50;session.tick(.03,NEUTRAL);
  assert.equal(inputs().length,2,'unchanged controls retry on the normal heartbeat');
  const retry=inputs().at(-1)!;
  socket.message({type:'inputRejected',seq:retry.seq,targetTick:retry.targetTick,reason:'late'});
  now=70;session.tick(.02,NEUTRAL);
  assert.equal(inputs().length,2,'repeated rejections do not accelerate retries');
  now=90;session.tick(.02,{...NEUTRAL,throttle:1});
  assert.equal(inputs().at(-1)!.input.throttle,1,'changed controls send promptly');
  session.queueEdge('jump',1);now=110;session.tick(.02,{...NEUTRAL,throttle:1,jump:1});
  assert.equal(inputs().at(-1)!.input.jump,1,'button presses send promptly');
  now=130;session.tick(.02,NEUTRAL);
  assert.equal(inputs().at(-1)!.input.throttle,0,'releases send promptly');
  session.disconnect();
});

test('the first snapshot holds remote poses until interpolation has a second sample',()=>{
  let now=0;
  const session=new Session(()=>now);session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld(),player=addPlayer(world,'p','Alex'),other=addPlayer(world,'q','Other');
  const car=world.entities.find(entity=>entity.id===player.entityId)!,peer=world.entities.find(entity=>entity.id===other.entityId)!;
  world.entities=[car,peer];world.pickups=[];
  Object.assign(car,{x:-130,z:60,y:0,yaw:0,speed:0,vx:0,vz:0,supportId:'ground'});
  Object.assign(peer,{x:-130,z:66,y:0,yaw:0,speed:30,vx:0,vz:-30,supportId:'ground'});
  socket.message({type:'state',world,tick:100});now=75;
  const displayed=session.renderWorld();
  assert.equal(session.remotePresentationActive,true,'the scene must not extrapolate a one-snapshot peer');
  assert.equal(displayed.entities.find(entity=>entity.id===peer.id)!.z,66);
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
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3',actionSeq:1,edgeBaseline:{jump:0,flip:0}});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.closed();
});

test('offline navigation requests fail without starting a local session',()=>{
  const session=new Session(), requestId=session.setDestination(-180,60);
  assert.deepEqual(session.destinationResult,{requestId,ok:false});
  const deliveryRequest=session.setDeliveryDestination();
  assert.deepEqual(session.destinationResult,{requestId:deliveryRequest,ok:false});
  assert.equal(session.world.players.length,0);
});

test('a non-default starting vehicle has the same action fence while connecting',()=>{
  const session=new Session();session.join('bay','Alex','model-3');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3',actionSeq:1,edgeBaseline:{jump:0,flip:0}});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  session.disconnect();
});

test('a displayed Tesla can be requested again after taking a same-kind street car',()=>{
  const session=new Session();session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld(),player=addPlayer(world,'p','Alex');
  const borrowed=world.entities.find(entity=>entity.id===player.entityId)!;
  borrowed.owner=null;world.entities=[borrowed];world.pickups=[];
  socket.message({type:'state',world,inputAck:0});
  session.join('bay','Alex','roadster');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'roadster',actionSeq:1,edgeBaseline:{jump:0,flip:0}});
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
    assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3',actionSeq:1,edgeBaseline:{jump:0,flip:0}});
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
  socket.message({type:'marsResult',requestId,action:'board',ok:true,amount:0});
  assert.equal(session.marsResult?.ok,true);
  const donation=session.contributeMars(123);
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'mars',action:'contribute',amount:123,requestId:donation});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:2});
  socket.message({type:'marsResult',requestId:donation,action:'contribute',ok:false,amount:0,available:75});
  assert.deepEqual(session.marsResult,{type:'marsResult',requestId:donation,action:'contribute',ok:false,amount:0,available:75});
  session.join('friends','Alex');assert.equal(session.marsResult,null);
  socket.message({type:'marsResult',requestId,action:'board',ok:true,amount:0});assert.equal(session.marsResult,null);
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

test('a new chat driver binds the guest wallet when browser storage is denied',()=>{
  const session=new Session();session.join('bay','Guest');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:8});
  const world=createWorld();addPlayer(world,'p','Guest');socket.message({type:'state',world});
  const stored=connectDriverWallet('new-driver',code=>stageDriverRecovery(null,code!)==='ok',code=>session.setIdentity(code));
  assert.equal(stored,false);
  const request=JSON.parse(socket.sent.at(-1)!);
  assert.equal(request.type,'identity');assert.equal(request.code,'new-driver');assert.equal(session.walletBlocked,true);
  const sent=socket.sent.length;session.tick(.1,{...NEUTRAL,throttle:1});session.buyUpgrade('rocket');assert.equal(socket.sent.length,sent);
  socket.message({type:'identityResult',requestId:request.requestId,ok:true,message:'Saved driver connected.'});
  socket.message({type:'state',world});assert.equal(session.walletStatus,'ready');
  session.disconnect();
});

test('an unstaged chat switch cannot keep playing with the previous wallet',()=>{
  const entries=new Map([[DRIVER_RECOVERY_KEY,'old-driver'],[DRIVER_PENDING_KEY,'unfinished-driver']]);
  const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};
  const session=new Session(),old=session.setIdentity('old-driver');session.join('bay','Old');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:8});
  const world=createWorld();addPlayer(world,'p','Old');socket.message({type:'state',world});
  socket.message({type:'identityResult',requestId:old,ok:true,message:'connected'});socket.message({type:'state',world});
  assert.equal(session.walletStatus,'ready');
  const stored=connectDriverWallet('new-driver',code=>stageDriverRecovery(storage,code!)==='ok',code=>session.setIdentity(code));
  assert.equal(stored,false);assert.equal(entries.get(DRIVER_RECOVERY_KEY),'old-driver');assert.equal(entries.get(DRIVER_PENDING_KEY),'unfinished-driver');
  const request=JSON.parse(socket.sent.at(-1)!);assert.equal(request.code,'new-driver');assert.equal(session.walletBlocked,true);
  socket.message({type:'identityResult',requestId:old,ok:true,message:'stale'});assert.equal(session.identityResult,null);
  socket.message({type:'identityResult',requestId:request.requestId,ok:false,message:'Rejoin with this driver.'});
  const sent=socket.sent.length;session.tick(.1,{...NEUTRAL,throttle:1});session.buyUpgrade('rocket');assert.equal(socket.sent.length,sent);
  session.disconnect();session.join('bay','New');const next=Socket.last;
  next.message({type:'welcome',id:'q',version:PROTOCOL_VERSION,capacity:8});
  assert.equal(JSON.parse(next.sent.at(-1)!).code,'new-driver');
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
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'selectVehicle',kind:'model-3',actionSeq:1,edgeBaseline:{jump:0,flip:0}},'starting ride is requested after recovery');
  session.tick(.1,{...NEUTRAL,throttle:1});assert.equal(JSON.parse(socket.sent.at(-1)!).type,'input');
  session.disconnect();
});

test('chat reconnecting the same driver does not interrupt a room route or rebind the wallet',()=>{
  const session=new Session(),requestId=session.setIdentity('saved-code');
  session.join('bay','Alex');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  const world=createWorld();addPlayer(world,'p','Alex');socket.message({type:'state',world,inputAck:0});
  const sentDuringRecovery=socket.sent.length;
  assert.equal(session.setIdentity('saved-code'),requestId);
  assert.equal(socket.sent.length,sentDuringRecovery,'an in-flight bind is not duplicated');
  socket.message({type:'wallet',level:0,eligibleIncome:0,cash:2_500,earned:0,unlocked:[],ownedLuxury:[]});
  socket.message({type:'identityResult',requestId,ok:true,message:'Saved driver connected.'});
  socket.message({type:'state',world,inputAck:0});
  assert.equal(session.walletStatus,'ready');
  session.setDestination(-180,60);
  const sentWithRoute=socket.sent.length;
  assert.equal(session.setIdentity('saved-code'),requestId);
  assert.equal(socket.sent.length,sentWithRoute,'no new identity message can cancel the route');
  assert.equal(session.walletStatus,'ready');
  session.join('friends','Alex');const next=Socket.last;
  next.message({type:'welcome',id:'q',version:PROTOCOL_VERSION,capacity:64});
  assert.deepEqual(JSON.parse(next.sent.at(-1)!),{type:'identity',code:'saved-code',requestId},'a new room still binds the driver');
  const replacement=session.setIdentity('other-code');
  assert.notEqual(replacement,requestId);
  assert.deepEqual(JSON.parse(next.sent.at(-1)!),{type:'identity',code:'other-code',requestId:replacement},'a different driver still rebinds');
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
  const requestId=session.setDestination(-180,60,'jump');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'destination',x:-180,z:60,mode:'jump',requestId,actionSeq:1,edgeBaseline:{jump:0,flip:0}});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:1});
  socket.message({type:'destinationResult',requestId,ok:true});
  assert.equal(session.destinationResult?.requestId,requestId);assert.equal(session.destinationResult?.ok,true);
  const deliveryRequest=session.setDeliveryDestination('sky');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'deliveryDestination',mode:'sky',requestId:deliveryRequest,actionSeq:2,edgeBaseline:{jump:0,flip:0}});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:2});
  socket.message({type:'destinationResult',requestId:deliveryRequest,ok:true});
  assert.deepEqual(session.destinationResult,{type:'destinationResult',requestId:deliveryRequest,ok:true});
  session.enterMinigame('park');
  assert.deepEqual(JSON.parse(socket.sent.at(-2)!),{type:'minigame',game:'park',actionSeq:3,edgeBaseline:{jump:0,flip:0}});
  assert.deepEqual(JSON.parse(socket.sent.at(-1)!),{type:'sync',token:3});
  session.join('friends','Alex');assert.equal(session.destinationResult,null);
  socket.message({type:'destinationResult',requestId,ok:true});assert.equal(session.destinationResult,null);
  session.disconnect();
});

test('playtest rooms never send a remembered identity and returning to Bay restores it',()=>{
  const session=new Session();session.setIdentity('private-saved-driver-code');
  for(const room of ['sandbox','practice-fresh']){
    session.join(room,'Driver');const socket=Socket.last;
    socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
    assert.equal(session.walletStatus,'guest');
    assert.ok(!socket.sent.join('').includes('private-saved-driver-code'));
    const identity=socket.sent.map(raw=>JSON.parse(raw)).find(m=>m.type==='identity');
    assert.equal(identity.code,null);
    socket.message({type:'identityResult',requestId:identity.requestId,ok:true,message:'Practice driver ready.'});
    assert.equal(session.identityResult,null,'practice cannot confirm or overwrite a remembered driver');
    session.setIdentity('private-saved-driver-code');
    assert.ok(!socket.sent.join('').includes('private-saved-driver-code'));
  }
  session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:64});
  assert.equal(session.walletStatus,'connecting');
  assert.ok(socket.sent.map(raw=>JSON.parse(raw)).some(m=>m.type==='identity'&&m.code==='private-saved-driver-code'));
  session.disconnect();
});
