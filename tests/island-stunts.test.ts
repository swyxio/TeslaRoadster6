import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ISLAND_BANK,ISLAND_CLIFF,advanceCliff,bankSurface,bankVertex,bankVerticalVelocity,cliffPose,cliffVertex,detachCliff,enterCliffFromGround,resolveCliffHit,sweepBank,sweepCliff } from '../shared/island-stunts';
import { isRocketIsland,ROADS,FERRY_DOCKS } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { VEHICLES,VEHICLE_IDS } from '../shared/vehicles';
import { addIslandStunts } from '../src/island-stunts';

function car(){return {x:ISLAND_CLIFF.x+.5,y:0,z:ISLAND_CLIFF.z,supportId:'ground' as string|null,loopAngle:null as number|null,loopDirection:1,
  vx:40,vy:0,vz:0,speed:40,yaw:-Math.PI/2,pitch:0,roll:0,pitchRate:0,yawRate:0,rollRate:0,pushX:0,pushZ:0,flipRemaining:0};}
const controls={throttle:1,brake:false,acceleration:10,brakeDecel:15};
const near=(a:number,b:number,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('bank heights, normals and tangent velocity use the renderer triangles and taper to ground',()=>{
  for(const x of [ISLAND_BANK.startX,ISLAND_BANK.endX])for(const z of [-1780,-1760,-1750,-1740,-1720])near(bankSurface(x,z)!.height,0);
  for(const z of [-1780,-1720])for(const x of [-20,20,80,120,180])near(bankSurface(x,z)!.height,0);
  const x=73.2,z=-1743.37,s=bankSurface(x,z)!,eps=.0001;
  assert.ok(s.height>0&&s.height<4);
  near((bankSurface(x+eps,z)!.height-s.height)/eps,s.dx);
  near((bankSurface(x,z+eps)!.height-s.height)/eps,s.dz);
  near(s.normal.x+s.normal.y*s.dx,0);near(s.normal.z+s.normal.y*s.dz,0);
  near(bankVerticalVelocity(x,z,11,-4),11*s.dx-4*s.dz);
  assert.equal(bankSurface(ISLAND_BANK.startX-1,z),null);
});

test('bank landing detects a swept crossing with a shared surface normal',()=>{
  const x=60,z=-1745,s=bankSurface(x,z)!;
  const hit=sweepBank({x,y:10,z},{x,y:-4,z});
  assert.ok(hit);near(hit.y,s.height);near(hit.t,(10-s.height)/14);near(hit.normal.y,s.normal.y);
  assert.equal(sweepBank({x:500,y:10,z},{x:500,y:-4,z}),null);
});

test('cliff sweeps select the actual upper or lower branch, with a finite width',()=>{
  const lower=cliffPose(.4).point,upper=cliffPose(Math.PI-.4).point;
  near(lower.x,upper.x,.001);assert.ok(upper.y>lower.y+30);
  const x=lower.x,z=ISLAND_CLIFF.z;
  const descending=sweepCliff({x,y:45,z},{x,y:-1,z})!,ascending=sweepCliff({x,y:-1,z},{x,y:45,z})!;
  near(descending.y,upper.y,.001);near(ascending.y,lower.y,.001);
  assert.ok(descending.angle>Math.PI/2&&ascending.angle<Math.PI/2);
  assert.equal(sweepCliff({x,y:45,z:z+ISLAND_CLIFF.width},{x,y:-1,z:z+ISLAND_CLIFF.width}),null);
  const grounded=car(),old={x:ISLAND_CLIFF.x-1,y:0,z};
  assert.equal(enterCliffFromGround(grounded,old),true);
  assert.equal(grounded.supportId,'island-cliff');assert.ok(grounded.loopAngle!>0);
  for(const id of VEHICLE_IDS){
    const e=car(),margin=VEHICLES[id].width/2;
    e.z=ISLAND_CLIFF.z+ISLAND_CLIFF.width/2-margin-.01;
    assert.equal(enterCliffFromGround(e,{x:ISLAND_CLIFF.x-1,y:0,z:e.z},margin),true,id);
    const outside=car();outside.z=ISLAND_CLIFF.z+ISLAND_CLIFF.width/2-margin+.01;
    assert.equal(enterCliffFromGround(outside,{x:ISLAND_CLIFF.x-1,y:0,z:outside.z},margin),false,id);
  }
});

test('ordinary cars fall after the vertical, while Rocket cars reach the overhang and exit with tangent momentum',()=>{
  for(const rocket of [false,true]){
    const e=car();enterCliffFromGround(e,{x:ISLAND_CLIFF.x-1,y:0,z:e.z});
    let highest=0,result:'supported'|'airborne'|'ground'='supported';
    for(let i=0;i<200&&result==='supported';i++){
      highest=Math.max(highest,e.loopAngle??0);result=advanceCliff(e,controls,.025,rocket);
    }
    assert.equal(result,'airborne');assert.equal(e.supportId,null);
    assert.ok(rocket?highest>Math.PI:highest<Math.PI/2);
    assert.ok(Math.hypot(e.vx,e.vy)>1);
    if(rocket){assert.ok(e.vx<0&&e.vy<0);}else assert.ok(e.vy>0);
  }
});

test('detaching preserves world velocity and non-Rocket contacts bounce',()=>{
  const e=car();e.supportId='island-cliff';e.loopAngle=Math.PI;e.vx=12;e.vy=-3;e.vz=4;
  assert.equal(advanceCliff(e,controls,.05,false),'airborne');
  assert.deepEqual([e.vx,e.vy,e.vz],[12,-3,4]);assert.equal(e.supportId,null);
  e.supportId='island-cliff';e.loopAngle=2;detachCliff(e);assert.deepEqual([e.vx,e.vy,e.vz],[12,-3,4]);
  const y=10,p=cliffPose(Math.acos(1-y/ISLAND_CLIFF.radius)).point;
  const hit=sweepCliff({x:p.x-5,y,z:p.z},{x:p.x+5,y,z:p.z})!;
  assert.ok(hit.inside);
  Object.assign(e,{vx:10,vy:0,vz:0,supportId:null,loopAngle:null});
  assert.equal(resolveCliffHit(e,hit,false),'bounce');assert.ok(e.vx<10);
  Object.assign(e,{vx:10,vy:0,vz:0,supportId:null,loopAngle:null});
  assert.equal(resolveCliffHit(e,hit,true),'attached');assert.equal(e.supportId,'island-cliff');
  near(e.vx*hit.normal.x+e.vy*hit.normal.y,0);
});

test('authored stunts stay on the island and clear roads, parking and ferry',()=>{
  const bankPoints: {x:number;z:number}[]=[];
  for(let col=0;col<=ISLAND_BANK.columns;col++)for(let row=0;row<=ISLAND_BANK.rows;row++)bankPoints.push(bankVertex(col,row));
  const cliffPoints=Array.from({length:ISLAND_CLIFF.segments+1},(_,i)=>cliffVertex(i)).flatMap(p=>[-ISLAND_CLIFF.width/2,0,ISLAND_CLIFF.width/2].map(dz=>({x:p.x,z:p.z+dz})));
  for(const p of [...bankPoints,...cliffPoints]){
    assert.ok(isRocketIsland(p.x,p.z));
    for(const road of ROADS.filter(r=>r.kind==='island')){
      const angle=road.angle??0,dx=p.x-road.x,dz=p.z-road.z;
      const across=dx*Math.cos(angle)-dz*Math.sin(angle),along=dx*Math.sin(angle)+dz*Math.cos(angle);
      assert.ok(Math.abs(across)>road.w/2||Math.abs(along)>road.d/2,`road overlap at ${p.x},${p.z}`);
    }
    for(const lot of PARKING_LOTS)assert.ok(Math.abs(p.x-lot.area.x)>lot.area.width/2||Math.abs(p.z-lot.area.z)>lot.area.length/2);
    assert.ok(Math.hypot(p.x-FERRY_DOCKS.island.x,p.z-FERRY_DOCKS.island.z)>100);
  }
});

test('rendered surfaces use the exact shared lattice vertices',()=>{
  const scene=new T.Scene();addIslandStunts(scene);
  const bank=scene.getObjectByName('island-bank') as T.Mesh,cliff=scene.getObjectByName('island-cliff') as T.Mesh;
  const bp=bank.geometry.getAttribute('position'),cp=cliff.geometry.getAttribute('position');
  for(const [col,row] of [[0,0],[10,11],[40,30]]){
    const p=bankVertex(col,row),i=row*(ISLAND_BANK.columns+1)+col;near(bp.getX(i),p.x);near(bp.getY(i),p.y,1e-5);near(bp.getZ(i),p.z);
  }
  for(const i of [0,100,240]){const p=cliffVertex(i);near(cp.getX(2*i),p.x,.0001);near(cp.getY(2*i),p.y,.0001);near(cp.getZ(2*i),p.z-ISLAND_CLIFF.width/2);}
});
