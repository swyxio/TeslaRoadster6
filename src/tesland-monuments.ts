import * as T from 'three';
import { TESLAND_MONUMENTS } from '../shared/map';
import { box, createVehicle } from './vehicles';

/** Original, deliberately fictional public art. Only the shared bases collide. */
export function buildTeslandMonuments(scene:T.Scene) {
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

  const [delivery]=TESLAND_MONUMENTS;
  const first=new T.Group();first.position.set(delivery.x,0,delivery.z);scene.add(first);
  box(first,0,delivery.h/2,0,delivery.w,delivery.h,delivery.d,0x655b52);
  plaque(first,'THE FIRST DELIVERY','ONE SMALL ORDER · ONE GIANT SHORTCUT',12,3,delivery.d/2+.02);
  const support=box(first,0,10,0,2,8,2,0xc9a366);support.rotation.z=-.35;
  const car=createVehicle('roadster');car.position.set(0,14,0);car.rotation.set(-.22,.5,.08);car.scale.setScalar(2.5);first.add(car);
  for(const side of [-1,1])box(first,side*4.5,7,0,.4,2,.4,0xe3a95c);
}
