import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, makeEntity } from '../shared/game';
import { BUILDINGS, DOME_PERIMETER, OVERPASS, STUNT_RAMP, buildingRoofHeight, isSurface, rampHeight, terrainHeight } from '../shared/map';
import { ISLAND_JUMPS, islandJumpHeight } from '../shared/island-jumps';
import { body, contact } from '../shared/physics';
import { remotePathClear, RemotePresentation } from '../src/remote-presentation';

function setup(){
  const world=createEmptyWorld(),player=addPlayer(world,'local','Local');
  const local=world.entities.find(entity=>entity.id===player.entityId)!;
  const remote=makeEntity('remote','model-3',0,0,'other');
  Object.assign(remote,{y:0,supportId:'ground',vx:20});world.entities.push(remote);
  return {world,local,remote,presentation:new RemotePresentation()};
}
function remote(world:ReturnType<typeof createEmptyWorld>){return world.entities.find(entity=>entity.id==='remote')!;}

test('interpolates a buffered remote pose and wrapped angles without changing local authority',()=>{
  const {world,local,remote:car,presentation}=setup();
  Object.assign(car,{x:0,y:0,z:0,yaw:Math.PI-.1,pitch:.1,roll:Math.PI-.2,steering:0});
  presentation.snapshot(world,'local',10);
  Object.assign(car,{x:2,y:1,z:4,yaw:-Math.PI+.1,pitch:.3,roll:-Math.PI+.2,steering:1});
  presentation.snapshot(world,'local',12);
  const authority=structuredClone(world),shown=presentation.render(world,'local',11),actual=remote(shown);
  assert.equal(actual.x,1);assert.equal(actual.y,.5);assert.equal(actual.z,2);
  assert.ok(Math.abs(Math.abs(actual.yaw)-Math.PI)<1e-9);
  assert.ok(Math.abs(Math.abs(actual.roll)-Math.PI)<1e-9);
  assert.ok(Math.abs(actual.pitch-.2)<1e-9);assert.equal(actual.steering,.5);
  assert.equal(shown.entities.find(entity=>entity.id===local.id),local);
  assert.deepEqual(world,authority,'presentation must never mutate the authoritative world');
  assert.notEqual(shown,world);
});

test('samples are copied, support irregular snapshot ticks, and do not revive missing entities',()=>{
  const {world,remote:car,presentation}=setup();
  presentation.snapshot(world,'local',1);car.x=3;presentation.snapshot(world,'local',4);
  car.x=7;presentation.snapshot(world,'local',8);
  assert.equal(remote(presentation.render(world,'local',6)).x,5);
  world.entities=world.entities.filter(entity=>entity.id!=='remote');
  presentation.snapshot(world,'local',10);
  assert.equal(presentation.render(world,'local',6).entities.some(entity=>entity.id==='remote'),false);
  const replacement=makeEntity('remote','model-3',40,0,'other');world.entities.push(replacement);
  presentation.snapshot(world,'local',12);
  assert.equal(remote(presentation.render(world,'local',6)).x,40,'reused IDs start a new history');
});

test('large relocations, collisions, ownership and support changes do not blend across discontinuities',()=>{
  for(const change of ['relocation','damage','driver','kind','support','gap'] as const){
    const {world,remote:car,presentation}=setup();
    presentation.snapshot(world,'local',0);
    if(change==='relocation')car.x=50;
    else if(change==='damage'){car.x=2;car.health=80;}
    else if(change==='driver'){car.x=2;car.driver='new-driver';}
    else if(change==='kind'){car.x=2;car.kind='roadster';}
    else if(change==='support'){car.x=2;car.supportId=null;}
    else car.x=2;
    presentation.snapshot(world,'local',change==='gap'?12:2);
    assert.equal(remote(presentation.render(world,'local',1)).x,car.x,change);
  }
});

test('bounds extrapolation and holds the final pose during a stalled snapshot stream',()=>{
  const {world,remote:car,presentation}=setup();
  Object.assign(car,{x:0,vx:20,yawRate:1});presentation.snapshot(world,'local',0);
  car.x=2;presentation.snapshot(world,'local',2);
  const early=remote(presentation.render(world,'local',3));
  assert.equal(early.x,3);assert.equal(early.yaw,.05);
  const capped=remote(presentation.render(world,'local',4));
  assert.equal(capped.x,4);assert.equal(capped.yaw,.1);
  assert.equal(remote(presentation.render(world,'local',100)).x,4,'no unbounded travel');
  assert.equal(remote(presentation.render(world,'local',null)).x,2,'missing clock uses authority');
  assert.equal(remote(presentation.render(world,'local',NaN)).x,2);
});

test('does not interpolate a remote car through a curved building roof',()=>{
  const {world,remote:car,presentation}=setup(),building=BUILDINGS.find(item=>item.style==='salesforce')!;
  Object.assign(car,{x:building.x-3,z:building.z+9.8,y:building.h+.8,supportId:null});
  presentation.snapshot(world,'local',100);car.x=building.x+3;presentation.snapshot(world,'local',102);
  assert.ok(buildingRoofHeight(building,building.x,car.z)>car.y,'the straight path penetrates the dome');
  assert.equal(remote(presentation.render(world,'local',101)),car,'unsafe path cuts to the authoritative pose');
});

test('does not extrapolate a remote car into a building or off the shore',()=>{
  const {world,remote:car,presentation}=setup(),building=BUILDINGS[0],left=building.x-building.w/2;
  Object.assign(car,{x:left-8.25,z:building.z,y:0,yaw:-Math.PI/2,vx:50,vz:0,supportId:'ground'});
  presentation.snapshot(world,'local',100);car.x=left-3.25;presentation.snapshot(world,'local',102);
  assert.equal(contact(body(car),{...building,yaw:0}),null,'the authority is outside the wall');
  assert.ok(contact(body({...car,x:car.x+5}),{...building,yaw:0}),'the extrapolated pose is inside');
  assert.equal(remote(presentation.render(world,'local',104)),car);

  presentation.reset();Object.assign(car,{x:80,z:-50,y:0,vx:50,vz:0});
  presentation.snapshot(world,'local',200);car.x=85;presentation.snapshot(world,'local',202);
  assert.ok(isSurface(car.x,car.z));assert.equal(isSurface(car.x+5,car.z),false);
  assert.equal(remote(presentation.render(world,'local',204)),car);
});

test('does not interpolate through ramp walls or the overpass',()=>{
  const {world,remote:car,presentation}=setup(),jump=ISLAND_JUMPS[1],near=jump.z-jump.width/2;
  const cases=[
    {from:{x:jump.start+15,z:near-2.5,y:0},to:{x:jump.start+15,z:near+.5,y:islandJumpHeight(jump.start+15,near+.5)!}},
    {from:{x:STUNT_RAMP.end+2,z:STUNT_RAMP.z,y:0},to:{x:STUNT_RAMP.end-2,z:STUNT_RAMP.z,y:rampHeight(STUNT_RAMP.end-2,STUNT_RAMP.z)!}},
    {from:{x:-400,z:OVERPASS.z,y:.3},to:{x:-400,z:OVERPASS.z,y:2.7}},
  ];
  for(const {from,to} of cases){
    presentation.reset();Object.assign(car,from,{supportId:null});presentation.snapshot(world,'local',100);
    Object.assign(car,to);presentation.snapshot(world,'local',102);
    assert.equal(remote(presentation.render(world,'local',101)),car,'unsafe path cuts to authority');
  }
});

test('does not interpolate or extrapolate through sampled hilly terrain',()=>{
  const {world,remote:car,presentation}=setup();
  Object.assign(car,{x:-114,z:630,y:9.9,vx:70,vz:0,supportId:null});
  presentation.snapshot(world,'local',100);car.x=-100;presentation.snapshot(world,'local',104);
  assert.ok(terrainHeight(-114,630)!<car.y&&terrainHeight(-100,630)!<car.y);
  assert.ok(terrainHeight(-108,630)!>car.y);
  assert.equal(remote(presentation.render(world,'local',102)),car);

  presentation.reset();Object.assign(car,{x:-117,z:630,y:terrainHeight(-117,630)!,vx:30,supportId:'ground'});
  presentation.snapshot(world,'local',200);car.x=-114;car.y=terrainHeight(car.x,car.z)!;presentation.snapshot(world,'local',202);
  assert.equal(remote(presentation.render(world,'local',204)),car,'flat-velocity extrapolation cannot cut into a rising hill');
});

test('bounds playback lag when snapshots continue arriving',()=>{
  const {world,remote:car,presentation}=setup();
  for(let tick=0;tick<=14;tick+=2){car.x=tick;presentation.snapshot(world,'local',tick);}
  assert.equal(remote(presentation.render(world,'local',0)).x,10,'at most four ticks behind');
});

test('leaves ferry passengers, local players, new entities and special-surface extrapolation to their owners',()=>{
  const {world,local,remote:car,presentation}=setup();car.supportId='ferry';
  presentation.snapshot(world,'local',0);car.z=1;local.x=50;presentation.snapshot(world,'local',2);
  const newest=makeEntity('new','roadster',4,8,'third');world.entities.push(newest);
  const rendered=presentation.render(world,'local',1);
  assert.equal(remote(rendered),car);assert.equal(rendered.entities.find(e=>e.id===local.id),local);
  assert.equal(rendered.entities.find(e=>e.id==='new'),newest);
  car.supportId='dome';car.domeS=1;presentation.snapshot(world,'local',4);
  car.domeS=2;car.x=1;presentation.snapshot(world,'local',6);
  assert.equal(remote(presentation.render(world,'local',10)),car,'do not extrapolate off curved supports');
});

test('interpolates dome perimeter across its wrap point',()=>{
  const {world,remote:car,presentation}=setup();car.supportId='dome';car.inDome=true;car.domeS=DOME_PERIMETER-1;
  presentation.snapshot(world,'local',0);car.x=1;car.domeS=1;presentation.snapshot(world,'local',2);
  const at=remote(presentation.render(world,'local',1)).domeS!;
  assert.ok(at<1e-8||Math.abs(at-DOME_PERIMETER)<1e-8);
});

test('duplicate ticks replace the latest frame, older ticks are ignored, and reset isolates rooms',()=>{
  const {world,remote:car,presentation}=setup();presentation.snapshot(world,'local',0);
  car.x=2;presentation.snapshot(world,'local',2);car.x=4;presentation.snapshot(world,'local',2);
  assert.equal(remote(presentation.render(world,'local',1)).x,2);
  const old=structuredClone(world);remote(old).x=-100;presentation.snapshot(old,'local',1);
  assert.equal(remote(presentation.render(world,'local',1)).x,2);
  presentation.reset();assert.equal(presentation.render(world,'local',1),world);
  presentation.snapshot(world,'local',2);assert.equal(presentation.render(world,'other',1),world);
});

test('stationary entities retain their original objects and do not allocate a replacement world',()=>{
  const {world,remote:car,presentation}=setup();car.vx=0;
  presentation.snapshot(world,'local',0);presentation.snapshot(world,'local',2);
  assert.equal(presentation.render(world,'local',1),world);
  assert.equal(presentation.render(world,'local',5),world);
});

test('does not sample a corrupt or teleport-length geometry path',()=>{
  const {remote:car}=setup();
  assert.equal(remotePathClear(car,{...car,x:Infinity}),false);
  assert.equal(remotePathClear(car,{...car,x:car.x+101}),false);
});

test('a ground car can move parallel to a wall without crossing it',()=>{
  const {remote:car}=setup();
  Object.assign(car,{kind:'roadster',x:-351.5,z:-25,y:0,yaw:0,pitch:0,roll:0,supportId:'ground'});
  const straight={...car,z:-29};
  assert.equal(remotePathClear(car,straight),true,'the projected footprint clears the wall');
  assert.equal(remotePathClear(car,{...straight,x:-348}),false,'crossing the wall stays blocked');
  assert.equal(remotePathClear(car,{...straight,yaw:.01}),true,'gentle steering clears the wall');
  assert.equal(remotePathClear(car,{...straight,x:-351.3,yaw:.8}),false,'turning into the wall stays blocked');
  assert.equal(remotePathClear(car,{...straight,roll:.01}),false,'tilted cars retain the conservative bound');
});

test('building sweep clears a diagonal corner but catches crossings between endpoints',()=>{
  const {remote:car}=setup();
  Object.assign(car,{kind:'roadster',x:-354,z:-42,y:0,yaw:0,pitch:0,roll:0,supportId:'ground'});
  assert.equal(remotePathClear(car,{...car,x:-345,z:-52,yaw:.1}),true,'a clear diagonal may pass the corner');
  Object.assign(car,{x:-354,z:-30});
  assert.equal(remotePathClear(car,{...car,x:-326}),false,'translation through the building is blocked');
  Object.assign(car,{x:-350.5});
  const end={...car,yaw:Math.PI},wall=BUILDINGS.find(item=>item.x===-340&&item.z===-30)!;
  assert.equal(contact(body(car),{...wall,yaw:0}),null);
  assert.equal(contact(body(end),{...wall,yaw:0}),null);
  assert.ok(contact(body({...car,yaw:Math.PI/2}),{...wall,yaw:0}),'rotation crosses the wall between clear endpoints');
  assert.equal(remotePathClear(car,end),false,'intermediate rotation remains blocked');
});

test('accepted ground sweeps never intersect the shared building body at sampled poses',()=>{
  const {remote:car}=setup(),wall=BUILDINGS.find(item=>item.x===-340&&item.z===-30)!;
  Object.assign(car,{kind:'roadster',y:0,pitch:0,roll:0,supportId:'ground'});
  let seed=0x9e3779b9,accepted=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<256;i++){
    Object.assign(car,{x:-358+36*random(),z:-50+40*random(),yaw:(random()-.5)*Math.PI*2});
    const end={...car,x:-358+36*random(),z:-50+40*random(),yaw:(random()-.5)*Math.PI*2};
    if(!remotePathClear(car,end))continue;
    accepted++;
    const delta=Math.atan2(Math.sin(end.yaw-car.yaw),Math.cos(end.yaw-car.yaw));
    for(let sample=0;sample<=64;sample++){
      const t=sample/64,pose={...car,x:car.x+(end.x-car.x)*t,z:car.z+(end.z-car.z)*t,yaw:car.yaw+delta*t};
      assert.equal(contact(body(pose),{...wall,yaw:0}),null,`path ${i}, sample ${sample}`);
    }
  }
  assert.ok(accepted>0,'the fixture includes accepted paths');
});
