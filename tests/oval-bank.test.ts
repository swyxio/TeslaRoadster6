import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, raceAction, step } from '../shared/game';
import { ISLAND_TRACK, ROADS, isRocketIsland, supportHeight, supportNormal } from '../shared/map';
import { OVAL_BANK, ovalBankSurface, ovalBankVertex, sweepOvalBank } from '../shared/oval-bank';
import { type VehicleId } from '../shared/vehicles';
import { body, contact } from '../shared/physics';

function setup(){
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  return {world,car};
}

test('the oval uses the rendered triangles, continuous shoulders, and flat junctions',()=>{
  for(let i=0;i<OVAL_BANK.segments;i++)for(let row=0;row<OVAL_BANK.rows;row++){
    const a=ovalBankVertex(i,row),b=ovalBankVertex(i,row+1),c=ovalBankVertex(i+1,row),d=ovalBankVertex(i+1,row+1);
    for(const tri of [[a,c,b],[b,c,d]]){
      const x=(tri[0].x+tri[1].x+tri[2].x)/3,z=(tri[0].z+tri[1].z+tri[2].z)/3;
      const height=(tri[0].y+tri[1].y+tri[2].y)/3,s=ovalBankSurface(x,z);
      if(height<1e-7)continue;
      assert.ok(s);assert.ok(Math.abs(s.height-height)<1e-6);
      assert.ok(Math.abs(s.normal.x+s.dx*s.normal.y)<1e-9);
      assert.ok(Math.abs(s.normal.z+s.dz*s.normal.y)<1e-9);
      assert.ok(isRocketIsland(x,z));
    }
  }
  for(let i=0;i<=OVAL_BANK.segments;i++){
    assert.equal(ovalBankVertex(i,0).y,0);assert.equal(ovalBankVertex(i,OVAL_BANK.rows).y,0);
  }
  for(const [x,z] of [[240,-1301],[-5,-1330],[-40,-1342],[0,-1328]]){
    assert.equal(ovalBankSurface(x,z),null,`flat junction at ${x},${z}`);
  }
  for(const road of ROADS.filter(road=>road.kind==='island'&&road.course!=='oval')){
    const angle=road.angle??0,sine=Math.sin(angle),cosine=Math.cos(angle);
    for(let along=-road.d/2;along<=road.d/2;along+=2)for(let across=-road.w/2;across<=road.w/2;across+=2){
      const x=road.x+sine*along+cosine*across,z=road.z+cosine*along-sine*across;
      assert.equal(ovalBankSurface(x,z),null,`flat intersecting road at ${x},${z}`);
    }
  }
  const s=ovalBankSurface(710,-1650)!;
  assert.ok(s.height>2&&s.height<3);assert.deepEqual(supportNormal('island-oval',710,-1650),s.normal);
  assert.equal(supportHeight('island-oval',710,-1650),s.height);
  const hit=sweepOvalBank({x:710,y:15,z:-1650},{x:710,y:-1,z:-1650});
  assert.ok(hit);assert.ok(Math.abs(hit.y-s.height)<1e-6);
});

test('a car crosses both shoulders, follows the slope, lands and jumps along its normal',()=>{
  const {world,car}=setup();
  Object.assign(car,{x:675,z:-1650,y:0,yaw:-Math.PI/2,speed:12,supportId:'ground'});
  let peak=0,banked=false,previous=car.y;
  for(let i=0;i<160&&car.x<746;i++){
    step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.ok(Math.abs(car.y-previous)<1,`surface discontinuity at ${car.x}`);
    previous=car.y;peak=Math.max(peak,car.y);banked ||= car.supportId==='island-oval';
    assert.notEqual(car.supportId,null);
  }
  assert.ok(banked&&peak>3.5);assert.ok(car.x>740);assert.equal(car.supportId,'ground');
  Object.assign(car,{x:710,z:-1650,y:12,vy:-12,vx:0,vz:0,speed:0,supportId:null});
  for(let i=0;i<40&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,'island-oval');
  const normal=ovalBankSurface(car.x,car.z)!.normal;
  step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
  assert.equal(car.supportId,null);assert.ok(car.vx*normal.x+car.vy*normal.y+car.vz*normal.z>7);
});

test('a large tractor can cross the bank and return to ground without a step',()=>{
  for(const kind of ['tesla-semi','waymo-peterbilt'] as const){
    const {world,car}=setup();
    Object.assign(car,{kind,x:675,z:-1650,y:0,yaw:-Math.PI/2,speed:12,supportId:'ground'});
    let banked=false,previous=car.y;
    for(let i=0;i<180&&car.x<746;i++){
      step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
      assert.ok(Math.abs(car.y-previous)<1,`${kind} crossed a surface step`);
      previous=car.y;banked ||= car.supportId==='island-oval';assert.notEqual(car.supportId,null);
    }
    assert.ok(banked&&car.x>740);assert.equal(car.supportId,'ground');
  }
});

test('eight mixed vehicle sizes obtain distinct flat oval grid slots',()=>{
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const kinds:VehicleId[]=['waymo-peterbilt','tesla-semi','roadster','model-3','waymo-firefly','cybertruck','model-y','model-x'];
  const cars=kinds.map((kind,i)=>{
    const player=addPlayer(world,`p${i}`,'P'),car=world.entities.find(e=>e.id===player.entityId)!;
    car.kind=kind;return car;
  });
  for(let i=0;i<cars.length;i++){
    Object.assign(cars[i],{x:240,z:-1301,y:0,supportId:'ground',speed:0});
    assert.ok(raceAction(world,`p${i}`,'join','oval'),`${kinds[i]} could not join`);
    assert.equal(ovalBankSurface(cars[i].x,cars[i].z),null);
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)assert.equal(contact(body(cars[i]),body(cars[j])),null);
  assert.ok(raceAction(world,'p0','start','oval'));
  for(let i=0;i<61;i++)step(world,new Map(),.05);
  assert.equal(world.races.rounds[0].phase,'active');
  assert.ok(cars.every(car=>car.supportId==='ground'));
});

test('a driven full lap follows the bank and crosses all eight authoritative gates',()=>{
  const {world,car}=setup();
  Object.assign(car,{x:240,z:-1301,y:0,supportId:'ground'});
  assert.ok(raceAction(world,'p','join','oval'));assert.ok(raceAction(world,'p','start','oval'));
  for(let i=0;i<61;i++)step(world,new Map(),.05);
  let banked=0,grounded=0,peak=0,maxOffset=0;
  for(let i=0;i<5500;i++){
    let best=Infinity,segment=0,fraction=0;
    for(let j=0;j<ISLAND_TRACK.length;j++){
      const a=ISLAND_TRACK[j],b=ISLAND_TRACK[(j+1)%ISLAND_TRACK.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((car.x-a.x)*dx+(car.z-a.z)*dz)/(dx*dx+dz*dz)));
      const distance=Math.hypot(car.x-a.x-t*dx,car.z-a.z-t*dz);
      if(distance<best){best=distance;segment=j;fraction=t;}
    }
    maxOffset=Math.max(maxOffset,best);
    let a=ISLAND_TRACK[segment],b=ISLAND_TRACK[(segment+1)%ISLAND_TRACK.length];
    let ahead=fraction*Math.hypot(b.x-a.x,b.z-a.z)+25;
    for(let j=0;j<ISLAND_TRACK.length;j++){
      a=ISLAND_TRACK[segment];b=ISLAND_TRACK[(segment+1)%ISLAND_TRACK.length];
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(ahead<=length){fraction=ahead/length;break;}ahead-=length;segment=(segment+1)%ISLAND_TRACK.length;
    }
    const x=a.x+(b.x-a.x)*fraction,z=a.z+(b.z-a.z)*fraction,heading=Math.atan2(-(x-car.x),-(z-car.z));
    const error=Math.atan2(Math.sin(heading-car.yaw),Math.cos(heading-car.yaw));
    step(world,new Map([['p',{...NEUTRAL,throttle:car.speed<24?1:0,steer:Math.max(-1,Math.min(1,error*1.3))}]]),.05);
    if(car.supportId==='island-oval')banked++;if(car.supportId==='ground')grounded++;peak=Math.max(peak,car.y);
    if(world.races.rounds[0].entrants[0].status!=='entered')break;
  }
  const entrant=world.races.rounds[0].entrants[0];
  assert.equal(entrant.status,'finished');assert.equal(entrant.nextGate,8);
  assert.ok(banked>100&&grounded>10&&peak>1);assert.ok(maxOffset<14,`left the lane by ${maxOffset} m`);
});
