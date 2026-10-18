import * as T from 'three';
import { CHARGER_LOT, stationStalls, type Station } from '../shared/stations';
import { material } from './vehicles';

const boxGeometry=new T.BoxGeometry(1,1,1);
const signGeometry=new T.PlaneGeometry(10.2,4.8);
const signMaterials=new Map<boolean,T.MeshBasicMaterial>();

/** Two shared, original sign faces: air service is fictional at every site. */
function signMaterial(listed:boolean):T.MeshBasicMaterial {
  const cached=signMaterials.get(listed);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=listed?'#c9483c':'#367a6d';ctx.fillRect(0,0,1024,204);
  ctx.fillStyle='#263b3c';ctx.fillRect(0,204,1024,308);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff5e2';
  ctx.font='900 112px system-ui';ctx.fillText(listed?'SUPERCHARGER':'ARCADE STATION',512,104,955);
  ctx.font='900 182px system-ui';ctx.fillText('AIR',512,337);
  ctx.fillStyle='#9ef7cb';ctx.font='700 32px system-ui';ctx.fillText('FICTIONAL REFILL',512,461);
  // Original chevrons, rather than a manufacturer logo.
  ctx.strokeStyle='#9ef7cb';ctx.lineWidth=13;ctx.lineCap='round';
  for(const x of [170,854]){
    ctx.beginPath();ctx.moveTo(x-30,310);ctx.lineTo(x,335);ctx.lineTo(x-30,360);ctx.stroke();
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const result=new T.MeshBasicMaterial({map:texture,toneMapped:false});
  signMaterials.set(listed,result);return result;
}

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
  // A fixed two-sided pylon, set at the lot edge away from the queue and pickup.
  const signX=x-12,signZ=z+12,signY=7;
  for(const side of [-1,1])box(signX+side*4,2.4,signZ,.48,4.8,.48,0xe8dfca);
  box(signX,signY,signZ,10.8,5.4,.6,0x263b3c);
  box(signX,signY+2.78,signZ,11,.16,.75,accent);
  // Keep each site's bounds separate so distant lots can be culled.
  const matrix=new T.Matrix4();
  for(const [color,items] of boxes){
    const mesh=new T.InstancedMesh(boxGeometry,material(color),items.length);
    items.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();scene.add(mesh);
  }
  // One culled draw per lot for both readable faces; textures are built once.
  const faces=new T.InstancedMesh(signGeometry,signMaterial(!!station.sourceUrl),2);
  faces.setMatrixAt(0,matrix.makeTranslation(signX,signY,signZ+.31));
  faces.setMatrixAt(1,matrix.makeRotationY(Math.PI).setPosition(signX,signY,signZ-.31));
  faces.instanceMatrix.needsUpdate=true;faces.computeBoundingSphere();scene.add(faces);
}
