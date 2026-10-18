import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EAST_SOUTH_ADDITIONS, type EastSouthAddition } from '../shared/east-south-additions';
import { terrainHeight } from '../shared/map';

/** Original compact silhouettes and text labels, with no downloaded assets. */
export function buildEastSouthAdditions(scene:T.Scene):void {
 const cube=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,16);
 const dome=new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2);
 const materials=new Map<number,T.MeshStandardMaterial>();
 const material=(color:number)=>{
  let value=materials.get(color);
  if(!value){value=new T.MeshStandardMaterial({color,roughness:.84});materials.set(color,value);}
  return value;
 };
 const block=(g:T.Group,x:number,y:number,z:number,w:number,h:number,d:number,color:number,geometry:T.BufferGeometry=cube)=>{
  const mesh=new T.Mesh(geometry,material(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);g.add(mesh);return mesh;
 };
 const label=(place:EastSouthAddition)=>{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
  const context=canvas.getContext('2d')!;context.fillStyle='rgba(30,48,47,.92)';context.fillRect(0,0,512,112);
  context.strokeStyle='#e9d8ae';context.lineWidth=3;context.strokeRect(2,2,508,108);
  context.textAlign='center';context.textBaseline='middle';context.font='bold 28px system-ui';context.fillStyle='#fff5db';
  context.fillText(place.name,256,56,480);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(36,8,1);
  const lod=new T.LOD();lod.position.y=place.h+5;lod.addLevel(sprite,0);lod.addLevel(new T.Group(),280);return lod;
 };
 for(const place of EAST_SOUTH_ADDITIONS){
  const g=new T.Group();g.position.set(place.x,terrainHeight(place.x,place.z)??0,place.z);
  const {w,d,h}=place;
  if(place.id==='chabot-space'){
   // Chabot's observation deck and twin telescope domes.
   block(g,0,h*.2,0,w,h*.4,d,0xb9b4a3);
   block(g,0,h*.41,0,w,h*.03,d,0xe2d9c8);
   for(const [x,r] of [[-w*.22,6],[w*.2,5]] as const){
    block(g,x,h*.6,0,r,h*.35,r,0xd8d8ca,cylinder);
    block(g,x,h*.775,0,r,h*.21,r,0xf1eee2,dome);
    block(g,x,h*.87,0,.7,h*.2,.7,0x7f8885);
   }
   for(const x of [-.37,-.12,.12,.37])block(g,x*w,h*.21,d*.501,w*.13,h*.19,.04,0x688d92);
  }else if(place.id==='oakland-zoo'){
   // Zoo entry and a static, brightly colored cable-car cabin.
   block(g,0,h*.24,0,w,h*.48,d,0x9ead85);
   block(g,0,h*.5,0,w,h*.04,d,0xe1d3aa);
   for(const x of [-.38,.38]){
    block(g,x*w,h*.58,d*.25,w*.12,h*.25,d*.16,0xe1d3aa);
    block(g,x*w,h*.72,d*.25,w*.14,h*.05,d*.19,0x86775d);
   }
   block(g,0,h*.28,d*.501,w*.25,h*.3,.04,0x5c6d67);
   for(const x of [-.28,.28])block(g,x*w,h*.28,d*.501,w*.14,h*.21,.04,0x719997);
   block(g,0,h*.91,0,w*.74,.18,.18,0x5c6d67);
   block(g,w*.12,h*.8,0,5,h*.15,4,0xe9b45d);
   block(g,w*.12,h*.81,d*.08,3,h*.065,.04,0x719997);
   block(g,w*.12,h*.89,0,.3,h*.05,.3,0x5c6d67);
  }else if(place.id==='nasa-ames'){
   // Research campus and a stylized wind-tunnel test section.
   block(g,0,h*.23,0,w,h*.46,d,0xb7c4c2);
   for(const x of [-.36,-.12,.12,.36])block(g,x*w,h*.25,d*.501,w*.17,h*.2,.04,0x688f9a);
   block(g,0,h*.5,0,w,h*.05,d,0xe2e4d8);
   const tube=block(g,0,h*.7,0,6,d*.74,6,0xcbd3cb,cylinder);tube.rotation.x=Math.PI/2;
   const mouth=block(g,0,h*.7,d*.375,6,.08,6,0x647d82,cylinder);mouth.rotation.x=Math.PI/2;
   for(const angle of [0,Math.PI/3,2*Math.PI/3]){
    const blade=block(g,0,h*.7,d*.38,9,.4,.04,0xdce2d9);blade.rotation.z=angle;
   }
  }else{
   // Compact football bowl, red fascia and an upper scoreboard.
   block(g,0,h*.24,0,w,h*.48,d,0xc6c7b8);
   block(g,0,h*.5,0,w,h*.08,d,0xa24e45);
   block(g,0,h*.58,0,w*.92,h*.08,d*.9,0xdfddd0);
   block(g,0,h*.66,0,w*.8,h*.08,d*.78,0xa24e45);
   block(g,0,h*.73,0,w*.65,h*.06,d*.62,0x849c78);
   for(const x of [-.24,0,.24])block(g,x*w,h*.765,0,.12,.04,d*.5,0xdfddd0);
   block(g,0,h*.87,-d*.36,w*.45,h*.14,1,0x4b6569);
   block(g,0,h*.87,-d*.35,w*.37,h*.075,.04,0xf1d39b);
   for(const x of [-.4,.4])block(g,x*w,h*.79,-d*.35,.5,h*.38,.5,0x4b6569);
   // Entry glazing and a red fascia make the stadium legible from the road.
   for(const x of [-.37,-.25,0,.25,.37])block(g,x*w,h*.18,d*.5,w*.09,h*.22,.06,0x4b6569);
   block(g,0,h*.36,d*.5,w*.53,h*.13,.08,0xa24e45);
  }
  const parts=new Map<T.Material,T.BufferGeometry[]>();
  for(const child of g.children){
   const mesh=child as T.Mesh;mesh.updateMatrix();
   const part=parts.get(mesh.material as T.Material)??[];
   part.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));parts.set(mesh.material as T.Material,part);
  }
  g.clear();
  for(const [partMaterial,geometries] of parts){
   const merged=mergeGeometries(geometries);geometries.forEach(geometry=>geometry.dispose());
   if(merged)g.add(new T.Mesh(merged,partMaterial));
  }
  if(place.id==='levis-stadium'){
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
   const context=canvas.getContext('2d')!;context.textAlign='center';context.textBaseline='middle';
   context.font='bold 48px system-ui';context.fillStyle='#fff5db';context.fillText('LEVI’S STADIUM',256,48,480);
   const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
   const geometry=new T.PlaneGeometry(w*.5,h*.11).translate(0,h*.36,d*.5+.05);
   g.add(new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture,transparent:true})));
  }
  g.add(label(place));scene.add(g);
 }
}
