import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOUTH_LANDMARKS, type SouthLandmark } from '../shared/south-landmarks';
import { terrainHeight } from '../shared/map';
import { buildSouthLandmarkModel } from '../shared/south-landmark-models';

/** The same authored main masses, roofs and open supports drive rendering and collision. */
export function buildSouthLandmarks(scene:T.Scene):void {
 const cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(1,1,1,16), cone=new T.ConeGeometry(1,1,4), gableCone=cone.clone().rotateY(Math.PI/4), hemisphere=new T.SphereGeometry(1,18,10,0,Math.PI*2,0,Math.PI/2);
 const materials=new Map<string,T.MeshStandardMaterial>();
 const mat=(color:number,doubleSided=false)=>{const key=`${color}:${doubleSided}`;let m=materials.get(key);if(!m){m=new T.MeshStandardMaterial({color,roughness:.86,side:doubleSided?T.DoubleSide:T.FrontSide});materials.set(key,m);}return m;};
 function makeModel(l:SouthLandmark){
  const group=new T.Group();group.position.set(l.x,terrainHeight(l.x,l.z)??0,l.z);
  const geometries={box:cube,cylinder,cone,roof:gableCone,dome:hemisphere};
  for(const part of buildSouthLandmarkModel(l)){
   const mesh=new T.Mesh(geometries[part.geometry],mat(part.color,part.doubleSided));
   mesh.position.set(part.x,part.y,part.z);mesh.scale.set(part.w,part.h,part.d);
   mesh.rotation.set(part.rotationX??0,part.rotationY??0,part.rotationZ??0);
   group.add(mesh);
  }
  return group;
 }
 function label(l:SouthLandmark){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(30,48,47,.88)';ctx.fillRect(0,0,384,96);
  ctx.strokeStyle='#e9d8ae';ctx.lineWidth=3;ctx.strokeRect(2,2,380,92);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 25px system-ui';ctx.fillStyle='#fff5db';
  const words=l.name.split(' '),lines:string[]=[''];for(const word of words){const last=lines.length-1;if((lines[last]+' '+word).length>24&&lines.length===1)lines.push(word);else lines[last]+=(lines[last]?' ':'')+word;}
  if(lines.length===1)ctx.fillText(lines[0],192,48,362);else{ctx.fillText(lines[0],192,33,362);ctx.fillText(lines[1],192,64,362);}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(28,7,1);
  const lod=new T.LOD();lod.position.y=l.h+5;lod.addLevel(sprite,0);lod.addLevel(new T.Group(),230);return lod;
 }
 for(const landmark of SOUTH_LANDMARKS){
  const group=makeModel(landmark),parts=new Map<T.Material,T.BufferGeometry[]>();
  // Merge a landmark's pieces by material while keeping each landmark's own
  // bounding volume, so distant groups remain independently frustum-culled.
  for(const child of group.children){
    const mesh=child as T.Mesh;mesh.updateMatrix();
    const geometries=parts.get(mesh.material as T.Material)??[];
    geometries.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));parts.set(mesh.material as T.Material,geometries);
  }
  group.clear();
  for(const [material,geometries] of parts){
    const merged=mergeGeometries(geometries);
    geometries.forEach(geometry=>geometry.dispose());
    if(merged)group.add(new T.Mesh(merged,material));
  }
  group.add(label(landmark));scene.add(group);
 }
}
