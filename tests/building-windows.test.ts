import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addBuildingWindows, storefrontWindows } from '../src/building-windows';
import { BUILDINGS } from '../shared/map';

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

test('storefronts are bounded wall details only on generic midrises and towers',()=>{
  for(const b of BUILDINGS){
    const windows=storefrontWindows(b);
    if(b.style!=='midrise'&&b.style!=='tower'){
      assert.equal(windows.length,0,b.style);
      continue;
    }
    assert.equal(windows.length,24);
    for(const angle of [0,Math.PI,Math.PI/2,-Math.PI/2]){
      const face=windows.filter(p=>p.angle===angle);
      assert.equal(face.length,6);
      const side=Math.abs(Math.sin(angle))>.5,extent=side?b.w/2:b.d/2;
      const span=side?b.d:b.w;
      for(const p of face){
        const dx=p.x-b.x,dz=p.z-b.z;
        assert.ok(Math.abs(dx*Math.sin(angle)+dz*Math.cos(angle)-extent-.03)<1e-9);
        assert.ok(Math.abs(dx*Math.cos(angle)-dz*Math.sin(angle))+p.width/2<=span/2-1+1e-9);
        assert.ok(p.y-p.height/2>0&&p.y+p.height/2<3.8);
      }
      const panes=face.filter(p=>p.height===2.4).sort((a,c)=>
        (a.x-c.x)*Math.cos(angle)-(a.z-c.z)*Math.sin(angle));
      for(let i=1;i<panes.length;i++){
        const gap=(panes[i].x-panes[i-1].x)*Math.cos(angle)-(panes[i].z-panes[i-1].z)*Math.sin(angle);
        assert.ok(gap>(panes[i].width+panes[i-1].width)/2,'entrance and glazing remain distinct');
      }
    }
  }
});

test('storefronts use the existing cell batch and shared window material',()=>{
  const b=BUILDINGS.find(b=>b.style==='midrise')!,scene=new T.Scene();
  const storefront=storefrontWindows(b).map(p=>({...p,x:p.x+10000,z:p.z+10000}));
  addBuildingWindows(scene,[{...storefront[0],y:7},...storefront],100000);
  const meshes=scene.children as T.InstancedMesh[];
  assert.equal(meshes.length,1,'the storefront shares its existing window cell');
  assert.equal(meshes[0].count,25);
});
