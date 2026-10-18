import * as T from 'three';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { BUILDINGS, ROADS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { material } from './vehicles';

type Tree={x:number;z:number;y:number;size:number;shade:number};
type Rect={x:number;z:number;w:number;d:number;angle?:number};

function inRect(x:number,z:number,r:Rect,margin:number){
  const c=Math.cos(r.angle??0),s=Math.sin(r.angle??0),dx=x-r.x,dz=z-r.z;
  return Math.abs(dx*c-dz*s)<=r.w/2+margin&&Math.abs(dx*s+dz*c)<=r.d/2+margin;
}

function distanceToTrack(x:number,z:number){
  let best=Infinity;
  for(let i=1;i<CALTRAIN_TRACK.length;i++){
    const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
  }
  return best;
}

/** Original decorative redwoods evoke the town; locations are fictional.
 * Their footprints clear shared roads, lots, buildings, platforms and rails. */
export function redwoodCityTrees():Tree[]{
  const stop=CALTRAIN_STOPS.find(s=>s.id==='redwood-city')!,trees:Tree[]=[];
  for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++){
    const seed=(((col+17)*73856093)^((row+13)*19349663))>>>0;
    if(seed%5===0)continue;
    const x=stop.platform.x+col*24+(seed%7-3),z=stop.platform.z+row*24+(Math.floor(seed/7)%7-3);
    if(Math.hypot(x-stop.platform.x,z-stop.platform.z)>160)continue;
    const y=terrainHeight(x,z);
    if(y===null||![[4,0],[-4,0],[0,4],[0,-4]].every(([dx,dz])=>terrainHeight(x+dx,z+dz)!==null))continue;
    if(ROADS.some(r=>inRect(x,z,r,8))||BUILDINGS.some(b=>inRect(x,z,b,6))||
      PARKING_LOTS.some(l=>inRect(x,z,{x:l.area.x,z:l.area.z,w:l.area.width,d:l.area.length,angle:l.area.yaw},8))||
      CALTRAIN_STOPS.some(s=>inRect(x,z,{x:s.platform.x,z:s.platform.z,w:44,d:8},8))||distanceToTrack(x,z)<9)continue;
    trees.push({x,z,y,size:.85+(seed%8)*.045,shade:seed%2});
  }
  return trees;
}

/** Redwood City's station clock is inspired by Caltrain's station photograph:
 * https://www.caltrain.com/files/caltrain/Assets/5%2B-%2BRedwood%2BCity%2BPlanning%2Band%2BReal%2BEstate%2BUpdate%2BPowerPoint.pdf
 * This stylized decorative tower sits above the platform, not on a driving lane. */
function addRedwoodClock(scene:T.Scene){
  const platform=CALTRAIN_STOPS.find(s=>s.id==='redwood-city')!.platform;
  const x=platform.x+15,z=platform.z;
  const tower=new T.Mesh(new T.BoxGeometry(4.8,10,4.8),material(0xd8c5a5));
  tower.position.set(x,9.4,z);scene.add(tower);
  const roof=new T.Mesh(new T.ConeGeometry(3.8,2.2,4),material(0x9e5146));
  roof.rotation.y=Math.PI/4;roof.position.set(x,15.5,z);scene.add(roof);
  const faceGeometry=new T.CircleGeometry(1.45,16),handGeometry=new T.BoxGeometry(.11,1,.05);
  for(const side of [-1,1]){
    const face=new T.Mesh(faceGeometry,material(0xf5eddb));
    face.rotation.y=side===-1?Math.PI:0;face.position.set(x,11.5,z+side*2.41);scene.add(face);
    const hand=new T.Mesh(handGeometry,material(0x3f4a48));
    hand.position.set(x,11.85,z+side*2.45);scene.add(hand);
    const short=new T.Mesh(handGeometry,material(0x3f4a48));
    short.scale.y=.68;short.rotation.z=Math.PI/3;short.position.set(x+.28,11.65,z+side*2.45);scene.add(short);
  }
}

export function buildCaltrainScenery(scene:T.Scene){
  const trees=redwoodCityTrees(),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
  const add=(plants:Tree[],geometry:T.BufferGeometry,color:number,y:number,width:number,height:number)=>{
    if(!plants.length)return;
    const mesh=new T.InstancedMesh(geometry,material(color),plants.length);
    plants.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+y*p.size,p.z),rotation,scale.set(width*p.size,height*p.size,width*p.size))));
    mesh.computeBoundingSphere();scene.add(mesh);
  };
  add(trees,new T.CylinderGeometry(.48,.67,1,6),0x76503c,3.7,1,7.4);
  const cone=new T.ConeGeometry(1,1,7);
  for(const shade of [0,1]){
    const plants=trees.filter(p=>p.shade===shade),color=shade===0?0x355f49:0x4b7653;
    add(plants,cone,color,8.6,4.1,9.5);
    add(plants,cone,color,13.5,3.3,8.5);
    add(plants,cone,color,18,2.3,8);
  }
  addRedwoodClock(scene);
}
