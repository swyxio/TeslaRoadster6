import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {STATIONS} from '../shared/stations';
import {addStationArt} from '../src/station-art';

test('charger pylons have fixed readable faces and share their sign textures',()=>{
  const labels:string[]=[];
  const ctx={fillRect(){},fillText(text:string){labels.push(text);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  const original=globalThis.document;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>ctx})}});
  try {
    const scenes=[new T.Scene(),new T.Scene(),new T.Scene()];
    addStationArt(scenes[0],STATIONS.find(s=>s.id==='oakland')!);
    addStationArt(scenes[1],STATIONS.find(s=>s.id==='oakland-hegenberger')!);
    addStationArt(scenes[2],STATIONS.find(s=>s.id==='berkeley-north')!);
    const panels=scenes.map(scene=>{
      assert.ok(!scene.children.some(child=>child instanceof T.Sprite),'no camera-facing sign');
      const matches=scene.children.filter(child=>child instanceof T.InstancedMesh&&child.geometry instanceof T.PlaneGeometry) as T.InstancedMesh[];
      assert.equal(matches.length,1);assert.equal(matches[0].count,2);
      const front=new T.Matrix4(),back=new T.Matrix4();matches[0].getMatrixAt(0,front);matches[0].getMatrixAt(1,back);
      const a=new T.Vector3(0,0,1).transformDirection(front),b=new T.Vector3(0,0,1).transformDirection(back);
      assert.ok(a.dot(b)<-.99,'front and back face opposite directions');
      return matches[0];
    });
    assert.equal(panels[0].material,panels[1].material);
    assert.notEqual(panels[0].material,panels[2].material);
    assert.deepEqual(labels.filter(label=>['SUPERCHARGER','ARCADE STATION','AIR'].includes(label)),
      ['SUPERCHARGER','AIR','ARCADE STATION','AIR']);
  } finally {
    if(original===undefined)delete (globalThis as {document?:Document}).document;
    else Object.defineProperty(globalThis,'document',{configurable:true,value:original});
  }
});
