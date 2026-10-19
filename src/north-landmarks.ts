import * as T from 'three';
import { buildNorthLandmarkModel } from '../shared/north-landmark-models';
import { NORTH_LANDMARKS, NORTH_NATURAL_LANDMARKS, type NorthLandmarkShape } from '../shared/north-landmarks';
import { terrainHeight } from '../shared/map';
import { material } from './vehicles';
import { buildSfNorthLandmark } from '../shared/new-landmarks-sf-north-models';
import { buildPeninsulaSouthLandmark } from '../shared/new-landmarks-peninsula-south-models';
import { buildEastBayLandmark } from '../shared/new-landmarks-east-bay-models';

/** Original low-poly silhouettes; footprints are shared with the simulation. */
type LandmarkModel = {id:string;name:string;x:number;z:number;w:number;d:number;h:number;shape:NorthLandmarkShape};
type SummitMarker = {id:string;name:string;x:number;z:number};
export function buildNorthLandmarks(scene:T.Scene, places:readonly LandmarkModel[]=NORTH_LANDMARKS, summits:readonly SummitMarker[]=NORTH_NATURAL_LANDMARKS) {
  type Shape='box'|'cylinder'|'cone'|'dome'|'arc';
  type Part={x:number;y:number;z:number;w:number;h:number;d:number;angle:number;color:number};
  const geometries:Record<Shape,T.BufferGeometry>={
    box:new T.BoxGeometry(1,1,1),
    cylinder:new T.CylinderGeometry(.5,.5,1,12),
    // Rotate the unit roof before anisotropic scaling, keeping long roofs
    // aligned with their collision footprints.
    cone:new T.ConeGeometry(.5,1,4).rotateY(Math.PI/4),
    // The dome sits on y=0 and its top is y=.5 before scaling.
    dome:new T.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2),
    arc:new T.RingGeometry(.33,.5,18,1,0,Math.PI).rotateX(-Math.PI/2),
  };
  const batches=new Map<Shape,{geometry:T.BufferGeometry;parts:Part[]}>();
  const put=(shape:Shape,color:number,x:number,y:number,z:number,w:number,h:number,d:number,angle=0)=>{
    const batch=batches.get(shape)??{geometry:geometries[shape],parts:[]};
    batch.parts.push({x,y,z,w,h,d,angle,color});batches.set(shape,batch);
  };
  const stone=0xc7bda8;
  const labelPositions:number[]=[],labelUvs:number[]=[],labelIndices:number[]=[];
  // Most geographic cells hold only a few labels. Size their atlas to the
  // actual number of rows instead of allocating a full 4 MB texture each.
  const atlas=document.createElement('canvas');atlas.width=1024;
  atlas.height=Math.max(64,2**Math.ceil(Math.log2(Math.max(1,Math.ceil((places.length+summits.length)/2))*38)));
  const ctx=atlas.getContext('2d')!;
  ctx.textAlign='center';ctx.textBaseline='middle';
  places.forEach((p,index)=>{
    const base=terrainHeight(p.x,p.z)??0, {w,d}=p;
    const box=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('box',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const cyl=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('cylinder',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const roof=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('cone',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const dome=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('dome',c,p.x+x,base+y,p.z+z,ww,2*hh,dd);
    const parts={box,cyl,roof,dome};
    if(!buildSfNorthLandmark(p,parts)&&!buildPeninsulaSouthLandmark(p,parts)&&!buildEastBayLandmark(p,parts))buildNorthLandmarkModel(p,{box,cyl,roof,dome,arc:(x,y,z,ww,hh,dd,c)=>put('arc',c,p.x+x,base+y,p.z+z,ww,hh,dd)});
    // A small fixed placard is legible up close, depth-tested, and never floats over traffic.
    const column=index%2,row=Math.floor(index/2),u0=(column*512+6)/1024,u1=(column*512+506)/1024,v0=1-(row*38+35)/atlas.height,v1=1-(row*38+3)/atlas.height;
    const x0=column*512+6,y0=row*38+3;ctx.fillStyle='#18383a';ctx.fillRect(x0,y0,500,32);ctx.fillStyle='#f6ecd6';ctx.font='600 25px system-ui';ctx.fillText(p.name.toUpperCase(),x0+250,y0+16,480);
    const half=w*.39,z=p.z+d*.5+.04,y=base+2.5,offset=labelPositions.length/3;
    labelPositions.push(p.x-half,y-.8,z,p.x+half,y-.8,z,p.x+half,y+.8,z,p.x-half,y+.8,z);
    labelUvs.push(u0,v0,u1,v0,u1,v1,u0,v1);labelIndices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    for(const side of [-1,1])box(side*w*.29,1, d*.48,.15,2,.15,stone);
  });
  // Summit signs are decorative and sample the same height as vehicle physics.
  summits.forEach((p,i)=>{
    const index=places.length+i,column=index%2,row=Math.floor(index/2),x=p.x+(p.id==='twin-peaks'?10:0),z=p.z;
    const ground=terrainHeight(x,z)??0,y=ground+2.5;
    const x0=column*512+6,y0=row*38+3,u0=x0/1024,u1=(x0+500)/1024,v0=1-(y0+32)/atlas.height,v1=1-y0/atlas.height;
    ctx.fillStyle='#18383a';ctx.fillRect(x0,y0,500,32);ctx.fillStyle='#f6ecd6';ctx.font='600 25px system-ui';ctx.fillText(p.name.toUpperCase(),x0+250,y0+16,480);
    const offset=labelPositions.length/3;labelPositions.push(x-4.5,y-.8,z,x+4.5,y-.8,z,x+4.5,y+.8,z,x-4.5,y+.8,z);
    labelUvs.push(u0,v0,u1,v0,u1,v1,u0,v1);labelIndices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    put('box',stone,x,ground+.85,z-.08,.18,1.7,.18);
  });
  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),up=new T.Vector3(0,1,0),color=new T.Color();
  for(const batch of batches.values()){
    const mesh=new T.InstancedMesh(batch.geometry,material(0xffffff),batch.parts.length);
    batch.parts.forEach((p,i)=>{mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y,p.z),rotation.setFromAxisAngle(up,p.angle),scale.set(p.w,p.h,p.d)));mesh.setColorAt(i,color.setHex(p.color));});
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();scene.add(mesh);
  }
  const labels=new T.BufferGeometry();labels.setAttribute('position',new T.Float32BufferAttribute(labelPositions,3));labels.setAttribute('uv',new T.Float32BufferAttribute(labelUvs,2));labels.setIndex(labelIndices);labels.computeVertexNormals();
  const texture=new T.CanvasTexture(atlas);texture.colorSpace=T.SRGBColorSpace;
  scene.add(new T.Mesh(labels,new T.MeshBasicMaterial({map:texture,side:T.DoubleSide})));
}
