import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addPlayer, chooseVehicle, createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { FERRY_DOCKS, ISLAND_TRACK, ROADS, isRocketIsland, supportHeight, supportNormal } from '../shared/map';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';
import { ovalBankSurface } from '../shared/oval-bank';
import { ISLAND_JUMPS, islandJumpHeight, islandJumpSlope, sweepIslandJump, sweepIslandJumpWall } from '../shared/island-jumps';
import { PARKING_LOTS } from '../shared/parking-lots';
import { body, contact, dimensions } from '../shared/physics';
import { addIslandJumps } from '../src/island-jumps';

const distanceToSegment=(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number})=>{
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
};
function setup(kind:'model-3'|'roadster'){
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const player=addPlayer(world,'p','Driver');
  assert.ok(chooseVehicle(world,'p',kind));
  const car=world.entities.find(e=>e.id===player.entityId)!;assert.equal(car.kind,kind);
  return {world,car};
}

test('jump footprints, approaches and fast landing corridors remain on the island and clear of its attractions',()=>{
  for(const jump of ISLAND_JUMPS)for(let x=jump.start-30;x<=jump.end+150;x+=5)for(const z of [jump.z-jump.width/2,jump.z,jump.z+jump.width/2]){
    assert.ok(isRocketIsland(x,z),`${jump.id}: unsupported corridor at ${x},${z}`);
    // The active banked oval has a 30 m shoulder around this route.
    for(let i=0;i<ISLAND_TRACK.length;i++)assert.ok(distanceToSegment(x,z,ISLAND_TRACK[i],ISLAND_TRACK[(i+1)%ISLAND_TRACK.length])>31,
      `${jump.id}: oval at ${x},${z}`);
    assert.equal(ovalBankSurface(x,z),null,`${jump.id}: banked oval at ${x},${z}`);
    assert.ok(x<ISLAND_BANK.startX||x>ISLAND_BANK.endX||Math.abs(z-ISLAND_BANK.z)>ISLAND_BANK.halfWidth);
    assert.ok(Math.hypot(x-ISLAND_CLIFF.x,z-ISLAND_CLIFF.z)>ISLAND_CLIFF.radius+ISLAND_CLIFF.width);
    assert.ok(Math.hypot(x-FERRY_DOCKS.island.x,z-FERRY_DOCKS.island.z)>100);
    for(const lot of PARKING_LOTS)assert.ok(Math.abs(x-lot.area.x)>lot.area.width/2||Math.abs(z-lot.area.z)>lot.area.length/2);
    for(const road of ROADS.filter(r=>r.kind==='island')){
      const angle=road.angle??0,dx=x-road.x,dz=z-road.z;
      const across=dx*Math.cos(angle)-dz*Math.sin(angle),along=dx*Math.sin(angle)+dz*Math.cos(angle);
      assert.ok(Math.abs(across)>road.w/2+3||Math.abs(along)>road.d/2+3,`${jump.id}: road at ${x},${z}`);
    }
  }
});

test('visible wedge vertices, support heights, normals and swept landings agree',()=>{
  const scene=new T.Scene();addIslandJumps(scene);
  for(const jump of ISLAND_JUMPS){
    const mesh=scene.getObjectByName(`island-jump-${jump.id}`) as T.Mesh;
    assert.ok(mesh);
    const positions=mesh.geometry.getAttribute('position');
    assert.equal(positions.getX(0),jump.start);assert.equal(positions.getY(0),0);
    assert.equal(positions.getX(4),jump.end);assert.equal(positions.getY(4),jump.height);
    const x=(jump.start+jump.end)/2,slope=islandJumpSlope(jump),normal=supportNormal('island-jump',x,jump.z)!;
    assert.equal(supportHeight('island-jump',x,jump.z),jump.height/2);
    assert.ok(Math.abs(normal.x+normal.y*slope)<1e-10);
    const hit=sweepIslandJump({x,y:15,z:jump.z},{x,y:-3,z:jump.z})!;
    assert.equal(hit.jump.id,jump.id);assert.ok(Math.abs(hit.y-islandJumpHeight(x,jump.z)!)<1e-10);
    assert.equal(sweepIslandJump({x,y:15,z:jump.z+20},{x,y:-3,z:jump.z+20}),null);
  }
});

test('ordinary and Rocket cars drive each ramp, launch upward, and land on supported ground',()=>{
  for(const jump of ISLAND_JUMPS)for(const kind of ['model-3','roadster'] as const){
    const {world,car}=setup(kind);
    Object.assign(car,{x:jump.start-25,z:jump.z,y:0,yaw:-Math.PI/2,speed:20,supportId:'ground'});
    let climbed=false,launched=false,landed=false,peak=0;
    for(let i=0;i<250;i++){
      step(world,new Map([['p',launched?NEUTRAL:{...NEUTRAL,throttle:1}]]),.05);
      climbed ||= car.supportId==='island-jump';
      if(climbed&&!launched&&car.supportId===null){launched=true;assert.ok(car.vy>0,`${jump.id} ${kind}: launch has upward momentum`);}
      peak=Math.max(peak,car.y);
      if(launched&&car.supportId==='ground'){landed=true;break;}
    }
    assert.ok(climbed,`${jump.id} ${kind}: never climbed`);
    assert.ok(launched,`${jump.id} ${kind}: never launched`);
    assert.ok(peak>jump.height,`${jump.id} ${kind}: peak ${peak}`);
    assert.ok(landed,`${jump.id} ${kind}: never landed`);
    assert.ok(car.x>jump.end+10,`${jump.id} ${kind}: landing x=${car.x}`);
  }
});

test('airborne cars land on the ramp surface and a Rocket jump uses its normal',()=>{
  const {world,car}=setup('roadster');
  const jump=ISLAND_JUMPS[0],x=(jump.start+jump.end)/2;
  Object.assign(car,{x,z:jump.z,y:10,yaw:-Math.PI/2,speed:0,vx:0,vy:-5,vz:0,supportId:null});
  for(let i=0;i<100&&car.supportId===null;i++)step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(car.supportId,'island-jump');
  assert.ok(Math.abs(car.y-islandJumpHeight(car.x,car.z)!)<1e-8);
  step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
  assert.equal(car.supportId,null);assert.ok(car.vx<-.5&&car.vy>10);
});

test('a full-speed Rocket launch lands inside the verified infield corridor',()=>{
  for(const jump of ISLAND_JUMPS){
    const {world,car}=setup('roadster');
    Object.assign(car,{x:jump.start-25,z:jump.z,y:0,yaw:-Math.PI/2,speed:72,supportId:'ground'});
    let climbed=false,launched=false,landed=false;
    for(let i=0;i<200;i++){
      step(world,new Map([['p',launched?NEUTRAL:{...NEUTRAL,throttle:1,boost:true}]]),.05);
      climbed ||= car.supportId==='island-jump';
      if(climbed&&car.supportId===null)launched=true;
      if(launched&&car.supportId==='ground'){landed=true;break;}
    }
    assert.ok(landed,`${jump.id}: high-speed launch did not land`);
    assert.ok(car.x>jump.end&&car.x<=jump.end+150,`${jump.id}: landing at ${car.x}`);
  }
});

test('grounded cars cannot enter the high end or sides through the visible ramp',()=>{
  const jump=ISLAND_JUMPS[0];
  for(const approach of [
    {x:jump.end+10,z:jump.z,yaw:Math.PI/2},
    {x:(jump.start+jump.end)/2,z:jump.z+jump.width/2+10,yaw:0},
  ]){
    const {world,car}=setup('model-3');
    Object.assign(car,{...approach,y:0,speed:14,supportId:'ground'});
    for(let i=0;i<25;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.equal(car.supportId,'ground');
    assert.equal(islandJumpHeight(car.x,car.z),null,'ramp side stopped entry');
  }
});

test('airborne cars bounce off both triangular sides and the high end of each ramp',()=>{
  for(const jump of ISLAND_JUMPS)for(const approach of [
    {x:jump.end+3,z:jump.z,yaw:Math.PI/2,vx:-12,vz:0,axis:'x' as const},
    {x:(jump.start+jump.end)/2,z:jump.z+jump.width/2+3,yaw:0,vx:0,vz:-12,axis:'positive-z' as const},
    {x:(jump.start+jump.end)/2,z:jump.z-jump.width/2-3,yaw:Math.PI,vx:0,vz:12,axis:'negative-z' as const},
  ]){
    const {world,car}=setup('model-3');
    Object.assign(car,{...approach,y:1.5,vy:0,speed:12,supportId:null});
    for(let i=0;i<30;i++)step(world,new Map([['p',NEUTRAL]]),.05);
    if(approach.axis==='x')assert.ok(car.x>=jump.end,`${jump.id}: passed through end at ${car.x}`);
    if(approach.axis==='positive-z')assert.ok(car.z>=jump.z+jump.width/2,`${jump.id}: passed through side at ${car.z}`);
    if(approach.axis==='negative-z')assert.ok(car.z<=jump.z-jump.width/2,`${jump.id}: passed through side at ${car.z}`);
  }
});

test('airborne cars clear a ramp above its top and beside its finite faces',()=>{
  const jump=ISLAND_JUMPS[0];
  for(const setupPose of [
    {x:jump.end+3,z:jump.z,y:7},
    {x:jump.end+3,z:jump.z+jump.width/2+10,y:2},
  ]){
    const {world,car}=setup('model-3');
    Object.assign(car,{...setupPose,yaw:Math.PI/2,vx:-12,vy:0,vz:0,speed:12,supportId:null});
    for(let i=0;i<8;i++)step(world,new Map([['p',NEUTRAL]]),.05);
    assert.ok(car.x<jump.end,`an unobstructed pass stopped at ${car.x}`);
  }
});

test('swept walls catch fast crossings and respect their bounded triangular faces',()=>{
  const jump=ISLAND_JUMPS[0],extent={halfWidth:2,halfLength:1,yaw:0,minY:0,maxY:2};
  const hit=sweepIslandJumpWall({x:jump.end+10,y:2,z:jump.z},{x:jump.start-10,y:2,z:jump.z},extent)!;
  assert.equal(hit.normal.x,1);assert.ok(hit.t>0&&hit.t<1);assert.ok(hit.x>jump.end+extent.halfWidth);
  assert.equal(sweepIslandJumpWall({x:jump.end+10,y:5,z:jump.z},{x:jump.start-10,y:5,z:jump.z},extent),null);
  assert.equal(sweepIslandJumpWall({x:jump.end+10,y:2,z:jump.z+20},{x:jump.start-10,y:2,z:jump.z+20},extent),null);
});

test('a diagonal car passes the high-end corner when its oriented footprint stays clear',()=>{
  const jump=ISLAND_JUMPS[0],{world,car}=setup('roadster');
  Object.assign(car,{x:jump.end+2.6,z:jump.z+jump.width/2+2.2,y:1,yaw:Math.PI/4,vx:-10,vy:0,vz:0,speed:10/Math.sqrt(2),supportId:null});
  const footprint={x:(jump.start+jump.end)/2,z:jump.z,w:jump.end-jump.start,d:jump.width,yaw:0};
  assert.equal(contact(body(car),footprint),null);
  step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(contact(body(car),footprint),null);
  assert.ok(car.vx< -9.9,`a clear corner reversed speed to ${car.vx}`);
  assert.ok(car.x<jump.end+2.2,`a clear corner stopped the car at ${car.x}`);
});

test('a diagonal car still collides with the high end when its footprint reaches it',()=>{
  const jump=ISLAND_JUMPS[0],{world,car}=setup('roadster');
  Object.assign(car,{x:jump.end+2.6,z:jump.z+jump.width/2+1,y:1,yaw:Math.PI/4,vx:-10,vy:0,vz:0,speed:10/Math.sqrt(2),supportId:null});
  const footprint={x:(jump.start+jump.end)/2,z:jump.z,w:jump.end-jump.start,d:jump.width,yaw:0};
  assert.equal(contact(body(car),footprint),null);
  step(world,new Map([['p',NEUTRAL]]),.05);
  assert.ok(car.vx+car.vz>0,`an impact failed to deflect the car: ${car.vx},${car.vz}`);
  assert.equal(contact(body(car),footprint),null,'collision resolution leaves the car outside the ramp');
});

test('hovering cars cannot rotate their nose into a ramp while their center moves away',()=>{
  const jump=ISLAND_JUMPS[0],{world,car}=setup('roadster');
  Object.assign(car,{x:jump.end+1.01,z:jump.z,y:1,yaw:0,vx:.1,vy:0,vz:0,speed:0,supportId:null});
  const footprint={x:(jump.start+jump.end)/2,z:jump.z,w:jump.end-jump.start,d:jump.width,yaw:0};
  for(let i=0;i<20;i++){
    step(world,new Map([['p',{...NEUTRAL,hover:true,steer:-1}]]),.05);
    assert.equal(contact(body(car),footprint),null,`rotation entered the ramp on tick ${i}`);
  }
  assert.ok(car.yaw<-.5,'the fixture actually turned');
});

test('a car rotating into the high end stays outside when it lands during that tick',()=>{
  const jump=ISLAND_JUMPS[0],{world,car}=setup('roadster');
  Object.assign(car,{x:jump.end+1.01,z:jump.z,y:.01,yaw:0,yawRate:-1.6,vx:.1,vy:-1,vz:0,speed:0,supportId:null});
  const footprint={x:(jump.start+jump.end)/2,z:jump.z,w:jump.end-jump.start,d:jump.width,yaw:0};
  step(world,new Map([['p',{...NEUTRAL,steer:-1}]]),.05);
  assert.equal(car.supportId,'ground');
  assert.equal(car.y,0);
  assert.ok(car.yaw<-.05,'the fixture actually turned');
  assert.equal(contact(body(car),footprint),null,'landing left the body intersecting the ramp');
});

test('vehicle collision separation cannot push grounded or airborne cars underneath a ramp side',()=>{
  for(const support of ['ground',null] as const){
    const jump=ISLAND_JUMPS[0],{world,car}=setup('model-3');
    const halfWidth=dimensions(car.kind).width/2,edge=jump.z+jump.width/2,y=support===null?1:0;
    Object.assign(car,{x:(jump.start+jump.end)/2,z:edge+halfWidth+.02,y,yaw:-Math.PI/2,speed:0,supportId:support});
    const pusher=makeEntity('pusher','model-3',car.x,car.z+halfWidth*1.5);
    Object.assign(pusher,{y,yaw:-Math.PI/2,speed:0,supportId:support});world.entities.push(pusher);
    step(world,new Map([['p',NEUTRAL]]),.05);
    assert.equal(car.supportId,support);
    assert.ok(car.z>=edge+halfWidth,`separation pushed a ${support??'flying'} car through the side to ${car.z}`);
    assert.equal(islandJumpHeight(car.x,car.z),null);
  }
});

test('separation respects an angled vehicle footprint at a ramp side',()=>{
  for(const support of ['ground',null] as const){
    const jump=ISLAND_JUMPS[0],{world,car}=setup('model-3');
    const size=dimensions(car.kind),yaw=Math.PI/4,edge=jump.z+jump.width/2,y=support===null?1:0;
    const halfZ=(size.width+size.length)/(2*Math.sqrt(2));
    Object.assign(car,{x:(jump.start+jump.end)/2,z:edge+halfZ+.02,y,yaw,speed:0,supportId:support});
    const pusher=makeEntity('pusher','model-3',car.x,car.z+2);
    Object.assign(pusher,{y,yaw,speed:0,supportId:support});world.entities.push(pusher);
    assert.ok(contact(body(car),body(pusher)),'fixture starts with two overlapping cars');
    step(world,new Map([['p',NEUTRAL]]),.05);
    assert.equal(car.supportId,support);
    assert.ok(car.z>=edge+halfZ,`separation pushed an angled ${support??'flying'} car through the side to ${car.z}`);
  }
});
