import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_BOUNDS } from '../shared/map';
import { HORIZON_BOUNDS, createHorizonGeometryData, projectHorizon } from '../src/horizon-geometry';

test('the decorative horizon surrounds the playable map and keeps its bearing in flight', () => {
  assert.ok(HORIZON_BOUNDS.minX < MAP_BOUNDS.minX && HORIZON_BOUNDS.maxX > MAP_BOUNDS.maxX);
  assert.ok(HORIZON_BOUNDS.minZ < MAP_BOUNDS.minZ && HORIZON_BOUNDS.maxZ > MAP_BOUNDS.maxZ);
  const { world, uv, indices }=createHorizonGeometryData();
  assert.equal(uv.length,world.length/3*2);
  assert.ok(indices.every(i=>i>=0 && i<world.length/3));
  for (const camera of [[0,8,0],[1200,250,7000]] as const) {
    const out=new Float32Array(world.length);
    projectHorizon(world,out,...camera);
    for (let i=0;i<world.length;i+=3) {
      const source=[world[i]-camera[0],world[i+1]-camera[1],world[i+2]-camera[2]];
      const projected=[out[i]-camera[0],out[i+1]-camera[1],out[i+2]-camera[2]];
      const sourceLength=Math.hypot(...source), length=Math.hypot(...projected);
      assert.ok(Math.abs(length-1500)<.01);
      assert.ok(source.every((axis,j)=>Math.abs(axis/sourceLength-projected[j]/length)<.00001));
    }
  }
});

test('moving across the Bay changes the bearing to a fixed ridge', () => {
  const {world}=createHorizonGeometryData();
  const near=new Float32Array(world.length), far=new Float32Array(world.length);
  projectHorizon(world,near,0,10,0);
  projectHorizon(world,far,1200,10,7000);
  const bearing=(p:Float32Array,x:number,z:number)=>Math.atan2(p[0]-x,p[2]-z);
  assert.ok(Math.abs(bearing(near,0,0)-bearing(far,1200,7000))>.1);
});

test('ridge cards meet at the corners without height or texture jumps', () => {
  const {world,uv}=createHorizonGeometryData();
  const vertices=world.length/3;
  const bottom=(i:number)=>[world[i*3],world[i*3+1],world[i*3+2]];
  const top=(i:number)=>[world[(i+1)*3],world[(i+1)*3+1],world[(i+1)*3+2]];
  let corners=0;
  for(let i=2;i<vertices;i+=2) {
    if(bottom(i).every((v,j)=>v===bottom(i-2)[j])) {
      assert.deepEqual(top(i),top(i-2));
      assert.equal(uv[i*2],uv[(i-2)*2]);
      corners++;
    }
  }
  assert.equal(corners,3);
  assert.deepEqual(bottom(0),bottom(vertices-2));
  assert.deepEqual(top(0),top(vertices-2));
  assert.equal(uv[(vertices-2)*2]%2,uv[0]);
});
