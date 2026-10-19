import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, interact, makeEntity, NEUTRAL, resetPlayer, step, travelDome } from '../shared/game';
import { DOME } from '../shared/dome';
import { domeRoofHeight, domeSurface, DOME_PERIMETER, isLand, isRocketIsland } from '../shared/map';
import { VEHICLE_IDS, VEHICLES } from '../shared/vehicles';
import { body, contact } from '../shared/physics';

function setup(){
  const world=createWorld(),player=addPlayer(world,'one','One');
  const car=world.entities.find(e=>e.id===player.entityId)!;world.entities=[car];
  return {world,player,car};
}

test('shared capsule surface is continuous with inward unit normals',()=>{
  assert.ok(isLand(DOME.x,DOME.z));
  for(const s of [0,2*DOME.flatHalfWidth,2*DOME.flatHalfWidth+Math.PI*DOME.radius,4*DOME.flatHalfWidth+Math.PI*DOME.radius,DOME_PERIMETER]){
    const a=domeSurface(s-1e-6),b=domeSurface(s+1e-6);
    assert.ok(Math.hypot(a.y-b.y,a.z-b.z)<1e-4);
    assert.ok(Math.abs(b.tangentY*b.normalY+b.tangentZ*b.normalZ)<1e-9);
    assert.ok(Math.abs(Math.hypot(b.normalY,b.normalZ)-1)<1e-9);
  }
});

test('travel places the first car on a direct kickoff, keeps resources, and supports local reset and walking home',()=>{
  const {world,player,car}=setup();car.air=41;car.health=73;car.autopilot=true;
  assert.equal(travelDome(world,'one'),true);
  assert.deepEqual([car.x,car.y,car.z,car.yaw],[DOME.x-30,0,DOME.z,-Math.PI/2]);
  assert.equal(car.inDome,true);assert.equal(car.supportId,'dome');assert.equal(car.autopilot,false);
  assert.deepEqual([car.air,car.health],[41,73]);
  car.x+=10;resetPlayer(world,'one');assert.equal(car.x,DOME.x-30);assert.equal(car.inDome,true);
  interact(world,'one');const person=world.entities.find(e=>e.id===player.entityId)!;
  assert.equal(person.kind,'person');assert.equal(person.inDome,true);
  assert.equal(travelDome(world,'one'),true);assert.equal(person.inDome,false);
});

test('each catalog vehicle can safely enter the dome and multiple players get distinct slots',()=>{
  for(const id of VEHICLE_IDS){
    const {world,player}=setup();
    const car=makeEntity('catalog-car',id,40,60,'one');world.entities=[car];player.entityId=car.id;
    assert.ok(travelDome(world,'one'));assert.equal(car.inDome,true);
    assert.ok(travelDome(world,'one'));assert.equal(car.inDome,false);
  }
  const {world,player}=setup();
  const second=addPlayer(world,'two','Two');
  assert.ok(travelDome(world,'one'));assert.ok(travelDome(world,'two'));
  const a=world.entities.find(e=>e.id===player.entityId)!,b=world.entities.find(e=>e.id===second.entityId)!;
  assert.equal(contact(body(a),body(b)),null);
});

test('a retrofitted car keeps its upgrades in the dome and can use the walls',()=>{
  const {world,player}=setup(),car=makeEntity('taken','zoox',40,60,'one');
  world.entities=[car];player.entityId=car.id;car.upgrades.rocket=true;car.upgrades.motor=true;
  assert.ok(travelDome(world,'one'));assert.equal(car.supportId,'dome');assert.ok(car.upgrades.rocket&&car.upgrades.motor);
  Object.assign(car,{x:DOME.x-30,z:DOME.z,domeS:DOME.flatHalfWidth,yaw:0,speed:45});
  let peak=0;for(let i=0;i<120;i++){step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);peak=Math.max(peak,car.y);assert.equal(car.supportId,'dome');}
  assert.ok(peak>25,`retrofitted car climbed to ${peak} m`);
  assert.ok(travelDome(world,'one'));assert.ok(car.upgrades.rocket&&car.upgrades.motor);
});

test('Rocket drives from floor up wall and onto ceiling, can steer and launch inward',()=>{
  const {world,car}=setup();assert.ok(travelDome(world,'one'));
  Object.assign(car,{x:DOME.x-30,z:DOME.z,domeS:DOME.flatHalfWidth,yaw:0,speed:45});
  let peak=0;
  for(let i=0;i<100;i++){
    step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
    peak=Math.max(peak,car.y);assert.equal(car.supportId,'dome');assert.ok(car.inDome);
    if(car.y>49.999&&Math.abs(car.z-DOME.z)<DOME.flatHalfWidth-1)break;
  }
  assert.ok(peak>49.99,`reached ${peak} m`);
  const x=car.x;
  for(let i=0;i<8;i++)step(world,new Map([['one',{...NEUTRAL,steer:1,throttle:1}]]),.05);
  assert.ok(Math.abs(car.x-x)>.1);assert.equal(car.supportId,'dome');
  const before=car.air;step(world,new Map([['one',{...NEUTRAL,jump:1}]]),.05);
  assert.equal(car.supportId,null);assert.ok(car.air<before);assert.ok(car.vy<0);
});

test('ordinary cars remain enclosed without adhesion; Rocket cannot escape through a goal',()=>{
  const {world,player}=setup();assert.ok(chooseVehicle(world,'one','model-3'));
  let car=world.entities.find(e=>e.id===player.entityId)!;assert.ok(travelDome(world,'one'));
  Object.assign(car,{x:DOME.x-30,z:DOME.z,yaw:0,speed:40});
  for(let i=0;i<80;i++)step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  assert.equal(car.supportId,'ground');assert.ok(Math.abs(car.z-DOME.z)<=DOME.flatHalfWidth-VEHICLES['model-3'].width/2+1e-6);
  assert.ok(chooseVehicle(world,'one','roadster'));car=world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(car,{x:DOME.x,z:DOME.z,y:0,domeS:DOME.flatHalfWidth,yaw:-Math.PI/2,speed:56});
  for(let i=0;i<80;i++)step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  assert.ok(car.x<=DOME.x+DOME.halfLength-VEHICLES.roadster.length/2+1e-6);
  assert.equal(car.inDome,true);assert.equal(car.supportId,'dome');
});

test('every vehicle drives through the stadium gate in both directions without teleporting',()=>{
  for(const kind of VEHICLE_IDS){
    const {world,player}=setup();world.pickups=[];
    const car=makeEntity('gate-car',kind,DOME.x,120,'one');world.entities=[car];player.entityId=car.id;
    Object.assign(car,{yaw:Math.PI,air:42,health:83});
    for(let i=0;i<600&&!car.inDome;i++)step(world,new Map([['one',{...NEUTRAL,throttle:.35}]]),.05);
    assert.equal(car.inDome,true,`${kind} enters`);
    assert.ok(car.z<DOME.z,`${kind} keeps its driven position`);
    assert.equal(car.domeReturn,'sf');assert.deepEqual([car.air,car.health],[42,83]);
    Object.assign(car,{yaw:0,speed:4,vx:0,vz:-4});
    for(let i=0;i<200&&car.inDome;i++)step(world,new Map([['one',{...NEUTRAL,throttle:.35}]]),.05);
    assert.equal(car.inDome,false,`${kind} exits`);
    assert.ok(car.z>DOME.z-30,`${kind} leaves at the gate without teleporting`);
    assert.ok(car.speed>0,`${kind} retains motion`);
    assert.deepEqual([car.air,car.health],[42,83]);
  }
});

test('a grounded approach from the city joins the dome without teleporting and can leave by shortcut',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x,z:DOME.z-DOME.flatHalfWidth-8,y:0,supportId:'ground',yaw:Math.PI,speed:12,air:42,health:83});
  for(let i=0;i<50&&!car.inDome;i++)step(world,new Map([['one',{...NEUTRAL,throttle:1}]]),.05);
  assert.equal(car.inDome,true);assert.ok(car.z<DOME.z-DOME.flatHalfWidth+10,'entry keeps the driven position');
  assert.ok(car.speed>0,'entry preserves motion');assert.equal(car.air,42);assert.equal(car.health,83);
  assert.ok(travelDome(world,'one'));assert.equal(car.inDome,false);
  assert.ok(!isRocketIsland(car.x,car.z),'the explicit leave action returns to the city');
});

test('natural entry disables autonomy while preserving position and resources',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x-DOME.halfLength+2,z:DOME.z,y:0,supportId:'ground',yaw:-Math.PI/2,speed:8,autopilot:true,air:42,health:83});
  const before=car.x;step(world,new Map(),.05);
  assert.equal(car.inDome,true);assert.equal(car.autopilot,false);assert.ok(car.x>before&&car.x<before+2);
  assert.ok(car.speed>0);assert.equal(car.air,42);assert.equal(car.health,83);
});

test('an airborne fly-in joins the capsule and can hit the ball before landing',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x-6,z:DOME.z,y:3.5,supportId:null,yaw:-Math.PI/2,vx:15,vy:-.1,air:42,health:83});
  for(let i=0;i<8&&world.soccer.ball.vx===0;i++)step(world,new Map(),.05);
  assert.equal(car.inDome,true);assert.equal(car.supportId,null);
  assert.ok(world.soccer.ball.vx>0,'the authoritative ball reacts to a natural fly-in');
  assert.ok(car.x<DOME.x+3&&car.y>0,'entry preserves the airborne trajectory');
  assert.equal(car.air,42);assert.equal(car.health,83);
});

test('descent from above lands on the arena roof rather than clipping through',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x-15,z:DOME.z,y:52,supportId:null,vy:-8,vx:0,air:42,health:83,autopilot:false});
  for(let i=0;i<30&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.inDome,false);assert.equal(car.supportId,'dome-roof');assert.equal(car.y,2*DOME.radius);
  assert.equal(car.air,42);assert.equal(car.health,83);
});

test('an ascending car crossing the curved exterior lands on the roof',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x-30,z:DOME.z+40,y:43.4,supportId:null,yaw:Math.PI,vx:0,vz:-65,vy:2,autopilot:false});
  assert.ok(car.y>domeRoofHeight(car.x,car.z-VEHICLES.roadster.length/2)!,'the entire car starts above the roof');
  for(let i=0;i<3&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.inDome,false);assert.equal(car.supportId,'dome-roof');
  assert.equal(car.y,domeRoofHeight(car.x,car.z));
});

test('airborne side approaches still enter below the roof',()=>{
  for(const fromEnd of [false,true]){
    const {world,car}=setup();world.pickups=[];
    Object.assign(car,fromEnd
      ?{x:DOME.x-DOME.halfLength-10,z:DOME.z,y:10,vx:30,vz:0}
      // Fly above the solid grandstand, through the transparent shell.
      :{x:DOME.x-30,z:DOME.z+DOME.flatHalfWidth+DOME.radius+10,y:24,vx:0,vz:-30},
      {supportId:null,vy:0,autopilot:false});
    for(let i=0;i<40&&!car.inDome;i++)step(world,new Map(),.05);
    assert.equal(car.inDome,true,fromEnd?'end fly-in':'side fly-in');
    assert.notEqual(car.supportId,'dome-roof');
  }
});

test('passing above the roof or landing outside the capsule does not enter the dome',()=>{
  const {world,car}=setup();world.pickups=[];
  Object.assign(car,{x:DOME.x-40,z:DOME.z,y:65,supportId:null,yaw:-Math.PI/2,vx:35,vy:0,air:42,health:83});
  for(let i=0;i<20;i++){step(world,new Map(),.05);assert.equal(car.inDome,false,'above-roof flight stays in the Bay world');}
  assert.ok(car.y>2*DOME.radius);
  Object.assign(car,{x:DOME.x+DOME.halfLength+12,z:DOME.z,y:.3,supportId:null,vx:0,vy:-5,vz:0,speed:0,pushX:0,pushZ:0});
  for(let i=0;i<10;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,'ground');assert.equal(car.inDome,false,'the plaza outside the arena is not its interior');
});

test('ordinary cars respect yaw-projected body length at both side walls',()=>{
  for(const kind of ['model-3','tesla-semi'] as const)for(const yaw of [0,Math.PI/4,Math.PI/2])for(const side of [-1,1]){
    const {world,player}=setup();world.pickups=[];assert.ok(chooseVehicle(world,'one',kind));assert.ok(travelDome(world,'one'));
    const car=world.entities.find(e=>e.id===player.entityId)!,size=VEHICLES[kind];
    const halfZ=(Math.abs(Math.sin(yaw))*size.width+Math.abs(Math.cos(yaw))*size.length)/2;
    Object.assign(car,{x:DOME.x-30,z:DOME.z+side*(DOME.flatHalfWidth-size.width/2+.1),yaw,speed:0});
    step(world,new Map(),.05);
    assert.ok(Math.abs(car.z-DOME.z)+halfZ<=DOME.flatHalfWidth+1e-8,`${kind}, yaw ${yaw}, side ${side}`);
  }
});

test('64 players can travel to distinct floor slots and reset without overlap',()=>{
  const world=createWorld();world.entities=[];
  for(let i=0;i<64;i++)addPlayer(world,`p${i}`,'Driver');
  for(let i=0;i<64;i++)assert.ok(travelDome(world,`p${i}`),`no floor slot for player ${i}`);
  resetPlayer(world,'p0');
  const cars=world.entities.filter(e=>e.driver);
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)assert.equal(contact(body(cars[i]),body(cars[j])),null);
});

test('opposed Rockets collide along the wall and ceiling instead of passing through',()=>{
  for(const center of [2*DOME.flatHalfWidth+Math.PI*DOME.radius/2,3*DOME.flatHalfWidth+Math.PI*DOME.radius]){
    const world=createWorld();world.players=[];world.pickups=[];
    const cars=[center-2.1,center+2.1].map((arc,i)=>{
      const surface=domeSurface(arc),car=makeEntity(`car-${i}`,'roadster',DOME.x,surface.z);
      Object.assign(car,{inDome:true,supportId:'dome',domeS:arc,y:surface.y,yaw:0,speed:i===0?-8:8});return car;
    });
    world.entities=cars;step(world,new Map(),.05);
    assert.ok(cars[1].domeS!-cars[0].domeS!>=VEHICLES.roadster.length,'cars are separated on the surface');
    assert.ok(cars[0].speed>0&&cars[1].speed<0,'both cars rebound');
    assert.ok(cars.every(car=>car.supportId==='dome'));
  }
});

test('collisions span the dome floor seam and include ordinary floor vehicles',()=>{
  const world=createWorld();world.players=[];world.pickups=[];
  const cars=[DOME_PERIMETER-1.95,1.95].map((arc,i)=>{
    const surface=domeSurface(arc),car=makeEntity(`seam-${i}`,'roadster',DOME.x,surface.z);
    Object.assign(car,{inDome:true,supportId:'dome',domeS:arc,y:surface.y,yaw:0});return car;
  });
  world.entities=cars;step(world,new Map(),.05);
  const acrossSeam=(cars[1].domeS!-cars[0].domeS!+DOME_PERIMETER)%DOME_PERIMETER;
  assert.ok(acrossSeam>=VEHICLES.roadster.length,'collision resolves across the wrapped arc');

  const rocket=makeEntity('rocket','roadster',DOME.x,DOME.z-2.15);
  const ordinary=makeEntity('ordinary','model-3',DOME.x,DOME.z+2.15);
  Object.assign(rocket,{inDome:true,supportId:'dome',domeS:DOME.flatHalfWidth-2.15,yaw:0,speed:-5});
  Object.assign(ordinary,{inDome:true,yaw:0,speed:5});
  world.entities=[rocket,ordinary];step(world,new Map(),.05);
  assert.ok(ordinary.z-rocket.z>=(VEHICLES.roadster.length+VEHICLES['model-3'].length)/2);
  assert.ok(rocket.speed>0&&ordinary.speed<0,'both cars rebound on the flat floor');
  assert.equal(rocket.supportId,'dome');assert.equal(ordinary.supportId,'ground');
});

test('an airborne car strikes a Rocket on the wall using its real 3D orientation',()=>{
  const world=createWorld();world.players=[];world.pickups=[];
  const arc=2*DOME.flatHalfWidth+Math.PI*DOME.radius/2,surface=domeSurface(arc);
  const wall=makeEntity('wall','roadster',DOME.x,surface.z);
  Object.assign(wall,{inDome:true,supportId:'dome',domeS:arc,y:surface.y,yaw:0});
  const air=makeEntity('air','roadster',DOME.x,surface.z-4);
  Object.assign(air,{inDome:true,supportId:null,y:surface.y-VEHICLES.roadster.height/2,yaw:0,vz:12});
  world.entities=[wall,air];step(world,new Map(),.05);
  assert.ok(air.vz<0,'the incoming car rebounds instead of crossing the wall car');
  assert.equal(wall.supportId,'dome');assert.equal(air.supportId,null);
});
