import * as T from 'three';
import { NORTH_LANDMARKS, NORTH_NATURAL_LANDMARKS, type NorthLandmarkShape } from '../shared/north-landmarks';
import { terrainHeight } from '../shared/map';
import { material } from './vehicles';
import { buildSfNorthLandmark } from './new-landmarks-sf-north-models';
import { buildPeninsulaSouthLandmark } from './new-landmarks-peninsula-south-models';
import { buildEastBayLandmark } from './new-landmarks-east-bay-models';

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
  const cream=0xe1d9c5,stone=0xc7bda8,red=0xab6255,dark=0x405c60,glass=0x86aeb0,green=0x598471,gold=0xd9b571;
  const labelPositions:number[]=[],labelUvs:number[]=[],labelIndices:number[]=[];
  // Most geographic cells hold only a few labels. Size their atlas to the
  // actual number of rows instead of allocating a full 4 MB texture each.
  const atlas=document.createElement('canvas');atlas.width=1024;
  atlas.height=Math.max(64,2**Math.ceil(Math.log2(Math.max(1,Math.ceil((places.length+summits.length)/2))*38)));
  const ctx=atlas.getContext('2d')!;
  ctx.textAlign='center';ctx.textBaseline='middle';
  places.forEach((p,index)=>{
    const base=terrainHeight(p.x,p.z)??0, {w,d,h}=p;
    const box=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('box',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const cyl=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('cylinder',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const roof=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('cone',c,p.x+x,base+y,p.z+z,ww,hh,dd);
    const dome=(x:number,y:number,z:number,ww:number,hh:number,dd:number,c:number)=>put('dome',c,p.x+x,base+y,p.z+z,ww,2*hh,dd);
    const body=(height:number,c=cream)=>box(0,height/2,0,w*.86,height,d*.8,c);
    const columns=(count:number,height:number,c=cream)=>{for(let i=0;i<count;i++)box((i-(count-1)/2)*w*.13,height/2,d*.42,w*.055,height,d*.07,c);};
    const windows=(height:number)=>{for(const side of [-1,1])for(const xx of [-.27,0,.27])box(w*xx,height*.6,side*d*.405,w*.10,height*.28,.06,dark);};
    const parts={box,cyl,roof,dome};
    if(!buildSfNorthLandmark(p,parts)&&!buildPeninsulaSouthLandmark(p,parts)&&!buildEastBayLandmark(p,parts))switch(p.shape){
      case 'fort':
        body(h*.7,red);for(let i=0;i<5;i++)box((i-2)*w*.17,h*.8,d*.36,w*.10,h*.2,d*.08,stone);windows(h*.65);break;
      case 'rotunda':
        cyl(0,h*.11,0,w*.87,h*.22,d*.87,stone);for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(Math.cos(a)*w*.3,h*.38,Math.sin(a)*d*.3,w*.06,h*.56,d*.06,cream);}cyl(0,h*.68,0,w*.8,h*.08,d*.8,stone);dome(0,h*.72,0,w*.7,h*.28,d*.7,cream);break;
      case 'organ':
        box(0,1,0,w*.85,2,d*.8,stone);for(let i=0;i<9;i++){const a=i*Math.PI*2/9,ph=h*(.36+(i%3)*.2);cyl(Math.cos(a)*w*.25,2+ph/2,Math.sin(a)*d*.24,w*.09,ph,d*.09,cream);}break;
      case 'crooked':
        box(0,1,0,w*.85,2,d*.82,green);for(let i=0;i<4;i++){box((i%2?-.12:.12)*w,2.2+i*.9,(i-1.5)*d*.18,w*.6,.4,d*.09,0x7b7470);box((i%2?-.32:.32)*w,2.3+i*.9,(i-1.5)*d*.18,w*.08,.5,d*.16,red);}break;
      case 'plaza':
        body(h*.64,red);windows(h*.6);box(0,h*.73,0,w*.34,h*.18,d*.34,stone);roof(0,h*.9,0,w*.48,h*.2,d*.48,red);break;
      case 'pier':
        body(h*.63,0xcfae7f);windows(h*.6);roof(0,h*.82,0,w*.92,h*.36,d*.88,red);box(0,h*.55,d*.42,w*.6,h*.13,.2,dark);break;
      case 'maritime':
        body(h*.52,cream);box(0,h*.62,0,w*.72,h*.2,d*.7,cream);box(0,h*.78,0,w*.45,h*.14,d*.5,glass);cyl(-w*.25,h*.89,-d*.12,w*.08,h*.2,d*.08,red);windows(h*.5);break;
      case 'church':
      case 'cathedral':
        body(h*.45,stone);roof(0,h*.53,0,w*.85,h*.18,d*.8,red);
        for(const side of [-1,1]){box(side*w*.31,h*.48,d*.24,w*.21,h*.8,d*.25,cream);roof(side*w*.31,h*.91,d*.24,w*.27,h*.18,d*.3,green);box(side*w*.31,h*.55,d*.38,w*.09,h*.25,.05,dark);}break;
      case 'gate':
        for(const side of [-1,1]){box(side*w*.34,h*.42,0,w*.14,h*.84,d*.25,cream);roof(side*w*.34,h*.9,0,w*.25,h*.2,d*.38,green);}box(0,h*.7,0,w*.72,h*.12,d*.2,red);roof(0,h*.84,0,w*.95,h*.15,d*.5,green);break;
      case 'pagoda':
      case 'tea':
        cyl(0,h*.42,0,w*.18,h*.84,d*.18,cream);for(let i=0;i<4;i++){const yy=h*(.23+i*.21),scale=1-i*.13;roof(0,yy,0,w*.93*scale,h*.13,d*.9*scale,p.shape==='tea'?red:cream);cyl(0,yy-.02,0,w*.65*scale,h*.07,d*.65*scale,stone);}break;
      case 'houses':
        for(let i=0;i<4;i++){const xx=(i-1.5)*w*.21,hh=h*(.6+(i%2)*.09),ww=w*.19;box(xx,hh/2,0,ww,hh,d*.7,[0xd19c92,0xb1c4bd,0xe0c89d,0xc3a7b1][i]);roof(xx,hh+(h-hh)/2,0,ww*1.4,h-hh,d*.88,red);box(xx,hh*.6,d*.36,ww*.45,hh*.2,.05,dark);}break;
      case 'civic':
        body(h*.48,cream);columns(5,h*.42,stone);cyl(0,h*.56,0,w*.43,h*.16,d*.43,stone);dome(0,h*.64,0,w*.42,h*.28,d*.42,cream);cyl(0,h*.95,0,w*.05,h*.1,d*.05,gold);break;
      case 'museum':
        body(h*.7,stone);box(0,h*.8,0,w*.9,h*.2,d*.84,cream);windows(h*.66);break;
      case 'opera':
      case 'library':
        body(h*.72,cream);columns(5,h*.65,stone);roof(0,h*.86,0,w*.95,h*.27,d*.94,stone);break;
      case 'theatre':
        body(h*.66,stone);windows(h*.58);box(0,h*.56,d*.44,w*.68,h*.18,d*.12,gold);box(0,h*.77,0,w*.24,h*.46,d*.2,red);box(0,h*.84,d*.12,w*.12,h*.3,.05,gold);break;
      case 'academy':
        body(h*.56,glass);for(const xx of [-.27,0,.27])dome(xx*w,h*.56,0,w*.36,h*.4,d*.8,green);break;
      case 'deyoung':
        body(h*.42,red);windows(h*.4);box(w*.22,h*.62,-d*.1,w*.34,h*.76,d*.36,red);box(w*.22,h*.85,-d*.1,w*.36,h*.06,d*.38,stone);break;
      case 'greenhouse':
        body(h*.43,glass);for(const xx of [-.28,0,.28])dome(xx*w,h*.43,0,w*.38,h*.5,d*.78,0xc7dfd8);for(const side of [-1,1])box(side*w*.27,h*.28,d*.41,.2,h*.5,.15,cream);break;
      case 'radio':
        for(const side of [-1,1]){box(side*w*.25,h*.45,0,w*.09,h*.9,d*.12,red);box(side*w*.25,h*.93,0,w*.12,h*.14,d*.17,cream);}for(const yy of [.25,.5,.75])box(0,h*yy,0,w*.58,h*.035,d*.12,cream);break;
      case 'cliff':
        body(h*.64,cream);windows(h*.55);roof(0,h*.82,0,w*.94,h*.36,d*.9,red);break;
      case 'baths':
        box(0,.5,0,w*.84,1,d*.8,stone);box(0,1.02,0,w*.66,.07,d*.62,glass);for(const side of [-1,1])for(const xx of [-.3,0,.3])cyl(xx*w,h*.42,side*d*.35,w*.06,h*.84,d*.06,cream);break;
      case 'stadium':
        cyl(0,h*.36,0,w*.88,h*.72,d*.88,stone);cyl(0,h*.73,0,w*.65,h*.08,d*.65,green);for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(Math.cos(a)*w*.39,h*.66,Math.sin(a)*d*.39,w*.06,h*.68,d*.06,cream);}break;
      case 'modern':
        body(h*.62,cream);box(0,h*.74,0,w*.7,h*.24,d*.7,cream);for(const y of [.29,.43,.57])box(0,h*y,d*.405,w*.8,h*.035,.06,stone);box(0,h*.91,0,w*.56,h*.18,d*.56,glass);break;
      case 'mission':
        body(h*.65,cream);roof(0,h*.8,0,w*.9,h*.3,d*.85,red);for(const side of [-1,1]){box(side*w*.3,h*.56,d*.25,w*.15,h*.85,d*.2,cream);roof(side*w*.3,h*.94,d*.25,w*.21,h*.12,d*.25,red);}box(0,h*.72,d*.43,w*.04,h*.2,.06,stone);box(0,h*.74,d*.44,w*.18,h*.035,.06,stone);break;
      case 'lighthouse':
        cyl(0,h*.4,0,w*.4,h*.8,d*.4,cream);cyl(0,h*.82,0,w*.46,h*.15,d*.46,dark);roof(0,h*.95,0,w*.56,h*.1,d*.56,red);break;
      case 'battery':
        body(h*.5,stone);box(0,h*.58,0,w*.78,h*.16,d*.72,green);for(const side of [-1,1])box(side*w*.28,h*.72,0,w*.16,h*.4,d*.38,stone);break;
      case 'barracks':
        body(h*.62,cream);windows(h*.55);roof(0,h*.81,0,w*.96,h*.38,d*.9,red);break;
      case 'missile':
        body(h*.38,green);cyl(0,h*.53,0,w*.13,h*.7,d*.13,cream);roof(0,h*.91,0,w*.18,h*.18,d*.18,red);break;
      case 'crystal':
        cyl(0,h*.13,0,w*.8,h*.26,d*.8,stone);dome(0,h*.26,0,w*.8,h*.7,d*.8,glass);for(const side of [-1,1])box(side*w*.22,h*.48,d*.2,.22,h*.7,.22,cream);break;
      case 'castle':
        body(h*.52,0xd7b5cc);for(const side of [-1,1]){cyl(side*w*.3,h*.4,0,w*.25,h*.8,d*.25,cream);roof(side*w*.3,h*.9,0,w*.32,h*.2,d*.32,red);}break;
      case 'temple':
        body(h*.46,cream);box(0,h*.58,0,w*.64,h*.24,d*.56,cream);for(const xx of [-.25,0,.25]){box(xx*w,h*.76,0,w*.07,h*.28,d*.07,cream);roof(xx*w,h*.94,0,w*.12,h*.12,d*.12,gold);}break;
      case 'greek':
        box(0,h*.08,0,w*.86,h*.16,d*.8,stone);for(let i=0;i<4;i++)put('arc',cream,p.x,base+h*(.2+i*.14),p.z,w*(.55+i*.1),1,d*(.55+i*.1));box(0,h*.26,d*.24,w*.65,h*.12,d*.16,cream);break;
    }
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
