import * as T from 'three';
import { CHARGER_LOT, stationStalls, type Station } from '../shared/stations';
import { material } from './vehicles';

const boxGeometry=new T.BoxGeometry(1,1,1);

/** Stylized lot furniture and venue sign; these details do not create collision. */
export function addStationArt(scene:T.Scene,station:Station) {
  const {x,z}=station;
  const accent=station.setting==='retail'?0xc04e42:station.setting==='museum'?0x6595a4:
    station.setting==='garage'?0xd2ad55:station.setting==='fictional'?0x75b7a6:0xbb866e;
  const boxes=new Map<number,{x:number;y:number;z:number;w:number;h:number;d:number}[]>();
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>{
    const batch=boxes.get(color)??[];batch.push({x,y,z,w,h,d});boxes.set(color,batch);
  };
  // Parking aisle stripes and a colored edge evoke the type of venue without
  // pretending to reproduce the real site's surveyed layout.
  box(x,.15,z-CHARGER_LOT.length/2+1,CHARGER_LOT.width,.06,1.2,accent);
  for(const side of [-1,1])for(const dz of [-2,5,12]){
    box(x+side*17,.16,z+dz,5,.035,.12,0xe8e1c9);
  }
  for(const stall of stationStalls(station)){
    // Charger posts and mint stop bars identify the fictional air-refill bays.
    box(stall.x,.21,stall.z-stall.length/2+.7,3.4,.04,.25,0x9ef7cb);
    const postZ=stall.z-stall.length/2-.8;
    box(stall.x-.46,1.2,postZ,.24,2.4,.6,0xf3e8d6);
    box(stall.x+.46,1.2,postZ,.24,2.4,.6,0xf3e8d6);
    box(stall.x,2.28,postZ,1.16,.24,.6,0xf3e8d6);
    box(stall.x,1.2,postZ,.68,1.7,.14,0xd34537);
  }
  // Keep each site's bounds separate so distant lots can be culled.
  const matrix=new T.Matrix4();
  for(const [color,items] of boxes){
    const mesh=new T.InstancedMesh(boxGeometry,material(color),items.length);
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scene.add(mesh);
  }
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#243c3e';ctx.fillRect(0,0,1024,256);
  ctx.fillStyle=station.sourceUrl?'#c64e42':'#75b7a6';ctx.fillRect(0,0,1024,42);
  ctx.textAlign='center';ctx.fillStyle='#fff4df';ctx.font='bold 28px system-ui';
  ctx.fillText(station.sourceUrl?'SUPERCHARGER · FICTIONAL AIR REFILL':'FICTIONAL AIR STATION',512,30,980);
  ctx.font='bold 48px system-ui';ctx.fillText(station.venue.toUpperCase(),512,102,970);
  ctx.font='30px system-ui';ctx.fillText(station.name.toUpperCase(),512,154,970);
  ctx.font='27px system-ui';ctx.fillText(station.address??'Fictional game location',512,208,970);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sign=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:false}));
  sign.position.set(x,5.3,z-18.8);sign.scale.set(14,3.5,1);scene.add(sign);
}
