import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TECH_CAMPUSES, type TechCampus } from '../shared/tech-campuses';
import { terrainHeight } from '../shared/map';

/** Every building body follows a shared collision envelope. Accents are original. */
export function buildTechCampuses(scene:T.Scene):void {
 const cube=new T.BoxGeometry(1,1,1);
 const materials=new Map<number,T.MeshStandardMaterial>();
 const material=(color:number)=>{
  let result=materials.get(color);
  if(!result){result=new T.MeshStandardMaterial({color,roughness:.8});materials.set(color,result);}
  return result;
 };
 const block=(g:T.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>{
  const mesh=new T.Mesh(cube,material(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);g.add(mesh);return mesh;
 };
 function label(campus:TechCampus){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(30,48,47,.92)';ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='#e9d8ae';ctx.lineWidth=4;ctx.strokeRect(2,2,508,124);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff5db';
  ctx.font='bold 38px system-ui';ctx.fillText(campus.name,256,42,480);
  ctx.font='25px system-ui';ctx.fillText(campus.city,256,87,480);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(38,9.5,1);
  const lod=new T.LOD();lod.position.y=Math.max(...campus.buildings.map(b=>b.h))+8;lod.addLevel(sprite,0);lod.addLevel(new T.Group(),320);return lod;
 }
 for(const campus of TECH_CAMPUSES){
  const group=new T.Group();group.position.set(campus.x,terrainHeight(campus.x,campus.z)??0,campus.z);
  for(const b of campus.buildings){
   const x=b.x-campus.x,z=b.z-campus.z;
   // Continuous vertical bands fill the exact envelope and remain visible
   // from every side, including the inside of the Apple Park courtyard.
   const bands=[{from:0,to:.26,color:campus.color},{from:.26,to:.44,color:campus.glass},
    {from:.44,to:.57,color:campus.color},{from:.57,to:.75,color:campus.glass},
    {from:.75,to:1,color:campus.color}];
   for(const band of bands)block(group,x,b.h*(band.from+band.to)/2,z,b.w,b.h*(band.to-band.from),b.d,band.color);
  }
  const main=campus.buildings[0];
  if(campus.id==='stripe'){
   // Purple stepped roof bands suggest the brand without reproducing its logo.
   for(let i=0;i<4;i++)block(group,(i-1.5)*9,main.h+.015,0,5,.03,main.d*.86,0x8870bd);
  }else if(campus.id==='google'){
   // Colorful low-profile roof panels and the labeled low-rise campus.
   [0x6587c5,0xe77b68,0xe3bb63,0x7da978].forEach((color,i)=>block(group,(i-1.5)*12,main.h+.015,0,10,.03,main.d*.75,color));
  }else if(campus.id==='meta'){
   // A planted roof recalls the Menlo Park campus.
   block(group,0,main.h+.015,0,main.w*.86,.03,main.d*.8,0x86a675);
   for(const x of [-24,-12,0,12,24])block(group,x,main.h+.035,0,3,.01,main.d*.75,0xc5b99e);
  }else if(campus.id==='nvidia'){
   // Three angular roof strokes evoke the triangular campus roofline.
   for(let i=-2;i<=2;i++){
    const mesh=block(group,i*8,main.h+.015,0,1,.03,main.d*.62,0xc6d3c6);mesh.rotation.y=.45;
   }
  }else{
   // Flat lawn is decorative, with the central courtyard left unblocked.
   block(group,0,.025,0,42,.05,42,0x9ab38b);
  }
  // Merge by material per campus to keep the stepped ring inexpensive while
  // retaining independent frustum culling for each destination.
  const parts=new Map<T.Material,T.BufferGeometry[]>();
  for(const child of group.children){
   const mesh=child as T.Mesh;mesh.updateMatrix();
   const geometries=parts.get(mesh.material as T.Material)??[];
   geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));parts.set(mesh.material as T.Material,geometries);
  }
  group.clear();
  for(const [campusMaterial,geometries] of parts){
   const merged=mergeGeometries(geometries);geometries.forEach(geometry=>geometry.dispose());
   if(merged)group.add(new T.Mesh(merged,campusMaterial));
  }
  group.add(label(campus));scene.add(group);
 }
}
