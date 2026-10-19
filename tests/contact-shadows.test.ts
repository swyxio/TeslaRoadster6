import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import type { Entity } from '../shared/game';
import { terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { ContactShadows } from '../src/contact-shadows';

const entity=(id:string,fields:Partial<Entity>={}):Entity=>({id,kind:'roadster',supportId:'ground',inDome:false,...fields} as Entity);
const vehicle=(x:number,y:number,z:number)=>{const group=new T.Group();group.position.set(x,y,z);return group;};

test('contact patches follow rendered cars and clear stale instances',()=>{
  const scene=new T.Scene(),shadows=new ContactShadows(scene),car=entity('car');
  const mesh=vehicle(-120,0,-120);mesh.rotation.y=.7;
  const meshes=new Map([[car.id,mesh]]),camera=new T.Vector3(-120,4,-115);
  shadows.update([car],meshes,camera,car);
  assert.equal(shadows.mesh.count,1);assert.equal(shadows.mesh.visible,true);
  assert.equal(scene.children.filter(child=>child instanceof T.InstancedMesh).length,1);
  const matrix=new T.Matrix4();shadows.mesh.getMatrixAt(0,matrix);
  const position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();matrix.decompose(position,rotation,scale);
  assert.ok(position.distanceTo(new T.Vector3(-120,.20,-120))<.00001);
  assert.ok(Math.abs(new T.Euler().setFromQuaternion(rotation).y-.7)<.00001);
  mesh.position.set(-115,0,-120);shadows.update([car],meshes,camera,car);
  shadows.mesh.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x-(-115))<.00001);
  shadows.update([],new Map(),camera);
  assert.equal(shadows.mesh.count,0);assert.equal(shadows.mesh.visible,false);
});

test('grounded cars remain visible over parking surfaces',()=>{
  const lot=PARKING_LOTS.find(item=>item.id==='sf-playground')!;
  const shadows=new ContactShadows(new T.Scene()),car=entity('car');
  // In scene.ts the parking area top is .14 and the approach top is .18.
  for(const [surface,top] of [[lot.area,.14],[lot.approach,.18]] as const){
    const mesh=vehicle(surface.x,0,surface.z),camera=mesh.position.clone().add(new T.Vector3(0,4,5));
    shadows.update([car],new Map([[car.id,mesh]]),camera,car);
    assert.equal(shadows.mesh.count,1);
    const matrix=new T.Matrix4(),position=new T.Vector3();
    shadows.mesh.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);
    assert.ok(position.y>top,`patch must be above rendered parking surface ${top}`);
    assert.ok(position.y<.21,'patch must remain below the lot markings');
  }
});

test('unsupported, airborne, hidden and non-flat positions do not cast a patch',()=>{
  const shadows=new ContactShadows(new T.Scene()),camera=new T.Vector3(-120,4,-115);
  const cases=[
    entity('air',{supportId:null}),entity('dome',{inDome:true}),entity('wall',{supportId:'dome'}),
    entity('ferry',{supportId:'ferry'}),entity('roof',{supportId:'roof:0'}),entity('person',{kind:'person'}),
    entity('far'),entity('hidden'),entity('render-air'),entity('unsupported'),entity('edge'),entity('hill'),
  ];
  const meshes=new Map(cases.map(e=>[e.id,vehicle(-120,0,-120)]));
  meshes.get('far')!.position.x=-220;
  meshes.get('hidden')!.visible=false;
  meshes.get('render-air')!.position.y=2;
  meshes.get('unsupported')!.position.set(200,0,-100);
  // The center is on the Bay Bridge but the car footprint extends past its edge.
  assert.equal(terrainHeight(110,71.8),0);
  meshes.get('edge')!.position.set(110,0,71.8);
  assert.ok((terrainHeight(-100,630)??0)>0);
  meshes.get('hill')!.position.set(-100,0,630);
  assert.equal(terrainHeight(200,-100),null);
  for(const item of cases){
    const itemCamera=item.id==='far'?camera:meshes.get(item.id)!.position.clone().add(new T.Vector3(0,4,5));
    shadows.update([item],meshes,itemCamera);
    assert.equal(shadows.mesh.count,0,item.id);assert.equal(shadows.mesh.visible,false,item.id);
  }
});

test('the shared batch is bounded and keeps the controlled car first',()=>{
  const shadows=new ContactShadows(new T.Scene()),camera=new T.Vector3(-120,4,-115);
  const entities=Array.from({length:40},(_,i)=>entity(String(i)));
  const meshes=new Map(entities.map((e,i)=>[e.id,vehicle(-120+i*.01,0,-120)]));
  const controlled=entities[entities.length-1];
  shadows.update(entities,meshes,camera,controlled);
  assert.equal(shadows.mesh.count,32);
  const matrix=new T.Matrix4(),position=new T.Vector3();shadows.mesh.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);
  assert.ok(Math.abs(position.x-meshes.get(controlled.id)!.position.x)<.00001);
});
