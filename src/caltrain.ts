import * as T from 'three';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { material } from './vehicles';

type Box = {x:number;y:number;z:number;w:number;h:number;d:number;angle?:number};

/** Decorative platforms and flat railway marks; the room simulates no trains. */
export function buildCaltrain(scene:T.Scene):void {
  const boxes=(color:number,items:Box[])=>{
    if(!items.length)return;
    const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(color),items.length);
    const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0);
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle??0),scale.set(p.w,p.h,p.d))));
    mesh.computeBoundingSphere();scene.add(mesh);
  };
  const rails:Box[]=[],ties:Box[]=[];
  for(let i=1;i<CALTRAIN_TRACK.length;i++){
    const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(!length)continue;
    const angle=Math.atan2(dx,dz),acrossX=dz/length,acrossZ=-dx/length;
    for(const side of [-1,1])rails.push({x:(a.x+b.x)/2+side*acrossX*1.15,y:.20,z:(a.z+b.z)/2+side*acrossZ*1.15,w:.25,h:.06,d:length,angle});
    for(let along=3;along<length;along+=14){
      const t=along/length;ties.push({x:a.x+dx*t,y:.165,z:a.z+dz*t,w:3.3,h:.035,d:.8,angle});
    }
  }
  // Flat paint-like rails can be crossed without a collision bump or barrier.
  boxes(0x786c60,ties);boxes(0xb6c2bd,rails);
  const platforms:Box[]=[],roofs:Box[]=[],posts:Box[]=[];
  for(const stop of CALTRAIN_STOPS){
    const {x,z}=stop.platform;
    platforms.push({x,y:.13,z,w:44,h:.12,d:8});
    roofs.push({x,y:4.1,z,w:40,h:.35,d:6});
    for(const dx of [-17,0,17])for(const dz of [-2.4,2.4])posts.push({x:x+dx,y:2.1,z:z+dz,w:.3,h:4,d:.3});
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
    const context=canvas.getContext('2d');if(!context)continue;
    context.fillStyle='#293b3c';context.fillRect(0,0,768,160);
    context.fillStyle='#dd514b';context.fillRect(0,0,768,18);
    context.fillStyle='#fff8e8';context.textAlign='center';context.textBaseline='middle';
    context.font='bold 34px sans-serif';context.fillText('CALTRAIN',384,51);
    context.font='bold 46px sans-serif';context.fillText(stop.name.toUpperCase(),384,108,728);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const label=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true}));
    label.position.set(x,7.2,z);label.scale.set(21,4.4,1);scene.add(label);
  }
  boxes(0xbfc2b4,platforms);boxes(0xc8584d,roofs);boxes(0xe5e1d0,posts);
}
