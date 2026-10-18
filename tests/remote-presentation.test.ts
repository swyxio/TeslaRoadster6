import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, makeEntity } from '../shared/game';
import { BUILDINGS, DOME_PERIMETER, OVERPASS, STUNT_RAMP, buildingRoofHeight, isSurface, rampHeight, terrainHeight } from '../shared/map';
import { ISLAND_JUMPS, islandJumpHeight } from '../shared/island-jumps';
import { ovalBankSurface } from '../shared/oval-bank';
import { body, contact } from '../shared/physics';
import { presentationTransitionPathClear, projectGroundOval, projectedGroundOvalPathClear, remotePathClear, RemotePresentation } from '../src/remote-presentation';

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
  Object.assign(car,{x:0,y:0,z:0,yaw:Math.PI-.1,pitch:.1,roll:Math.PI-.2,steering:0,supportId:null});
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

test('remote motorcycle playback keeps the latest finish and occupant',()=>{
  for(const kind of ['ducati-panigale-v4','kawasaki-ninja-h2-carbon'] as const){
    const {world,presentation}=setup();
    const bike=makeEntity('remote',kind,0,0,'other');
    Object.assign(bike,{y:2,supportId:null,vx:20,owner:'other',driver:'other',steering:0});
    world.entities[world.entities.findIndex(entity=>entity.id==='remote')]=bike;
    presentation.snapshot(world,'local',10);
    bike.x=2;bike.steering=.8;bike.style={paint:'mint',decal:'stripe'};bike.upgrades.rocket=true;
    presentation.snapshot(world,'local',12);
    const before=structuredClone(world),shown=remote(presentation.render(world,'local',11));
    assert.equal(shown.x,1,kind);assert.equal(shown.steering,.4,kind);
    assert.deepEqual(shown.style,{paint:'mint',decal:'stripe'},kind);
    assert.equal(shown.owner,'other',kind);assert.equal(shown.driver,'other',kind);
    assert.equal(shown.upgrades.rocket,true,kind);
    assert.deepEqual(world,before,'playback never changes the saved finish or occupant');
    bike.x=4;bike.driver=null;presentation.snapshot(world,'local',14);
    const parked=remote(presentation.render(world,'local',13));
    assert.equal(parked,bike,'a rider leaving cuts to the latest occupant state');
    assert.equal(parked.driver,null);
  }
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
    else if(change==='support'){car.x=2;car.supportId='overpass';}
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

test('does not interpolate airborne cars through sampled hilly terrain',()=>{
  const {world,remote:car,presentation}=setup();
  Object.assign(car,{x:-114,z:630,y:9.9,vx:70,vz:0,supportId:null});
  presentation.snapshot(world,'local',100);car.x=-100;presentation.snapshot(world,'local',104);
  assert.ok(terrainHeight(-114,630)!<car.y&&terrainHeight(-100,630)!<car.y);
  assert.ok(terrainHeight(-108,630)!>car.y);
  assert.equal(remote(presentation.render(world,'local',102)),car);

});

test('distant supported cars interpolate and extrapolate along shared curved terrain',()=>{
  const {world,remote:car,presentation}=setup();
  for(const [from,to] of [[-114,-100],[-100,-114]]){
    presentation.reset();Object.assign(car,{x:from,z:630,y:terrainHeight(from,630)!,vx:(to-from)/.2,vz:0,supportId:'ground'});
    presentation.snapshot(world,'local',100);
    Object.assign(car,{x:to,y:terrainHeight(to,630)!});presentation.snapshot(world,'local',104);
    const authority=structuredClone(world);
    for(let frame=0;frame<=24;frame++){
      const t=frame/24,x=from+(to-from)*t,shown=remote(presentation.render(world,'local',100+4*t));
      assert.ok(Math.abs(shown.x-x)<1e-9,`frame ${frame} follows snapshot history`);
      assert.equal(shown.supportId,'ground');
      assert.ok(Math.abs(shown.y-terrainHeight(x,630)!)<1e-9,`frame ${frame} follows shared terrain`);
    }
    assert.deepEqual(world,authority,'presentation does not mutate room state');
  }
  presentation.reset();Object.assign(car,{x:-117,z:630,y:terrainHeight(-117,630)!,vx:30,vz:0,supportId:'ground'});
  presentation.snapshot(world,'local',200);car.x=-114;car.y=terrainHeight(car.x,car.z)!;presentation.snapshot(world,'local',202);
  const extrapolated=remote(presentation.render(world,'local',204));
  assert.equal(extrapolated.x,-111);assert.equal(extrapolated.y,terrainHeight(-111,630));
  assert.deepEqual(remote(presentation.render(world,'local',210)),extrapolated,'ground extrapolation remains bounded');
});

test('interpolates a remote car along the shared banked oval without cutting below it',()=>{
  const {world,remote:car,presentation}=setup();
  const from={x:-118.29336915636121,z:-1954.317076855921};
  const to={x:-114.3096728425141,z:-1943.8520411421414};
  Object.assign(car,from,{y:ovalBankSurface(from.x,from.z)!.height,supportId:'island-oval',vx:22,vz:52});
  presentation.snapshot(world,'local',100);
  Object.assign(car,to,{y:ovalBankSurface(to.x,to.z)!.height});
  presentation.snapshot(world,'local',104);
  for(let frame=0;frame<=24;frame++){
    const t=frame/24,shown=remote(presentation.render(world,'local',100+4*t));
    const x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
    assert.ok(Math.abs(shown.x-x)<1e-9&&Math.abs(shown.z-z)<1e-9,`frame ${frame} follows buffered playback`);
    assert.ok(Math.abs(shown.y-ovalBankSurface(x,z)!.height)<1e-9,`frame ${frame} follows the bank`);
  }
});

test('straight-chord safety rejects a path beneath the bank while surface playback follows it',()=>{
  const {remote:car}=setup();
  const from={...car,x:-118.29336915636121,z:-1954.317076855921,supportId:'island-oval' as const};
  const to={...from,x:-114.3096728425141,z:-1943.8520411421414};
  from.y=ovalBankSurface(from.x,from.z)!.height;to.y=ovalBankSurface(to.x,to.z)!.height;
  const t=.85,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
  assert.ok(ovalBankSurface(x,z)!.height-(from.y+(to.y-from.y)*t)>.1,'the straight path penetrates the shared bank');
  assert.equal(remotePathClear(from,to),false,'a straight-chord consumer must reject it');
  assert.equal(projectedGroundOvalPathClear(from,to),true,'a consumer projecting every displayed pose may follow the surface');
});

test('projected ground/oval paths retain shared surface and static geometry safety',()=>{
  const {remote:car}=setup();
  const ground={...car,x:-120.56290103569259,z:-1959.4362491630998,y:0,supportId:'ground' as const};
  const raised={...ground,x:-118.29336915636121,z:-1954.317076855921};
  const bank=projectGroundOval(raised)!;
  assert.equal(bank.supportId,'island-oval');assert.equal(bank.y,ovalBankSurface(bank.x,bank.z)!.height);
  assert.equal(projectedGroundOvalPathClear(ground,bank),true);
  assert.equal(projectedGroundOvalPathClear(bank,ground),true);
  assert.equal(projectedGroundOvalPathClear({...ground,y:1},bank),false,'unprojected endpoint is rejected');
  assert.equal(projectedGroundOvalPathClear({...ground,driver:'replacement'},bank),false,'identity changes are rejected');
  assert.equal(projectedGroundOvalPathClear({...ground,health:99},bank),false,'damage is rejected');
  assert.equal(projectGroundOval({...ground,supportId:null}),null,'airborne poses are not projected');
  assert.equal(projectGroundOval({...ground,x:2000,z:2000}),null,'unsupported ground is not projected');
  const building=BUILDINGS[0],half=building.w/2;
  const left=projectGroundOval({...ground,x:building.x-half-5,z:building.z})!;
  const right=projectGroundOval({...ground,x:building.x+half+5,z:building.z})!;
  assert.equal(projectedGroundOvalPathClear(left,right),false,'projection cannot cross a building');
});

test('projected ground paths follow curved shared terrain without authorizing the straight chord',()=>{
  const {remote:car}=setup();
  const from=projectGroundOval({...car,x:-114,z:630,supportId:'ground'})!;
  const to=projectGroundOval({...car,x:-100,z:630,supportId:'ground'})!;
  assert.ok(terrainHeight(-108,630)!>from.y+(to.y-from.y)*6/14,'the chord cuts through the hill');
  assert.equal(remotePathClear(from,to),false,'a straight-chord consumer must reject the hill');
  assert.equal(projectedGroundOvalPathClear(from,to),true,'a consumer projecting every displayed pose follows the hill');
  for(let i=0;i<=24;i++){
    const t=i/24,x=from.x+(to.x-from.x)*t;
    const shown=projectGroundOval({...from,x,y:from.y+(to.y-from.y)*t})!;
    assert.equal(shown.supportId,'ground');assert.equal(shown.y,terrainHeight(x,630));
  }
});

test('oval playback cuts unsupported changes, relocations and paths that leave the bank',()=>{
  const {world,remote:car,presentation}=setup();
  const from={x:-118.29336915636121,z:-1954.317076855921};
  const to={x:-114.3096728425141,z:-1943.8520411421414};
  Object.assign(car,from,{y:ovalBankSurface(from.x,from.z)!.height,supportId:'island-oval',vx:1,vz:0});
  const original=structuredClone(car);
  presentation.snapshot(world,'local',100);
  Object.assign(car,to,{y:ovalBankSurface(to.x,to.z)!.height});
  presentation.snapshot(world,'local',102);
  assert.equal(remote(presentation.render(world,'local',101)),car,'an implausible relocation cuts to authority');

  presentation.reset();Object.assign(car,original);presentation.snapshot(world,'local',200);
  car.supportId='island-cliff';car.y+=1;presentation.snapshot(world,'local',202);
  assert.equal(remote(presentation.render(world,'local',201)),car,'an unknown support change cuts to authority');
  const unsupported={...original,z:original.z+80};
  assert.equal(ovalBankSurface(unsupported.x,unsupported.z),null);
  assert.equal(remotePathClear(original,unsupported),false,'an unsupported target is not a bank path');
  assert.equal(remotePathClear({...original,supportId:null},{...original,supportId:null,x:to.x,z:to.z,y:ovalBankSurface(to.x,to.z)!.height}),false,'airborne motion cannot cut through the bank');
  const lowFlight={...original,x:from.x,z:from.z,y:3,pitch:.4,supportId:null};
  assert.equal(remotePathClear(lowFlight,{...lowFlight,x:to.x,z:to.z}),false,'a low-flight path through the bank remains blocked');
});

test('airborne playback follows a clear chord above the oval but never one through it',()=>{
  const {world,remote:car,presentation}=setup();
  const from={x:-111.1417911876265,y:3.6964290144086602,z:-1936.5220332247443};
  const to={x:-108.83612535327195,y:3.9554925596646986,z:-1931.080400934801};
  Object.assign(car,from,{supportId:null,vx:23,vz:54});
  const start=structuredClone(car);presentation.snapshot(world,'local',100);
  Object.assign(car,to);presentation.snapshot(world,'local',102);
  assert.equal(remotePathClear(start,car),true,'the actual airborne chord stays above the shared bank');
  const shown=remote(presentation.render(world,'local',101));
  assert.ok(Math.abs(shown.x-(from.x+to.x)/2)<1e-9);
  assert.ok(Math.abs(shown.y-(from.y+to.y)/2)<1e-9);
  assert.ok(Math.abs(shown.z-(from.z+to.z)/2)<1e-9);

  const bankA={x:-118.29336915636121,z:-1954.317076855921};
  const bankB={x:-114.3096728425141,z:-1943.8520411421414};
  presentation.reset();Object.assign(car,bankA,{y:ovalBankSurface(bankA.x,bankA.z)!.height+.05});
  const above=structuredClone(car);presentation.snapshot(world,'local',200);
  Object.assign(car,bankB,{y:ovalBankSurface(bankB.x,bankB.z)!.height+.05});presentation.snapshot(world,'local',204);
  assert.equal(remotePathClear(above,car),false,'endpoints above the bank do not make a penetrating chord safe');
  assert.equal(remote(presentation.render(world,'local',202)),car,'penetrating flight cuts to authority');
});

test('continuous oval takeoff and landing interpolate without changing authority',()=>{
  const {world,remote:car,presentation}=setup();
  const x=-118.29336915636121,z=-1954.317076855921,y=ovalBankSurface(x,z)!.height;
  for(const [fromSupport,toSupport,fromY,toY] of [['island-oval',null,y,y+1],[null,'island-oval',y+1,y]] as const){
    presentation.reset();Object.assign(car,{x,z,y:fromY,supportId:fromSupport,vx:0,vz:0});presentation.snapshot(world,'local',100);
    const from=structuredClone(car);
    Object.assign(car,{y:toY,supportId:toSupport});presentation.snapshot(world,'local',102);
    const before=structuredClone(world),shown=remote(presentation.render(world,'local',101));
    assert.equal(presentationTransitionPathClear(from,car),true,'the verified straight transition is clear');
    assert.notEqual(shown,car);assert.equal(shown.supportId,null);assert.ok(Math.abs(shown.y-(fromY+toY)/2)<1e-9);
    assert.deepEqual(world,before,'visual transition leaves the authoritative state unchanged');
  }
  presentation.reset();Object.assign(car,{x,z,y:y+1,supportId:null,vx:0,vz:0});presentation.snapshot(world,'local',200);
  Object.assign(car,{x:x+70,z:z+1,y:0,supportId:'ground'});presentation.snapshot(world,'local',202);
  assert.equal(remote(presentation.render(world,'local',201)),car,'an implausible landing relocation still cuts');
  assert.equal(presentationTransitionPathClear({...car,x,z,y:y+1,supportId:null},{...car,x,z,y:y+1,supportId:'island-oval'}),false,'a mislabeled bank endpoint is rejected');
});

test('continuous ground takeoff and landing follow the same transition path',()=>{
  const {world,remote:car,presentation}=setup();
  for(const [fromSupport,toSupport,fromY,toY] of [['ground',null,0,1],[null,'ground',1,0]] as const){
    presentation.reset();Object.assign(car,{x:-120.56290103569259,z:-1959.4362491630998,y:fromY,supportId:fromSupport,vx:0,vz:0});
    const from=structuredClone(car);presentation.snapshot(world,'local',100);
    Object.assign(car,{y:toY,supportId:toSupport});presentation.snapshot(world,'local',102);
    const shown=remote(presentation.render(world,'local',101));
    assert.equal(presentationTransitionPathClear(from,car),true);
    assert.notEqual(shown,car);assert.equal(shown.supportId,null);assert.equal(shown.y,.5);
  }
});

test('interpolates both directions across the ground-to-oval shoulder with the sampled support',()=>{
  const ground={x:-120.56290103569259,z:-1959.4362491630998},bank={x:-118.29336915636121,z:-1954.317076855921};
  for(const [from,to] of [[ground,bank],[bank,ground]]){
    const {world,remote:car,presentation}=setup();
    const put=(point:{x:number;z:number})=>{
      const oval=ovalBankSurface(point.x,point.z);
      Object.assign(car,point,{y:oval?.height??terrainHeight(point.x,point.z)!,supportId:oval?'island-oval':'ground',vx:22,vz:52});
    };
    put(from);presentation.snapshot(world,'local',90);
    put(to);presentation.snapshot(world,'local',92);
    const authority=structuredClone(world);
    for(let frame=0;frame<=24;frame++){
      const t=frame/24,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      const oval=ovalBankSurface(x,z),shown=remote(presentation.render(world,'local',90+2*t));
      assert.ok(Math.abs(shown.x-x)<1e-9&&Math.abs(shown.z-z)<1e-9,`frame ${frame} follows buffered playback`);
      assert.equal(shown.supportId,oval?'island-oval':'ground',`frame ${frame} uses the sampled support`);
      assert.ok(Math.abs(shown.y-(oval?.height??terrainHeight(x,z)!))<1e-9,`frame ${frame} follows shared surface height`);
    }
    assert.deepEqual(world,authority,'visual playback does not change authority');
  }
});

test('a plausible ground-to-oval transition continues on the bank while snapshots bunch',()=>{
  const {world,remote:car,presentation}=setup();
  Object.assign(car,{x:-120.56290103569259,z:-1959.4362491630998,y:0,supportId:'ground',vx:21.87084986709601,vz:51.55255492602571});
  presentation.snapshot(world,'local',90);
  Object.assign(car,{x:-118.29336915636121,z:-1954.317076855921,supportId:'island-oval'});
  car.y=ovalBankSurface(car.x,car.z)!.height;presentation.snapshot(world,'local',92);
  const mid=remote(presentation.render(world,'local',91));
  assert.ok(mid.x> -120.56290103569259&&mid.x<car.x,'a continuous support change interpolates');
  const before=remote(presentation.render(world,'local',94));
  assert.notEqual(before,car,'a plausible transition can continue for the bounded extrapolation window');
  assert.equal(before.y,ovalBankSurface(before.x,before.z)!.height);
  assert.deepEqual(remote(presentation.render(world,'local',200)),before,'extrapolation remains capped at two ticks');
  Object.assign(car,{x:-116.20807324746781,z:-1949.1201314980062});
  car.y=ovalBankSurface(car.x,car.z)!.height;presentation.snapshot(world,'local',94);
  Object.assign(car,{x:-114.3096728425141,z:-1943.8520411421414});
  car.y=ovalBankSurface(car.x,car.z)!.height;presentation.snapshot(world,'local',96);
  const after=remote(presentation.render(world,'local',94.17245152684815));
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)<1,'batched frames do not create a large catch-up jump');
  assert.equal(after.y,ovalBankSurface(after.x,after.z)!.height);

  presentation.reset();Object.assign(car,{x:-200,z:-1959,y:0,supportId:'ground'});presentation.snapshot(world,'local',100);
  Object.assign(car,{x:-118.29336915636121,z:-1954.317076855921,supportId:'island-oval'});
  car.y=ovalBankSurface(car.x,car.z)!.height;presentation.snapshot(world,'local',102);
  assert.equal(remote(presentation.render(world,'local',104)),car,'an implausible relocation does not extrapolate');
});

test('ground-to-oval interpolation rejects mismatched endpoints and unknown supports',()=>{
  const {world,remote:car,presentation}=setup();
  const ground={x:-120.56290103569259,z:-1959.4362491630998,y:0},bank={x:-118.29336915636121,z:-1954.317076855921};
  for(const change of ['invalid-bank-height','invalid-ground-support','unknown-support'] as const){
    presentation.reset();Object.assign(car,ground,{supportId:change==='invalid-ground-support'?'island-oval':'ground',vx:22,vz:52});presentation.snapshot(world,'local',90);
    Object.assign(car,bank,{y:ovalBankSurface(bank.x,bank.z)!.height+(change==='invalid-bank-height'?1:0),supportId:change==='unknown-support'?'island-bank':'island-oval'});presentation.snapshot(world,'local',92);
    assert.equal(remote(presentation.render(world,'local',91)),car,`${change} cuts to authority`);
    assert.equal(remote(presentation.render(world,'local',94)),car,`${change} does not extrapolate`);
  }
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
