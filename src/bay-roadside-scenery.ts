import * as T from 'three';
import { AIRPORT_RUNWAY, BUILDINGS, FREMONT_SPACEPORT, HIGHWAYS, NATURAL_HILLS, OVERPASS, ROADS, terrainHeight, type MapPoint } from '../shared/map';
import { BILLBOARDS } from '../shared/billboards';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { CUSTOMERS, RESTAURANTS } from '../shared/delivery';
import { PARKING_LOTS } from '../shared/parking-lots';
import { SHOPS } from '../shared/upgrades';
import { material } from './vehicles';

// Caltrans' 101 construction photos show the mix of planted verges, sound
// walls and urban freeway furniture that inspired this invented 2050 scenery:
// https://dot.ca.gov/caltrans-near-me/district-4/d4-projects/d4-san-mateo-101-express-lane-project/101-express-construction-update/2021-08-08-express-update
// No reference imagery or real-world object positions are included.

type Rect={x:number;z:number;w:number;d:number;angle?:number};
export type RoadsidePlant={x:number;y:number;z:number;size:number;evergreen:boolean;shade:number;route:string};
export type RoadsideLight={x:number;y:number;z:number;yaw:number;route:string};

/** Grid index of padded rotated rectangles; build only once at scene creation. */
function clearanceIndex(rectangles:Rect[],padding:number) {
  const cell=240,index=new Map<string,Rect[]>();
  for(const rect of rectangles){
    const c=Math.abs(Math.cos(rect.angle??0)),s=Math.abs(Math.sin(rect.angle??0));
    const rx=c*rect.w/2+s*rect.d/2+padding,rz=s*rect.w/2+c*rect.d/2+padding;
    for(let x=Math.floor((rect.x-rx)/cell);x<=Math.floor((rect.x+rx)/cell);x++)
      for(let z=Math.floor((rect.z-rz)/cell);z<=Math.floor((rect.z+rz)/cell);z++){
        const key=`${x},${z}`,list=index.get(key)??[];list.push(rect);index.set(key,list);
      }
  }
  return (x:number,z:number,margin:number)=>{
    const list=index.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)??[];
    return list.every(rect=>{
      const c=Math.cos(rect.angle??0),s=Math.sin(rect.angle??0),dx=x-rect.x,dz=z-rect.z;
      return Math.abs(dx*c-dz*s)>rect.w/2+margin||Math.abs(dx*s+dz*c)>rect.d/2+margin;
    });
  };
}

function distanceToSegment(x:number,z:number,a:MapPoint,b:MapPoint):number {
  const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
  const t=l?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l)):0;
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}

/**
 * Deterministic presentation-only plants and lamps. Ground, roads, building
 * footprints and activity clearances are re-read when called so new shared
 * buildings cannot be hidden by an old, baked-in roadside arrangement.
 */
export function bayRoadsideScenery(extraExclusions:readonly Rect[]=[]):{plants:RoadsidePlant[];lights:RoadsideLight[]} {
  const rectangles:Rect[]=[...ROADS,...BUILDINGS,...extraExclusions,
    ...PARKING_LOTS.flatMap(lot=>[lot.area,lot.approach].map(a=>({x:a.x,z:a.z,w:a.width,d:a.length,angle:a.yaw}))),
    AIRPORT_RUNWAY,
    {x:(OVERPASS.start+OVERPASS.end)/2,z:OVERPASS.z,w:OVERPASS.end-OVERPASS.start,d:OVERPASS.width},
    ...NATURAL_HILLS.map(h=>({x:(h.minX+h.maxX)/2,z:(h.minZ+h.maxZ)/2,w:h.maxX-h.minX,d:h.maxZ-h.minZ})),
  ];
  const clearRectangle=clearanceIndex(rectangles,12);
  const points=[...CUSTOMERS,...RESTAURANTS,...SHOPS,...CALTRAIN_STOPS.map(stop=>stop.platform),FREMONT_SPACEPORT.entrance];
  const clear=(x:number,z:number,radius:number):number|null=>{
    // Require the complete crown/support to sit on land, not over the water.
    const heights=[[0,0],[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]
      .map(([dx,dz])=>terrainHeight(x+dx,z+dz));
    if(heights.some(y=>y===null))return null;
    const y=heights[0]!;
    if(heights.some(h=>Math.abs(h!-y)>2)||!clearRectangle(x,z,radius+5))return null;
    if(points.some(point=>Math.hypot(x-point.x,z-point.z)<radius+24))return null;
    if(BILLBOARDS.some(board=>Math.hypot(x-board.x,z-board.z)<radius+12))return null;
    for(let i=1;i<CALTRAIN_TRACK.length;i++)if(distanceToSegment(x,z,CALTRAIN_TRACK[i-1],CALTRAIN_TRACK[i])<radius+8)return null;
    return y;
  };
  const plants:RoadsidePlant[]=[],lights:RoadsideLight[]=[];
  // Nearby alternate routes can coincide. Suppress duplicate props at junctions.
  const used=new Map<string,{x:number;z:number}[]>(),cell=18;
  const vacant=(x:number,z:number)=>{
    const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
    for(let ix=cx-1;ix<=cx+1;ix++)for(let iz=cz-1;iz<=cz+1;iz++)
      if((used.get(`${ix},${iz}`)??[]).some(p=>Math.hypot(x-p.x,z-p.z)<11))return false;
    return true;
  };
  const reserve=(x:number,z:number)=>{
    const key=`${Math.floor(x/cell)},${Math.floor(z/cell)}`,list=used.get(key)??[];
    list.push({x,z});used.set(key,list);
  };
  HIGHWAYS.forEach((highway,routeIndex)=>{
    let distanceUntilNext=36,index=0;
    for(let i=1;i<highway.points.length;i++){
      const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(!length)continue;
      const tx=dx/length,tz=dz/length;
      while(distanceUntilNext<length){
        const px=a.x+tx*distanceUntilNext,pz=a.z+tz*distanceUntilNext;
        const seed=(Math.imul(index+13,2654435761)^Math.imul(routeIndex+3,2246822519))>>>0;
        for(const side of [-1,1]){
          // Vary setback and tree type while retaining long unobstructed views.
          const offset=(highway.width??32)/2+17+(seed%15),along=((seed>>>8)%17)-8;
          const x=px+tz*offset*side+tx*along,z=pz-tx*offset*side+tz*along;
          // Allow the largest crown (just over five meters) room on all sides.
          const y=clear(x,z,6);
          if(y!==null&&vacant(x,z)){
            plants.push({x,y,z,size:.85+((seed>>>12)%7)*.07,evergreen:((seed>>>16)+(side+1)/2)%3===0,shade:(seed>>>19)%3,route:highway.id});
            reserve(x,z);
          }
        }
        // Sparse light poles suggest a maintained highway without filling the
        // camera view or creating a client-only barrier along the shoulder.
        if(index%3===0){
          const side=index%2?1:-1,offset=(highway.width??32)/2+12;
          const x=px+tz*offset*side,z=pz-tx*offset*side,y=clear(x,z,2);
          if(y!==null&&vacant(x,z)){
            lights.push({x,y,z,yaw:Math.atan2(tx,tz),route:highway.id});reserve(x,z);
          }
        }
        index++;distanceUntilNext+=55;
      }
      distanceUntilNext-=length;
    }
  });
  return {plants,lights};
}

/** Chunked instances preserve frustum culling and share geometry/materials. */
export function buildBayRoadsideScenery(scene:T.Scene,extraExclusions:readonly Rect[]=[]):void {
  const {plants,lights}=bayRoadsideScenery(extraExclusions),cell=900;
  const chunks=new Map<string,{plants:RoadsidePlant[];lights:RoadsideLight[]}>();
  for(const [items,key] of [[plants,'plants'],[lights,'lights']] as const)for(const item of items){
    const id=`${Math.floor(item.x/cell)},${Math.floor(item.z/cell)}`,chunk=chunks.get(id)??{plants:[],lights:[]};
    if(key==='plants')chunk.plants.push(item as RoadsidePlant);else chunk.lights.push(item as RoadsideLight);
    chunks.set(id,chunk);
  }
  const trunkGeometry=new T.CylinderGeometry(.27,.38,1,6),leafGeometry=new T.IcosahedronGeometry(1,0),
    evergreenGeometry=new T.ConeGeometry(1,1,7),poleGeometry=new T.BoxGeometry(.25,1,.25),lampGeometry=new T.BoxGeometry(1.6,.28,.65);
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion(),up=new T.Vector3(0,1,0),color=new T.Color();
  const colors=[0x4e7656,0x68845f,0x78936e];
  for(const chunk of chunks.values()){
    if(chunk.plants.length){
      const trunks=new T.InstancedMesh(trunkGeometry,material(0x715e4c),chunk.plants.length);
      chunk.plants.forEach((p,i)=>trunks.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+2.6*p.size,p.z),rotation.identity(),scale.set(p.size,5.2*p.size,p.size))));
      trunks.computeBoundingSphere();scene.add(trunks);
      for(const evergreen of [false,true]){
        const items=chunk.plants.filter(p=>p.evergreen===evergreen);if(!items.length)continue;
        const crowns=new T.InstancedMesh(evergreen?evergreenGeometry:leafGeometry,material(0xffffff),items.length);
        items.forEach((p,i)=>{
          const height=evergreen?8.5:3.8,width=evergreen?3:4;
          crowns.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+(evergreen?7.5:6)*p.size,p.z),rotation.identity(),scale.set(width*p.size,height*p.size,width*p.size)));
          crowns.setColorAt(i,color.setHex(colors[p.shade]));
        });
        crowns.computeBoundingSphere();scene.add(crowns);
      }
    }
    if(chunk.lights.length){
      const poles=new T.InstancedMesh(poleGeometry,material(0x909f98),chunk.lights.length),lamps=new T.InstancedMesh(lampGeometry,material(0xc8d5c5),chunk.lights.length);
      chunk.lights.forEach((p,i)=>{
        poles.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+4.6,p.z),rotation.identity(),scale.set(1,9.2,1)));
        lamps.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+9.3,p.z),rotation.setFromAxisAngle(up,p.yaw),scale.set(1,1,1)));
      });
      poles.computeBoundingSphere();lamps.computeBoundingSphere();scene.add(poles,lamps);
    }
  }
}
