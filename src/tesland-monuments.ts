import * as T from 'three';
import { TESLAND_MONUMENTS } from '../shared/map';
import { box, createVehicle, material } from './vehicles';

/** Original, deliberately fictional public art. Only the shared bases collide. */
export function buildTeslandMonuments(scene:T.Scene) {
  const bronze=0xc49a59, lightBronze=0xe1ba79, darkBronze=0x72573c;
  const sculpt=(parent:T.Object3D,geometry:T.BufferGeometry,color:number,x:number,y:number,z:number)=>{
    const mesh=new T.Mesh(geometry,material(color,.55));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  };
  const limb=(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r1:number,r2:number,color:number)=>{
    const length=a.distanceTo(b),mesh=sculpt(parent,new T.CylinderGeometry(r2,r1,length,12),color,0,0,0);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
  };
  const plaque=(parent:T.Object3D,title:string,subtitle:string,width:number,y:number,z:number)=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#21383a';ctx.fillRect(0,0,1024,256);
    ctx.strokeStyle='#d8b97c';ctx.lineWidth=9;ctx.strokeRect(10,10,1004,236);
    ctx.textAlign='center';ctx.fillStyle='#ffe2a7';ctx.font='bold 64px system-ui';ctx.fillText(title,512,107,950);
    ctx.font='32px system-ui';ctx.fillText(subtitle,512,178,950);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const sign=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map:texture}));
    sign.position.set(0,y,z);parent.add(sign);
  };

  const [colossus,delivery]=TESLAND_MONUMENTS;
  const monument=new T.Group();monument.position.set(colossus.x,0,colossus.z);scene.add(monument);
  // This box exactly matches the authoritative, landable plinth.
  box(monument,0,colossus.h/2,0,colossus.w,colossus.h,colossus.d,0x655b52);
  plaque(monument,'THE ELON COLOSSUS','IN THE YEAR OF THE ROADSTER · 2050',18,6,colossus.d/2+.02);
  for(const x of [-8,8])box(monument,x,12.12,0,1.2,.24,19,0xd2a465);
  // A larger-than-life bronze figure looks south over the Golden Gate and Bay.
  // Boots, trouser legs, jacket, lapels, face and swept hair keep the silhouette legible.
  for(const x of [-5,5]){
    box(monument,x,14.2,2,8,4.4,12,darkBronze);
    limb(monument,new T.Vector3(x,16,0),new T.Vector3(x*.8,51,0),4,4.8,bronze);
  }
  sculpt(monument,new T.CylinderGeometry(13,10,34,12),bronze,0,68,0);
  box(monument,0,57,0,19,4,12,darkBronze);
  const shirt=box(monument,0,71,8.5,5,25,.6,lightBronze);shirt.rotation.z=.03;
  for(const side of [-1,1]){
    const lapel=box(monument,side*5.4,75,9,3,21,.7,darkBronze);lapel.rotation.z=side*.32;
    box(monument,side*7,61,8.5,3,2,.6,lightBronze);
  }
  limb(monument,new T.Vector3(-11,81,0),new T.Vector3(-18,55,0),5,3.8,bronze);
  sculpt(monument,new T.SphereGeometry(4,14,10),lightBronze,-18,52,0);
  limb(monument,new T.Vector3(11,81,0),new T.Vector3(22,93,2),5,3.8,bronze);
  limb(monument,new T.Vector3(22,93,2),new T.Vector3(31,105,6),3.8,2.8,bronze);
  sculpt(monument,new T.SphereGeometry(3.4,14,10),lightBronze,31,106,6);
  box(monument,0,88,0,7,8,7,lightBronze);
  const face=sculpt(monument,new T.SphereGeometry(10,20,16),lightBronze,0,99,0);face.scale.set(.9,1.18,.82);
  const hair=sculpt(monument,new T.SphereGeometry(10,20,12,0,Math.PI*2,0,Math.PI*.48),darkBronze,0,104,-.4);hair.scale.set(.95,.72,.86);
  for(const x of [-3.5,3.5]){
    box(monument,x,101,7.7,3,.8,.5,darkBronze);
    box(monument,x,99.5,8,1.1,.6,.4,darkBronze);
  }
  sculpt(monument,new T.SphereGeometry(1.4,10,8),lightBronze,0,97,8.4).scale.set(.8,1.6,1.3);
  box(monument,0,93.5,7.7,4,.65,.4,darkBronze);

  const first=new T.Group();first.position.set(delivery.x,0,delivery.z);scene.add(first);
  box(first,0,delivery.h/2,0,delivery.w,delivery.h,delivery.d,0x655b52);
  plaque(first,'THE FIRST DELIVERY','ONE SMALL ORDER · ONE GIANT SHORTCUT',12,3,delivery.d/2+.02);
  const support=box(first,0,10,0,2,8,2,0xc9a366);support.rotation.z=-.35;
  const car=createVehicle('roadster');car.position.set(0,14,0);car.rotation.set(-.22,.5,.08);car.scale.setScalar(2.5);first.add(car);
  for(const side of [-1,1])box(first,side*4.5,7,0,.4,2,.4,0xe3a95c);
}
