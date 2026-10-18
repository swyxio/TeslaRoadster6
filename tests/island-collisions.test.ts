import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,step,type Entity} from '../shared/game';
import {cliffPose} from '../shared/island-stunts';
import {body,contact,dimensions} from '../shared/physics';

function twoCars(){
  const world=createWorld();world.entities=[];world.players=[];
  const first=addPlayer(world,'first','First'),second=addPlayer(world,'second','Second');
  return {world,a:world.entities.find(e=>e.id===first.entityId)!,b:world.entities.find(e=>e.id===second.entityId)!};
}

function attach(car:Entity,angle:number,speed:number){
  const pose=cliffPose(angle);
  Object.assign(car,{x:pose.point.x,y:pose.point.y,z:pose.point.z,yaw:-Math.PI/2,pitch:angle,
    supportId:'island-cliff',loopAngle:angle,speed,
    vx:pose.tangent.x*speed,vy:pose.tangent.y*speed,vz:0});
}

test('cars close together on the steep cliff physically collide',()=>{
  const {world,a,b}=twoCars();attach(a,1.45,5);attach(b,1.55,0);
  assert.ok(b.y-a.y>dimensions(a.kind).height);
  assert.ok(b.y-a.y<dimensions(a.kind).length);
  assert.ok(contact(body(a),body(b)));
  step(world,new Map(),.01);
  assert.equal(a.supportId,null);assert.equal(b.supportId,null);
  assert.equal(contact(body(a),body(b)),null);
});

test('cars at the same x/z on separate cliff branches do not collide',()=>{
  const {world,a,b}=twoCars();attach(a,.4,0);attach(b,Math.PI-.4,0);
  assert.ok(Math.abs(a.x-b.x)<.01);
  assert.ok(b.y-a.y>dimensions(a.kind).length+dimensions(b.kind).length);
  const az=a.z,bz=b.z;
  step(world,new Map(),.01);
  assert.equal(a.supportId,'island-cliff');assert.equal(b.supportId,'island-cliff');
  assert.equal(a.z,az);assert.equal(b.z,bz);
});
