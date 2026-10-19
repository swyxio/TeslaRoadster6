import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addBuildingWindows } from '../src/building-windows';

test('framed windows share culled batches and face out from each wall',()=>{
  const scene=new T.Scene();
  addBuildingWindows(scene,[
    {x:10,y:4,z:20,width:1.9,height:1.9,angle:0,color:0x49676e},
    {x:11,y:4,z:20,width:1.9,height:1.9,angle:Math.PI,color:0x597a82},
    {x:800,y:4,z:20,width:1.45,height:1.7,angle:Math.PI/2,color:0x68828a},
  ]);
  assert.equal(scene.children.length,2,'only one draw batch per occupied cell');
  const first=scene.children[0] as T.InstancedMesh,second=scene.children[1] as T.InstancedMesh;
  assert.equal(first.geometry,second.geometry);assert.equal(first.material,second.material);
  assert.equal(first.count,2);assert.equal(second.count,1);
  assert.equal(first.geometry.index!.count/3,10,'fewer triangles per pane than the old 12-triangle box');
  assert.ok(first.boundingSphere&&second.boundingSphere,'district batches have culling bounds');
  const transform=new T.Matrix4(),normal=new T.Vector3(0,0,1);
  first.getMatrixAt(1,transform);normal.transformDirection(transform);
  assert.ok(normal.z<-.99,'back wall points outward');
  second.getMatrixAt(0,transform);normal.set(0,0,1).transformDirection(transform);
  assert.ok(normal.x>.99,'side wall points outward');
  const colors=first.instanceColor!;
  assert.notEqual(colors.getX(0),colors.getX(1),'facade tints vary within a batch');
});
