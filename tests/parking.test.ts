import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity, type Entity, type World } from '../shared/game';
import { initialDelivery } from '../shared/delivery';
import { initialAchievements } from '../shared/achievements';
import { VEHICLE_IDS } from '../shared/vehicles';
import { PARKING_LOTS } from '../shared/parking-lots';
import { createFerry } from '../shared/ferry';
import { createRace } from '../shared/race';
import {
  createParking, fitsParkingStall, joinParking, leaveParking, startQueue, updateParking,
  PARKING_QUEUE_WAIT, PARKING_QUEUE_DURATION, PARKING_PARK_DURATION, PARKING_RESULTS_DURATION,
  type ParkingLot, type ParkingState,
} from '../shared/parking';

const lot:ParkingLot={id:'test-lot',area:{x:0,z:0,yaw:0,width:200,length:200},
  approach:{x:-30,z:0,yaw:0,width:30,length:30},stalls:[
    {id:'a',x:0,y:0,z:20,yaw:0,width:5,length:10},
    {id:'b',x:15,y:0,z:20,yaw:0,width:5,length:10},
    {id:'c',x:30,y:0,z:20,yaw:0,width:5,length:10},
    {id:'d',x:45,y:0,z:20,yaw:0,width:5,length:10},
  ]};
function world():World{return {entities:[],players:[],pickups:[],time:0,ferry:createFerry(),parking:createParking(),races:createRace()};}
function add(world:World,id:string,kind:Entity['kind']='roadster',x=0,z=0):Entity {
  const car=makeEntity(`car-${id}`,kind,x,z,id);
  Object.assign(car,{y:0,supportId:'ground'});
  world.entities.push(car);
  world.players.push({id,name:id,entityId:car.id,delivery:initialDelivery({x,z}),achievements:initialAchievements(),cockpit:{active:false,activeSeconds:0,deliveries:0,orderEligible:true,orderSeconds:0}});
  return car;
}
function place(car:Entity,stall=lot.stalls[0]):void {
  Object.assign(car,{x:stall.x,y:stall.y,z:stall.z,yaw:stall.yaw,supportId:'ground',vx:0,vy:0,vz:0,speed:0});
}
function tick(state:ParkingState,world:World,dt=.05):void {world.time+=dt;updateParking(state,[lot],world,dt);}

test('stall fitting checks all 26 collision footprints, heading, support and actual motion',()=>{
  const stall=lot.stalls[0],w=world();
  for(const kind of VEHICLE_IDS){
    const car=add(w,kind,kind);place(car,stall);
    assert.equal(fitsParkingStall(stall,car),true,kind);
  }
  const car=add(w,'check');place(car,stall);
  car.x=1.6;assert.equal(fitsParkingStall(stall,car),false,'center inside while body crosses marking');
  place(car,stall);car.yaw=Math.PI/9+.001;assert.equal(fitsParkingStall(stall,car),false);
  const large={...stall,width:20,length:20};
  car.yaw=Math.PI/9;assert.equal(fitsParkingStall(large,car),true,'20 degrees is allowed');
  car.yaw=2*Math.PI-.01;assert.equal(fitsParkingStall(stall,car),true,'heading wraps');
  place(car,stall);car.vx=1;assert.equal(fitsParkingStall(stall,car),false,'speed must be below 1 m/s');
  car.vx=0;car.speed=.1;car.pushX=2;car.vx=2;assert.equal(fitsParkingStall(stall,car),false,'sideways collision motion counts');
  place(car,stall);car.supportId=null;assert.equal(fitsParkingStall(stall,car),false,'hovering cannot score');
  place(car,stall);car.y=10;assert.equal(fitsParkingStall(stall,car),false,'an elevated body cannot score');
  place(car,stall);car.kind='person';assert.equal(fitsParkingStall(stall,car),false);
});

test('Park It holds continuously for two seconds and records once using simulation time',()=>{
  const w=world(),state=createParking(),car=add(w,'p');
  assert.equal(joinParking(state,lot,w,'p','park'),true);
  const round=state.rounds[0],entrant=round.entrants[0],stall=lot.stalls.find(s=>s.id===entrant.targetId)!;
  place(car,stall);for(let i=0;i<30;i++)tick(state,w);
  assert.equal(entrant.finishedAt,null);assert.ok(entrant.hold>1.49);
  car.vx=1;tick(state,w);assert.equal(entrant.hold,0,'moving interrupts the hold');
  car.vx=0;for(let i=0;i<40;i++)tick(state,w);
  assert.equal(round.phase,'results');assert.equal(entrant.finishedAt,w.time);
  assert.ok(Math.abs(entrant.elapsed!-3.55)<1e-7);
  const finishedAt=entrant.finishedAt;tick(state,w,2);assert.equal(entrant.finishedAt,finishedAt);
  tick(state,w,PARKING_RESULTS_DURATION);assert.equal(state.rounds.length,0);
});

test('target assignment prefers different stalls and rejects oversized or invalid entrants',()=>{
  const w=world(),state=createParking();
  for(const id of ['a','b','c','d']){add(w,id);assert.equal(joinParking(state,lot,w,id,'park'),true);}
  assert.equal(new Set(state.rounds[0].entrants.map(e=>e.targetId)).size,4);
  for(const id of ['e','f','g','h']){add(w,id);assert.equal(joinParking(state,lot,w,id,'park'),true);}
  add(w,'ninth');assert.equal(joinParking(state,lot,w,'ninth','park'),false);
  assert.equal(joinParking(state,lot,w,'a','park'),false,'one activity per player');
  const narrow={...lot,id:'narrow',stalls:[{...lot.stalls[0],width:1}]};
  assert.equal(joinParking(createParking(),narrow,w,'ninth','park'),false);
  assert.equal(joinParking(createParking(),narrow,w,'ninth','queue'),false);
  const person=add(w,'person','person');assert.equal(joinParking(createParking(),lot,w,'person','park'),false);
  person.kind='roadster';person.driver=null;assert.equal(joinParking(createParking(),lot,w,'person','park'),false);
  assert.equal(joinParking(createParking(),lot,w,'ninth','other' as 'park'),false,'unknown activity is rejected');
});

test('a car hovering above the approach cannot claim an earlier queue place',()=>{
  const w=world(),state=createParking(),car=add(w,'p','roadster',-30);
  Object.assign(car,{y:100,supportId:null});
  assert.equal(joinParking(state,lot,w,'p','queue'),false);
  Object.assign(car,{y:0,supportId:'ground'});
  assert.equal(joinParking(state,lot,w,'p','queue'),true);
});

test('queue order, simultaneous claims and overtakes are authoritative and deterministic',()=>{
  for(const reverseEntities of [false,true]){
    const w=world(),state=createParking(),ahead=add(w,'z','roadster',-30),behind=add(w,'a','roadster',-30);
    assert.equal(joinParking(state,lot,w,'z','queue'),true);w.time=.1;
    assert.equal(joinParking(state,lot,w,'a','queue'),true);
    assert.equal(startQueue(state,lot.id,w,'a'),false,'only host can start');
    assert.equal(startQueue(state,lot.id,w,'z'),true);
    assert.equal(joinParking(state,lot,w,'missing','queue'),false);
    place(ahead);place(behind);if(reverseEntities)w.entities.reverse();tick(state,w);
    const round=state.rounds[0],a=round.entrants.find(e=>e.playerId==='a')!,z=round.entrants.find(e=>e.playerId==='z')!;
    assert.equal(a.overtakes,1,'later entrant claims first and passes the leader');
    assert.equal(a.targetId,'a');assert.equal(z.finishedAt,null,'one winner for a simultaneous stall claim');
    place(ahead,lot.stalls[1]);tick(state,w);
    assert.equal(z.overtakes,0);assert.equal(round.phase,'results');
    const at=a.finishedAt;tick(state,w);assert.equal(a.finishedAt,at,'each arrival scores only once');
  }
});

test('nonparticipants and unfinished cars block a stall, while a jumped-in car can land and claim',()=>{
  const w=world(),state=createParking(),car=add(w,'p','roadster',-30);
  assert.equal(joinParking(state,lot,w,'p','queue'),true);assert.equal(startQueue(state,lot.id,w,'p'),true);
  const spectator=makeEntity('spectator','model-3',0,20);Object.assign(spectator,{y:0,supportId:'ground'});w.entities.push(spectator);
  place(car);tick(state,w);assert.equal(state.rounds[0].entrants[0].finishedAt,null);
  spectator.x=80;car.supportId=null;car.y=2;tick(state,w);assert.equal(state.rounds[0].entrants[0].finishedAt,null);
  place(car);tick(state,w);assert.equal(state.rounds[0].phase,'results');
});

test('queue ties use player IDs, staging and active timeouts run on simulation time',()=>{
  const w=world(),state=createParking();add(w,'z','roadster',-30);add(w,'a','roadster',-30);
  assert.equal(joinParking(state,lot,w,'z','queue'),true);assert.equal(joinParking(state,lot,w,'a','queue'),true);
  assert.deepEqual(state.rounds[0].entrants.map(e=>e.playerId),['a','z']);
  tick(state,w,PARKING_QUEUE_WAIT);assert.equal(state.rounds[0].phase,'active');
  assert.equal(state.rounds[0].endsAt,w.time+PARKING_QUEUE_DURATION);
  tick(state,w,PARKING_QUEUE_DURATION);assert.equal(state.rounds[0].phase,'results');
  tick(state,w,PARKING_RESULTS_DURATION);assert.equal(state.rounds.length,0);
  assert.equal(joinParking(state,lot,w,'a','park'),true);
  tick(state,w,PARKING_PARK_DURATION);assert.equal(state.rounds[0].phase,'results');
});

test('the entire painted approach at each authored lot can join and stay queued',()=>{
  const approachPoints=[{x:-300,z:307},{x:47,z:-1190}];
  for(const [index,lot] of PARKING_LOTS.slice(0,2).entries()){
    const w=world(),state=createParking(),point=approachPoints[index],car=add(w,'p','roadster',point.x,point.z);
    assert.equal(joinParking(createParking(),lot,w,'p','park'),false,'Park It begins inside the lot');
    assert.equal(joinParking(state,lot,w,'p','queue'),true,lot.id);
    w.time+=.05;updateParking(state,[lot],w,.05);
    assert.equal(state.rounds[0].entrants[0].playerId,'p','waiting inside the approach keeps the entrant');
    assert.equal(startQueue(state,lot.id,w,'p'),true);
    w.time+=.05;updateParking(state,[lot],w,.05);
    assert.equal(state.rounds[0].entrants.length,1,'the approach remains part of the active play area');
    Object.assign(car,{x:lot.area.x,z:lot.area.z});w.time+=.05;updateParking(state,[lot],w,.05);
    assert.equal(state.rounds[0].entrants.length,1,'driving from the approach into the lot stays in the round');
    Object.assign(car,{x:lot.area.x+lot.area.width,z:lot.area.z});w.time+=.05;updateParking(state,[lot],w,.05);
    assert.equal(state.rounds.length,0,'leaving both areas withdraws the entrant');
  }
});

test('every Supercharger lot supports parking and queue games',()=>{
  for(const lot of PARKING_LOTS.filter(l=>l.id.startsWith('charger-'))){
    const w=world(),car=add(w,'p','roadster',lot.approach.x,lot.approach.z);
    const queue=createParking();
    assert.equal(joinParking(queue,lot,w,'p','queue'),true,lot.id);
    assert.equal(startQueue(queue,lot.id,w,'p'),true,lot.id);
    Object.assign(car,{x:lot.area.x,z:lot.area.z});
    assert.equal(joinParking(createParking(),lot,w,'p','park'),true,lot.id);
  }
});

test('leave, missing player, changed vehicle and leaving the lot clean up entrants',()=>{
  const w=world(),state=createParking(),a=add(w,'a','roadster',-30),b=add(w,'b','roadster',-30);
  assert.equal(joinParking(state,lot,w,'a','queue'),true);assert.equal(joinParking(state,lot,w,'b','queue'),true);
  a.x=0;tick(state,w);assert.deepEqual(state.rounds[0].entrants.map(e=>e.playerId),['b']);
  assert.equal(state.rounds[0].hostId,'b');
  w.players[1].entityId='different';tick(state,w);assert.equal(state.rounds.length,0);
  w.players[1].entityId=b.id;assert.equal(joinParking(state,lot,w,'b','queue'),true);
  leaveParking(state,'b');assert.equal(state.rounds.length,0);
  assert.equal(joinParking(state,lot,w,'b','park'),true);b.x=101;tick(state,w);assert.equal(state.rounds.length,0);
  b.x=0;assert.equal(joinParking(state,lot,w,'b','park'),true);
  w.players=w.players.filter(p=>p.id!=='b');tick(state,w);assert.equal(state.rounds.length,0);
});
