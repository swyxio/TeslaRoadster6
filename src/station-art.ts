import * as T from 'three';
import { CHARGER_LOT, type Station } from '../shared/stations';
import { box } from './vehicles';

/** Stylized lot furniture and venue sign; these details do not create collision. */
export function addStationArt(scene:T.Scene,station:Station) {
  const {x,z}=station;
  const accent=station.setting==='retail'?0xc04e42:station.setting==='museum'?0x6595a4:
    station.setting==='garage'?0xd2ad55:station.setting==='fictional'?0x75b7a6:0xbb866e;
  // Parking aisle stripes and a colored edge evoke the type of venue without
  // pretending to reproduce the real site's surveyed layout.
  box(scene,x,.15,z-CHARGER_LOT.length/2+1,CHARGER_LOT.width,.06,1.2,accent);
  for(const side of [-1,1])for(const dz of [-2,5,12]){
    box(scene,x+side*17,.16,z+dz,5,.035,.12,0xe8e1c9);
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
