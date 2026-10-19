import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, interact, removePlayer, resetPlayer, simulationSubsteps, step, NEUTRAL, BUILDINGS } from '../shared/game';
import { STATIONS, stationStalls } from '../shared/stations';
import { refillStationFor } from '../shared/charging';
import { HILL, terrainHeight } from '../shared/map';
import { NEW_LANDMARKS } from '../shared/new-landmarks';
import { dimensions } from '../shared/physics';
import { trafficInput } from '../shared/traffic';
import { parseMessage, roomCapacity, roomSlug } from '../worker/protocol';
import { ScheduledInput } from '../shared/tick-input';
import { RoomInputClient } from './room-input-client';

function setup() { const world = createWorld(); const player = addPlayer(world, 'one', 'One'); const car = world.entities.find(e => e.id === player.entityId)!; return { world, player, car }; }
test('presentation replay matches adaptive stepping when the authoritative count is known',()=>{
  const {world,car}=setup();world.entities=[car];Object.assign(car,{speed:32,vz:-32});
  const replay=structuredClone(world),inputs=new Map([['one',{...NEUTRAL,throttle:1,steer:.3}]]);
  const substeps=simulationSubsteps(world,.05);assert.ok(substeps>1);
  let actual=0;step(world,inputs,.05,{onSubsteps:value=>{actual=value;}});
  step(replay,inputs,.05,{substeps});
  assert.equal(actual,substeps);assert.deepEqual(replay,world);
});
test('authoritative jump and one-tap flip consume air and land', () => {
  const { world, car } = setup();
  const inputs = new Map([['one', { ...NEUTRAL, jump: 1 }]]);
  step(world, inputs, .05);
  inputs.set('one', { ...NEUTRAL, jump: 1, flip: 1 });
  for (let i = 0; i < 20; i++) step(world, inputs, .05);
  assert.ok(car.y > 1); assert.ok(car.stunts === 1); assert.equal(car.air, 58);
  for (let i = 0; i < 80; i++) step(world, inputs, .05);
  assert.equal(car.y, 0); assert.equal(car.roll, 0); assert.equal(car.vy, 0);
});
test('exit, take another car, disconnect keeps ownership consistent', () => {
  const { world, player, car } = setup(); interact(world, player.id);
  const person = world.entities.find(e => e.id === player.entityId)!;
  assert.equal(person.kind, 'person'); assert.equal(car.driver, null);
  const other = world.entities.find(e => e.id === 'parked-1')!;
  person.x = other.x + 3; person.z = other.z;
  interact(world, player.id); assert.equal(player.entityId, other.id); assert.equal(other.driver, player.id);
  removePlayer(world, player.id); assert.equal(other.driver, null); assert.equal(world.players.length, 0);
  assert.ok(!world.entities.some(e => e.id === car.id || e.kind === 'person'));
});
test('collisions stop buildings and transfer motion between cars', () => {
  const { world, car } = setup(); const b = BUILDINGS[0];
  car.x = b.x; car.z = b.z + b.d / 2 + 1.9; car.speed = 40; car.yaw = 0;
  const start = car.z; step(world, new Map(), 0.05); assert.equal(car.z, start); assert.ok(car.speed <= 0); assert.ok(car.health < 100);
  const other = world.entities.find(e => e.id === 'parked-1')!;
  car.x = 0; car.z = 0; car.speed = 10; other.x = 0; other.z = -3.5;
  step(world, new Map(), 0.05); assert.ok(other.speed > 0);
});
test('station stalls and the original radius refill stopped cars, but moving cars do not', () => {
  const { world, car } = setup(); world.entities=[car];world.pickups=[];
  for(const station of STATIONS)for(const stall of stationStalls(station)){
    Object.assign(car,{x:stall.x,z:stall.z,y:0,supportId:'ground',air:10,speed:0,vx:0,vy:0,vz:0});
    step(world, new Map(), .05); assert.ok(car.air > 10,stall.id);
  }
  const station=STATIONS[0];
  Object.assign(car,{x:station.x,z:station.z+6,air:10,speed:0});
  step(world,new Map(),.05);assert.ok(car.air>10,'the original radius refills');
  Object.assign(car,{x:stationStalls(station)[0].x,z:station.z-5,air:10,speed:5});
  step(world, new Map(), .05); assert.equal(car.air, 10);
  car.health = 30; resetPlayer(world, 'one'); assert.equal(car.health, 30); assert.equal(car.air, 10); assert.equal(car.y, 0);
});
test('every charger bay and the original radius refill only stopped supported vehicles',()=>{
  const {world,car}=setup();world.entities=[car];world.pickups=[];
  for(const station of STATIONS){
    for(const stall of stationStalls(station)){
      Object.assign(car,{x:stall.x,z:stall.z,y:0,yaw:0,supportId:'ground',air:10,speed:0,vx:0,vy:0,vz:0});
      assert.equal(refillStationFor(car)?.id,station.id,stall.id);
      step(world,new Map(),.05);assert.ok(car.air>10,stall.id);
    }
    Object.assign(car,{x:station.x+8,z:station.z,y:0,supportId:'ground',air:10,speed:0,vx:0,vy:0,vz:0});
    step(world,new Map(),.05);assert.ok(car.air>10,`${station.id}: radius`);
    car.speed=5;car.air=10;assert.equal(refillStationFor(car),undefined);
    step(world,new Map(),.05);assert.equal(car.air,10,`${station.id}: moving`);
    Object.assign(car,{y:10,supportId:null,speed:0});assert.equal(refillStationFor(car),undefined);
  }
});
test('64-player spawns do not overlap and simulation stays finite', () => {
  const world = createWorld(); for (let i = 0; i < 64; i++) addPlayer(world, `p${i}`, 'Driver');
  const cars = world.entities.filter(e => e.driver);
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) >= 5);
  for (let i = 0; i < 20; i++) step(world, new Map(), 0.05);
  assert.ok(world.entities.every(e => [e.x, e.y, e.z, e.speed].every(Number.isFinite)));
});
test('protocol rejects malformed, non-finite, oversized and out-of-range input', () => {
  const frame={type:'input',seq:1,targetTick:2,controlRevision:0,actionSeq:0,roomEpoch:'00000000-0000-0000-0000-000000000000',input:NEUTRAL};
  assert.ok(parseMessage(JSON.stringify(frame)));
  assert.equal(parseMessage(JSON.stringify({...frame,targetTick:0})),null);
  assert.equal(parseMessage(JSON.stringify({...frame,controlRevision:-1})),null);
  assert.equal(parseMessage(JSON.stringify({...frame,actionSeq:-1})),null);
  assert.equal(parseMessage(JSON.stringify({...frame,actionSeq:1.5})),null);
  const {actionSeq,...withoutActionSeq}=frame;
  assert.equal(parseMessage(JSON.stringify(withoutActionSeq)),null);
  assert.equal(parseMessage(JSON.stringify({...frame,roomEpoch:'invalid'})),null);
  assert.equal(parseMessage(JSON.stringify({type:'input',input:NEUTRAL})),null);
  assert.equal(parseMessage(JSON.stringify({...frame,seq:0})),null);
  assert.equal(parseMessage(JSON.stringify({...frame,seq:1.5})),null);
  assert.deepEqual(parseMessage('{"type":"sync","token":2}'),{type:'sync',token:2});
  assert.equal(parseMessage('{"type":"sync","token":0}'),null);
  assert.equal(parseMessage('{'), null); assert.equal(parseMessage('x'.repeat(1025)), null);
  assert.equal(parseMessage(JSON.stringify({ ...frame, input: { ...NEUTRAL, throttle: 2 } })), null);
  assert.equal(parseMessage('{"type":"input","input":{"throttle":1e999}}'), null);
  assert.equal(parseMessage(JSON.stringify({ ...frame, input: { ...NEUTRAL, boost: 1 } })), null);
  assert.equal(parseMessage(JSON.stringify({ ...frame, input: { ...NEUTRAL, jump: -1 } })), null);
  assert.ok(parseMessage('{"type":"parking","action":"park"}'));
  assert.equal(parseMessage('{"type":"parking","action":"award"}'),null);
  const fence={actionSeq:1,edgeBaseline:{jump:0,flip:0}};
  assert.ok(parseMessage(JSON.stringify({type:'race',action:'join',courseId:'short',...fence})));
  assert.equal(parseMessage('{"type":"race","action":"join","courseId":"short"}'),null);
  assert.equal(parseMessage('{"type":"race","action":"finish","courseId":"short","elapsed":0}'),null);
  assert.equal(parseMessage('{"type":"race","action":"join","courseId":"__proto__"}'),null);
  assert.equal(roomSlug('/api/room/bay-1'), 'bay-1'); assert.equal(roomSlug('/api/room/../../bad'), null);
  assert.equal(roomCapacity(), 64); assert.equal(roomCapacity('64'), 64);
  assert.equal(roomCapacity('1'), 2); assert.equal(roomCapacity('10000'), 128); assert.equal(roomCapacity('oops'), 64);
});
test('wire action fences require positive sequences and valid edge baselines',()=>{
  const fence={actionSeq:1,edgeBaseline:{jump:0,flip:2147483647}};
  const actions=[{type:'interact'},{type:'reset'},{type:'autopilot'},{type:'dome'},
    {type:'selectVehicle',kind:'roadster'},{type:'minigame',game:'short'},
    {type:'destination',x:0,z:0,mode:'road',requestId:1},{type:'race',action:'join',courseId:'short'},
    {type:'luxury',action:'collect',vehicle:'ducati-panigale-v4',requestId:1}];
  for(const action of actions){
    assert.ok(parseMessage(JSON.stringify({...action,...fence})),action.type);
    assert.equal(parseMessage(JSON.stringify(action)),null,`${action.type} needs a fence`);
  }
  for(const bad of [{actionSeq:0},{actionSeq:-1},{actionSeq:1.5},{edgeBaseline:null},
    {edgeBaseline:{jump:-1,flip:0}},{edgeBaseline:{jump:0,flip:2147483648}},{edgeBaseline:{jump:0}}]){
    assert.equal(parseMessage(JSON.stringify({type:'reset',...fence,...bad})),null);
  }
  assert.ok(parseMessage(JSON.stringify({type:'race',action:'start',courseId:'short'})),'non-join race actions remain unfenced');
  assert.ok(parseMessage(JSON.stringify({type:'luxury',action:'buy',vehicle:'ducati-panigale-v4',requestId:1})),'buying does not replace the vehicle');
});
test('local input client fences actions with its latest counters and retains action order',()=>{
  const frames:string[]=[];
  const socket={readyState:WebSocket.OPEN,send:(frame:string)=>frames.push(frame)} as unknown as WebSocket;
  const client=new RoomInputClient(socket),control=new ScheduledInput(NEUTRAL).snapshot();
  client.observe({type:'welcome',tick:10,roomEpoch:'00000000-0000-0000-0000-000000000000'});
  client.observe({type:'state',tick:10,roomEpoch:client.roomEpoch,poseRevision:0,control});
  client.send({...NEUTRAL,jump:1});
  client.action({type:'reset'});
  client.send({...NEUTRAL,jump:1,flip:1});
  // An older snapshot cannot roll back an action already sent on the socket.
  client.observe({type:'state',tick:12,roomEpoch:client.roomEpoch,poseRevision:0,control});
  client.action({type:'selectVehicle',kind:'roadster'});
  const sent=frames.map(frame=>JSON.parse(frame));
  assert.deepEqual(sent.map(frame=>frame.actionSeq),[0,1,1,2]);
  assert.deepEqual(sent[1].edgeBaseline,{jump:1,flip:0});
  assert.deepEqual(sent[3].edgeBaseline,{jump:1,flip:1});
  assert.ok(frames.every(frame=>parseMessage(frame)),'all helper frames satisfy the wire schema');
});
test('rooftop landing stays supported and can drive off; positive steer turns left', () => {
  const { world, car } = setup(); const roof = BUILDINGS[0];
  car.x = roof.x; car.z = roof.z; car.y = roof.h + 1; car.vy = -5; car.yaw = 0; car.supportId = null;
  for (let i = 0; i < 80; i++) step(world, new Map(), 0.05);
  assert.equal(car.y, roof.h); assert.equal(car.vy, 0);
  for (let i = 0; i < 30; i++) step(world, new Map([['one', { ...NEUTRAL, throttle: 1 }]]), 0.05);
  assert.ok(car.z < roof.z - roof.d / 2); assert.ok(car.y < roof.h);
  car.x = 0; car.z = 0; car.y = 0; car.vy = 0; car.speed = 10; car.yaw = 0; car.supportId = 'ground';
  step(world, new Map([['one', { ...NEUTRAL, steer: 1 }]]), 0.05);
  assert.ok(car.x < 0); assert.ok(car.yaw > 0);
});

test('player braking into a turn slides, then regains grip; straight braking still stops', () => {
  function carAtSpeed() {
    const setupResult = setup();
    setupResult.world.entities = [setupResult.car];
    Object.assign(setupResult.car, { x: 0, z: 0, yaw: 0, speed: 20 });
    return setupResult;
  }
  const slide = carAtSpeed(), normal = carAtSpeed();
  for (let i = 0; i < 12; i++) {
    step(slide.world, new Map([['one', {...NEUTRAL, steer: 1, brake: true}]]), .05);
    step(normal.world, new Map([['one', {...NEUTRAL, steer: 1}]]), .05);
  }
  const slip = Math.hypot(slide.car.pushX, slide.car.pushZ);
  assert.ok(slip > 1); assert.ok(slip > Math.hypot(normal.car.pushX, normal.car.pushZ) + 1);
  for (let i = 0; i < 20; i++) step(slide.world, new Map(), .05);
  assert.ok(Math.hypot(slide.car.pushX, slide.car.pushZ) < slip * .1);
  const straight = carAtSpeed();
  for (let i = 0; i < 60; i++) step(straight.world, new Map([['one', {...NEUTRAL, brake: true}]]), .05);
  assert.equal(straight.car.speed, 0); assert.equal(Math.hypot(straight.car.pushX, straight.car.pushZ), 0);
});

test('pickups refill resources once and return after twenty simulation seconds', () => {
  const world = createWorld();
  const player = addPlayer(world, 'collector', 'Collector');
  const car = world.entities.find(e => e.id === player.entityId)!;
  const pickup = world.pickups.find(p => p.kind === 'repair')!;
  car.x = pickup.x; car.z = pickup.z; car.health = 10;
  step(world, new Map(), .05);
  assert.equal(car.health, 100); assert.equal(pickup.active, false);
  car.x = 0; car.z = 0;
  for (let i = 0; i < 401; i++) step(world, new Map(), .05);
  assert.equal(pickup.active, true);
});


test('occupied autopilot slows and turns without involuntary drift', () => {
  const {world,car}=setup();world.entities=[car];
  Object.assign(car,{x:-20,z:-57,y:0,yaw:0,speed:20,autopilot:true,routeId:2,waypoint:1});
  const input=trafficInput(car,world);assert.ok(Math.abs(input.steer)>.1);
  step(world,new Map(),.05);
  assert.equal(car.autopilot,true);assert.ok(car.speed<20);assert.ok(Math.hypot(car.pushX,car.pushZ)<1e-9);
});

test('drift keeps a high-speed car on the shared hill surface', () => {
  const {world,car}=setup();world.entities=[car];
  const x=HILL.minX+40,z=(HILL.minZ+HILL.maxZ)/2;
  Object.assign(car,{x,z,y:terrainHeight(x,z),yaw:-Math.PI/2,speed:30,supportId:'ground'});
  let maxSlip=0;
  for(let i=0;i<8;i++){
    step(world,new Map([['one',{...NEUTRAL,steer:1,brake:true}]]),.05);
    maxSlip=Math.max(maxSlip,Math.hypot(car.pushX,car.pushZ));
    assert.equal(car.supportId,'ground');assert.ok(Math.abs(car.y-terrainHeight(car.x,car.z)!)<1e-7);
  }
  assert.ok(maxSlip>1);
});

test('manual driving turns sharply at road speeds and in reverse',()=>{
  const {world,car}=setup();world.entities=[car];
  for(const speed of [10,20,40]){
    Object.assign(car,{x:0,z:0,y:0,supportId:'ground',yaw:0,speed,steering:0,autopilot:false});
    for(let i=0;i<10;i++)step(world,new Map([['one',{...NEUTRAL,steer:1,throttle:1}]]),.05);
    assert.ok(car.yaw>(speed===40?.2:.35),`speed ${speed}: yaw ${car.yaw}`);
  }
  Object.assign(car,{x:0,z:0,y:0,supportId:'ground',yaw:0,speed:-8,steering:0,autopilot:false});
  for(let i=0;i<5;i++)step(world,new Map([['one',{...NEUTRAL,steer:1}]]),.05);
  assert.ok(car.yaw<0,'reverse steering changes direction');
});

test('direction changes brake first and do not turn the wrong way while slowing',()=>{
 for(const direction of [-1,1]){
  const {world,car}=setup();world.entities=[car];world.pickups=[];
  Object.assign(car,{x:0,z:0,y:0,yaw:0,speed:direction*4,steering:direction,supportId:'ground'});
  const input={...NEUTRAL,throttle:-direction,steer:-direction};
  for(let i=0;i<4;i++){const oldSpeed=car.speed,oldYaw=car.yaw;step(world,new Map([['one',input]]),.05);if(oldSpeed*input.throttle<-.01)assert.ok(Math.abs(car.yaw-oldYaw)<1e-8,'braking does not turn toward the old direction');}
  for(let i=0;i<5;i++)step(world,new Map([['one',input]]),.05);
  assert.ok(car.speed*input.throttle>0);assert.ok(car.yaw*input.steer*Math.sign(car.speed)>0,'steering follows the new direction');
 }
});
test('supply diamonds award cash without advancing delivery earnings',()=>{
 const {world,player,car}=setup();world.entities=[car];
 for(const kind of ['repair','air'] as const){
  world.pickups=[{id:kind,kind,x:0,z:0,active:true}];Object.assign(car,{x:0,z:0,y:0,speed:0,supportId:'ground',air:20,health:20});
  const cash=player.delivery.cash,earned=player.delivery.earned;step(world,new Map(),.05);
  assert.equal(player.delivery.cash,cash+5);assert.equal(player.delivery.earned,earned);
  assert.equal(player.delivery.lastReward?.kind,kind==='repair'?'supply-repair':'supply-air');
  assert.equal(kind==='repair'?car.health:car.air,100);
 }
});

test('curved landmark roofs support a descending vehicle at their visible surface',async()=>{
 const {buildingRoofHeight}=await import('../shared/map');
 const examples=[
  BUILDINGS.find(b=>b.style==='rotunda')!,
  BUILDINGS.find(b=>b.style==='salesforce')!,
  BUILDINGS.find(b=>b.style==='landmark'&&b.x===-270&&b.z===-150)!,
 ];
 for(const roof of examples){
  const {world,car}=setup();world.entities=[car];world.pickups=[];
  const x=roof.x+roof.w*.15,z=roof.z,height=buildingRoofHeight(roof,x,z);
  Object.assign(car,{x,z,y:height+2,vy:-6,vx:0,vz:0,supportId:null});
  for(let i=0;i<20&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,`roof:${BUILDINGS.indexOf(roof)}`);assert.ok(Math.abs(car.y-height)<.01);
 }
});

test('a car drives off the Hornet deck and loses support at the visible edge',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-uss-hornet')!;
 const {world,car}=setup();world.entities=[car];world.pickups=[];
 Object.assign(car,{x:place.x,z:place.z+place.d*.1,y:place.h+2,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 for(let i=0;i<100&&car.supportId===null;i++)step(world,new Map(),.05);
 assert.ok(car.supportId?.startsWith('roof:'));
 const deckY=place.h*.325;
 assert.ok(Math.abs(car.y-deckY)<.05);
 Object.assign(car,{yaw:Math.PI/2,speed:0,vx:0,vz:0});
 const deckEdge=place.x-place.w*.42,halfLength=dimensions(car.kind).length/2;
 let dropped=false,supportedPastCenter=false;
 for(let i=0;i<100;i++){
  step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  if(car.x<deckEdge&&car.x+halfLength>deckEdge&&car.supportId?.startsWith('roof:'))supportedPastCenter=true;
  if(car.supportId===null&&car.y<deckY-.01){dropped=true;break;}
 }
 assert.ok(dropped,`never left deck: ${car.x-place.x}, ${car.y}, ${car.supportId}`);
 assert.ok(supportedPastCenter,'lost support while the vehicle still overlapped the deck');
 assert.ok(car.x+halfLength<deckEdge,`fell before the vehicle cleared the deck: ${car.x-place.x}`);
});

test('empty space inside a landmark broad-phase envelope does not catch falling cars',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-uss-hornet')!;
 const {world,car}=setup();world.entities=[car];world.pickups=[];
 // The narrow strip is inside the coarse building bounds but beyond the
 // flight deck's outer edge, including the car's entire footprint.
 Object.assign(car,{x:place.x+place.w*.49,z:place.z,y:place.h+2,yaw:0,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 for(let i=0;i<100&&car.supportId===null;i++)step(world,new Map(),.05);
 assert.equal(car.supportId,'ground',`invisible support at ${car.y}`);
 assert.equal(car.y,0);
});

test('a falling car lands when its body overlaps the deck even if its pivot is outside',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-uss-hornet')!;
 const {world,car}=setup();world.entities=[car];world.pickups=[];
 Object.assign(car,{x:place.x+place.w*.49,z:place.z,y:place.h+2,yaw:Math.PI/2,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 assert.ok(car.x>place.x+place.w*.42,'pivot must start outside the deck');
 assert.ok(car.x-dimensions(car.kind).length/2<place.x+place.w*.42,'body must overlap the deck');
 for(let i=0;i<100&&car.supportId===null;i++)step(world,new Map(),.05);
 assert.ok(car.supportId?.startsWith('roof:'),`did not land on overlapping deck: ${car.y}`);
 assert.ok(Math.abs(car.y-place.h*.325)<.05,`landed at ${car.y}`);
});

test('visible ship and stadium walls stop cars but nearby ground stays traversable',()=>{
 const hornet=NEW_LANDMARKS.find(p=>p.id==='new-uss-hornet')!;
 const ship=setup();ship.world.entities=[ship.car];ship.world.pickups=[];
 Object.assign(ship.car,{x:hornet.x-11,z:hornet.z,y:0,yaw:-Math.PI/2,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
 let maxX=ship.car.x;
 for(let i=0;i<60;i++){
  step(ship.world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  maxX=Math.max(maxX,ship.car.x);
 }
 assert.ok(maxX>hornet.x-10,'could not approach the visible hull');
 assert.ok(maxX<=hornet.x-hornet.w*.30-dimensions(ship.car.kind).length/2+.15,`passed into hull: ${maxX-hornet.x}`);

 const stadium=NEW_LANDMARKS.find(p=>p.id==='new-oakland-coliseum')!;
 const stand=setup();stand.world.entities=[stand.car];stand.world.pickups=[];
 Object.assign(stand.car,{x:stadium.x,z:stadium.z,y:stadium.h+2,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 for(let i=0;i<100&&stand.car.supportId===null;i++)step(stand.world,new Map(),.05);
 assert.ok(Math.abs(stand.car.y-stadium.h*.21)<.05,'did not land on field');
 Object.assign(stand.car,{yaw:-Math.PI/2,speed:0,vx:0,vz:0});
 let furthest=stand.car.x;
 for(let i=0;i<60;i++){
  step(stand.world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  furthest=Math.max(furthest,stand.car.x);
 }
 assert.ok(furthest>stadium.x+.2,'could not move on the field');
 assert.ok(furthest<=stadium.x+stadium.w*.29-dimensions(stand.car.kind).length/2+.15,`passed into stand: ${furthest-stadium.x}`);

 const nearby=setup();nearby.world.entities=[nearby.car];nearby.world.pickups=[];
 Object.assign(nearby.car,{x:hornet.x-14,z:hornet.z+hornet.d,y:0,yaw:-Math.PI/2,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
 for(let i=0;i<40;i++)step(nearby.world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(nearby.car.x>hornet.x-4,`free ground is obstructed: ${nearby.car.x-hornet.x}`);
 assert.equal(nearby.car.supportId,'ground');
});

test('angled vehicles contact a faceted arena even when their pivots are outside its polygon',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-oakland-arena')!;
 // The authored cylinder has 12 sides. Halfway between vertices, .99 of its
 // circumradius is outside the polygon (its apothem is cos(pi/12)).
 const angle=Math.PI/12,r=.99;
 assert.ok(r>Math.cos(Math.PI/12));
 const x=place.x+place.w*.44*r*Math.sin(angle),z=place.z+place.d*.44*r*Math.cos(angle);
 const landing=setup();landing.world.entities=[landing.car];landing.world.pickups=[];
 Object.assign(landing.car,{x,z,y:place.h+2,yaw:angle,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 for(let i=0;i<100&&landing.car.supportId===null;i++)step(landing.world,new Map(),.05);
 assert.ok(landing.car.supportId?.startsWith('roof:'),`missed overlapping arena: ${landing.car.y}`);
 assert.ok(Math.abs(landing.car.y-place.h*.54)<.2,`unexpected edge height ${landing.car.y}`);
 const landedId=landing.car.supportId;
 for(let i=0;i<5;i++)step(landing.world,new Map(),.05);
 assert.equal(landing.car.supportId,landedId,'edge support changed while stationary');

 // Approach the same face from outside at an oblique angle; the visible
 // cylinder must stop the body before its center enters the ellipse.
 const wall=setup();wall.world.entities=[wall.car];wall.world.pickups=[];
 Object.assign(wall.car,{x:place.x+13*Math.sin(angle),z:place.z+13*Math.cos(angle),y:0,yaw:angle,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
 let minRadius=Infinity;
 for(let i=0;i<60;i++){
  step(wall.world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  const nx=(wall.car.x-place.x)/(place.w*.44),nz=(wall.car.z-place.z)/(place.d*.44);
  minRadius=Math.min(minRadius,Math.hypot(nx,nz));
 }
 assert.ok(minRadius>1,`car crossed the arena wall: normalized radius ${minRadius}`);
 assert.ok(minRadius<1.8,`car could not approach arena: normalized radius ${minRadius}`);
});

test('the carousel has an open underside and a solid canopy above its platform',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-tilden-merry-go-round')!;
 const {world,car}=setup();world.entities=[car];world.pickups=[];
 // This point misses the center pole and miniature horses. Start below the
 // roof, rise into its underside, then fall to the visible circular platform.
 const x=place.x+place.w*.15,z=place.z+place.d*.10,canopyBottom=place.h*.69;
 Object.assign(car,{x,z,y:canopyBottom-dimensions(car.kind).height-1,yaw:0,vy:6,vx:0,vz:0,speed:0,supportId:null});
 let highest=car.y;
 for(let i=0;i<100;i++){
  step(world,new Map(),.05);highest=Math.max(highest,car.y);
  if(car.supportId!==null)break;
 }
 assert.ok(highest>canopyBottom-dimensions(car.kind).height-.8,`car did not rise toward canopy: ${highest}`);
 assert.ok(highest+dimensions(car.kind).height<=canopyBottom+.08,`passed through canopy underside: ${highest}`);
 assert.ok(car.supportId?.startsWith('roof:'),`did not land on platform: ${car.supportId}`);
 assert.ok(Math.abs(car.y-place.h*.14)<.05,`platform height ${car.y}`);
 Object.assign(car,{yaw:0,speed:0,vx:0,vz:0});
 const startZ=car.z;
 for(let i=0;i<12;i++)step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(car.z<startZ-1,`could not drive under the canopy: ${car.z-startZ}`);
 assert.ok(Math.abs(car.y-place.h*.14)<.05,`lost platform under canopy: ${car.y}`);
});

test('a pitched car hits the carousel canopy with its body when rising and landing',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-tilden-merry-go-round')!;
 const x=place.x+place.w*.15,z=place.z+place.d*.10,canopyBottom=place.h*.69;
 const rising=setup();rising.world.entities=[rising.car];rising.world.pickups=[];
 const size=dimensions(rising.car.kind);
 Object.assign(rising.car,{x,z,y:canopyBottom-3.3,yaw:0,pitch:1.2,roll:0,vy:6,vx:0,vz:0,speed:0,supportId:null});
 let highestTop=-Infinity,attempted=false;
 for(let i=0;i<45;i++){
  step(rising.world,new Map(),.05);
  // The nose and rear extend vertically with pitch; the upright-height-only
  // calculation would let the visible end of this 4.5m car enter the roof.
  const top=rising.car.y+Math.abs(Math.sin(rising.car.pitch))*size.length/2+Math.cos(rising.car.pitch)*size.height;
  highestTop=Math.max(highestTop,top);
  if(top>canopyBottom-.5)attempted=true;
  assert.ok(top<=canopyBottom+.08,`pitched car penetrated canopy: top ${top}, underside ${canopyBottom}`);
  if(rising.car.supportId!==null)break;
 }
 assert.ok(attempted,`pitched car never reached canopy: top ${highestTop}`);
 assert.ok(rising.car.vy<=0,'canopy did not stop upward motion');

 const landing=setup();landing.world.entities=[landing.car];landing.world.pickups=[];
 // This authored position has a visible canopy top of 9.9612m by raycast.
 // Keep pitch nonzero during the fall so the car's lower end contacts first.
 const roofTop=9.9612;
 Object.assign(landing.car,{x:place.x+place.w*.15,z:place.z,y:place.h+3,yaw:0,pitch:1,roll:0,vy:-5,vx:0,vz:0,speed:0,supportId:null});
 let tiltedInFlight=false;
 for(let i=0;i<100&&landing.car.supportId===null;i++){
  step(landing.world,new Map(),.05);
  if(landing.car.supportId===null){
   const bottom=landing.car.y-Math.abs(Math.sin(landing.car.pitch))*size.length/2;
   assert.ok(bottom>=roofTop-.08,`pitched car penetrated roof before landing: bottom ${bottom}, roof ${roofTop}`);
   tiltedInFlight||=Math.abs(landing.car.pitch)>.4;
  }
 }
 assert.ok(tiltedInFlight,'car did not remain tilted during descent');
 assert.ok(landing.car.supportId?.startsWith('roof:'),`tilted landing missed roof: ${landing.car.supportId}`);
 assert.ok(Math.abs(landing.car.y-roofTop)<.12,`landed at ${landing.car.y}`);
});

test('an ascending car lands when a curved landmark roof rises faster beneath it',()=>{
 const place=NEW_LANDMARKS.find(p=>p.id==='new-oakland-arena')!;
 const index=BUILDINGS.findIndex(building=>building.landmarkId===place.id);
 assert.ok(index>=0);
 const {world,car}=setup();world.entities=[car];world.pickups=[];
 // At +.2w, the rendered arena dome is 15.275m high. Moving toward its
 // center climbs the dome faster than the car's small upward velocity.
 Object.assign(car,{x:place.x+place.w*.2,z:place.z,y:15.325,yaw:0,pitch:0,roll:0,vy:2,vx:-12,vz:0,speed:0,supportId:null});
 let approachingUpward=false;
 for(let i=0;i<20&&car.supportId===null;i++){
  const priorVy=car.vy,priorY=car.y,priorX=car.x;
  step(world,new Map(),.01);
  if(car.supportId!==null){
   approachingUpward=priorVy>.1&&car.y>priorY&&car.x<priorX;
  }
 }
 assert.ok(approachingUpward,`roof failed to catch an ascending crossing: y=${car.y}, vy=${car.vy}, support=${car.supportId}`);
 assert.ok(car.supportId?.startsWith(`roof:${index}:`),`unexpected support ${car.supportId}`);
});

test('supply diamonds are separate and never sit on the initial player spawns',()=>{
 const world=createWorld();world.entities=[];
 const supplies=world.pickups.filter(p=>p.kind!=='rocket');
 for(const [i,pickup] of supplies.entries())for(const other of supplies.slice(i+1))assert.ok(Math.hypot(pickup.x-other.x,pickup.z-other.z)>8);
 for(let i=0;i<20;i++){
  const player=addPlayer(world,`spawn-${i}`,'Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  assert.ok(supplies.every(p=>Math.hypot(car.x-p.x,car.z-p.z)>=4),`spawn ${i}`);
 }
});
