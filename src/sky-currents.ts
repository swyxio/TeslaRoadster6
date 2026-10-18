import * as T from 'three';
import { JET_STREAMS, THERMALS } from '../shared/sky-currents';

/** Lightweight animated markers only; volumes and forces live in shared code. */
export function createSkyCurrents(){
 const group=new T.Group(),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(1,1,1);
 const makeLabel=(text:string,color:string)=>{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#17383de8';ctx.fillRect(0,4,512,88);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 37px system-ui';ctx.fillText(text,256,49,488);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(15,2.8,1);group.add(sprite);return sprite;
 };
 const dashGeometry=new T.BoxGeometry(14,.32,.65);
 const dashMaterial=new T.MeshBasicMaterial({color:0x71e7ff,transparent:true,opacity:.82,depthWrite:false});
 const jets=JET_STREAMS.map(lane=>{
  const mesh=new T.InstancedMesh(dashGeometry,dashMaterial,24);mesh.frustumCulled=false;group.add(mesh);
  const caltrain=lane.id.startsWith('caltrain-');
  const label=makeLabel(caltrain?`${lane.name.toUpperCase()} · SPEED + AIR`:'SKY LANE · SPEED + AIR',caltrain?'#ffd8ad':'#a8f3ff');
  if(caltrain)label.scale.set(25,4.7,1);
  label.position.set(caltrain?(lane.start.x+lane.end.x)/2:lane.start.x,lane.height+4,caltrain?(lane.start.z+lane.end.z)/2:lane.start.z);
  const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);
  return {lane,mesh,label,length,dx:dx/length,dz:dz/length,rotation:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle)};
 });
 const ringGeometry=new T.TorusGeometry(1,.035,6,32,Math.PI*1.6);
 const ringMaterial=new T.MeshBasicMaterial({color:0xffd887,transparent:true,opacity:.8,depthWrite:false});
 const ringRotation=new T.Quaternion(),ringEuler=new T.Euler();
 const thermals=THERMALS.map(thermal=>{
  const mesh=new T.InstancedMesh(ringGeometry,ringMaterial,8);mesh.frustumCulled=false;group.add(mesh);
  const label=makeLabel('THERMAL · LIFT + AIR','#ffe4a2');label.position.set(thermal.x,thermal.bottom+4,thermal.z);return {thermal,mesh,label};
 });
 const update=(time:number,viewer?:{x:number;y:number;z:number})=>{
  const showLabel=(label:T.Sprite)=>{const distance=viewer?Math.hypot(viewer.x-label.position.x,viewer.y-label.position.y,viewer.z-label.position.z):Infinity;label.visible=distance>20&&distance<180;};
  for(const {lane,mesh,label,length,dx,dz,rotation} of jets){
   showLabel(label);
   // Stop markers outside the fog are neither drawn nor animated; the longer
   // original lanes remain visible along their full extents.
   mesh.visible=!lane.id.startsWith('caltrain-')||!viewer||Math.hypot(viewer.x-label.position.x,viewer.y-lane.height,viewer.z-label.position.z)<1400;
   if(!mesh.visible)continue;
   for(let row=0;row<3;row++)for(let i=0;i<8;i++){
    const along=((i/8+row*.043+time*18/length)%1)*length,side=(row-1)*lane.halfWidth*.7;
    position.set(lane.start.x+dx*along-dz*side,lane.height+(row-1)*lane.halfHeight*.45,lane.start.z+dz*along+dx*side);
    matrix.compose(position,rotation,scale.set(1,1,1));mesh.setMatrixAt(row*8+i,matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;
  }
  for(const {thermal,mesh,label} of thermals){
   showLabel(label);
   for(let i=0;i<8;i++){
    const height=thermal.bottom+((i/8+time*7/(thermal.top-thermal.bottom))%1)*(thermal.top-thermal.bottom);
    position.set(thermal.x,height,thermal.z);
    ringRotation.setFromEuler(ringEuler.set(Math.PI/2,0,time*.35+i*.7));
    matrix.compose(position,ringRotation,scale.setScalar(thermal.radius*.93));mesh.setMatrixAt(i,matrix);
   }
   mesh.instanceMatrix.needsUpdate=true;
  }
 };
 update(0);return {group,update};
}
