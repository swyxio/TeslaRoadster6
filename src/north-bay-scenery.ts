import * as T from 'three';
import { BUILDINGS, REGIONS, ROADS, insidePolygon, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RACE_COURSES } from '../shared/race-courses';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';
import { material } from './vehicles';

/** Decorative groves and vineyards use the existing playable terrain. */
type Plant={x:number;z:number;y:number;size:number;shade:number};
const zones=[
  {id:'marin',minX:-410,maxX:-120,minZ:-550,maxZ:-380,spacing:4},
  {id:'rocket-island',minX:-500,maxX:900,minZ:-2180,maxZ:-1100,spacing:27},
] as const;
const vineyardPlots=[
  {minX:-430,maxX:-350,minZ:-2050,maxZ:-1890},
  {minX:710,maxX:810,minZ:-1880,maxZ:-1760},
] as const;

// Check an oriented rectangle without treating decorative trees as collisions.
function inRect(x:number,z:number,r:{x:number;z:number;w:number;d:number;angle?:number},margin:number){
  const c=Math.cos(r.angle??0),s=Math.sin(r.angle??0),dx=x-r.x,dz=z-r.z;
  return Math.abs(dx*c-dz*s)<=r.w/2+margin&&Math.abs(dx*s+dz*c)<=r.d/2+margin;
}
function clearanceFor(zone:typeof zones[number]){
  // Broad phase once per zone keeps startup work local even as the Bay grows.
  const near=(r:{x:number;z:number;w:number;d:number})=>{
    const radius=Math.hypot(r.w,r.d)/2+75;
    return r.x+radius>=zone.minX&&r.x-radius<=zone.maxX&&r.z+radius>=zone.minZ&&r.z-radius<=zone.maxZ;
  };
  const roads=ROADS.filter(near),buildings=BUILDINGS.filter(near),lots=PARKING_LOTS.filter(l=>near({x:l.area.x,z:l.area.z,w:l.area.width,d:l.area.length}));
  return (x:number,z:number,margin:number)=>{
    if(roads.some(r=>inRect(x,z,r,margin+(r.course==='oval'?16:7))))return false;
    if(buildings.some(b=>inRect(x,z,b,margin)))return false;
    if(lots.some(lot=>inRect(x,z,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,angle:lot.area.yaw},margin+8)))return false;
    if(RACE_COURSES.some(course=>Math.hypot(x-course.start.x,z-course.start.z)<course.start.radius+margin+10||
      course.gates.some(g=>inRect(x,z,{x:g.x,z:g.z,w:g.width,d:12,angle:g.yaw},margin+8))))return false;
    // Keep the complete stunt approaches and landing areas visually open.
    if(ISLAND_JUMPS.some(j=>x>=j.start-50-margin&&x<=j.end+100+margin&&Math.abs(z-j.z)<j.width/2+40+margin))return false;
    if(x>=ISLAND_BANK.startX-35-margin&&x<=ISLAND_BANK.endX+35+margin&&Math.abs(z-ISLAND_BANK.z)<ISLAND_BANK.halfWidth+25+margin)return false;
    if(Math.abs(x-ISLAND_CLIFF.x)<75+margin&&Math.abs(z-ISLAND_CLIFF.z)<60+margin)return false;
    return true;
  };
}
function supportedIn(region:{points:{x:number;z:number}[]},x:number,z:number,margin:number){
  return [[0,0],[-margin,0],[margin,0],[0,-margin],[0,margin]].every(([dx,dz])=>insidePolygon(x+dx,z+dz,region.points));
}
function inVineyard(x:number,z:number){return vineyardPlots.some(p=>x>=p.minX-5&&x<=p.maxX+5&&z>=p.minZ-5&&z<=p.maxZ+5);}

/** Deterministic placement makes the same scenery appear on desktop and mobile. */
export function northBayScenery(){
  const trees:Record<'marin'|'rocket-island',Plant[]>={marin:[],'rocket-island':[]}, vines:Plant[]=[];
  for(const zone of zones){
    const region=REGIONS.find(r=>r.id===zone.id)!,clear=clearanceFor(zone);
    for(let z=zone.minZ+zone.spacing/2;z<zone.maxZ;z+=zone.spacing)for(let x=zone.minX+zone.spacing/2;x<zone.maxX;x+=zone.spacing){
      const col=Math.floor((x-zone.minX)/zone.spacing),row=Math.floor((z-zone.minZ)/zone.spacing);
      const seed=(((col+17)*73856093)^((row+13)*19349663))>>>0;
      // The compact headlands have less room between roads and landmarks;
      // smaller jitter keeps their denser grove from collapsing into clumps.
      const jitter=zone.id==='marin'?.3:.8;
      const jx=x+(seed%9-4)*jitter,jz=z+(Math.floor(seed/9)%9-4)*jitter;
      if(seed%7===0||inVineyard(jx,jz)||!supportedIn(region,jx,jz,7)||!clear(jx,jz,6))continue;
      trees[zone.id].push({x:jx,z:jz,y:terrainHeight(jx,jz)??0,size:.8+(seed%9)*.06,shade:seed%3});
    }
  }
  const island=REGIONS.find(r=>r.id==='rocket-island')!,clear=clearanceFor(zones[1]);
  for(const plot of vineyardPlots)for(let x=plot.minX;x<=plot.maxX;x+=12)for(let z=plot.minZ;z<=plot.maxZ;z+=5){
    if(!supportedIn(island,x,z,3)||!clear(x,z,4))continue;
    vines.push({x,z,y:terrainHeight(x,z)??0,size:1,shade:Math.abs(Math.floor((x+z)/5))%3});
  }
  return {trees,vines};
}

/** Low-poly redwoods, oaks and vineyard rows, chunked by region for culling. */
export function buildNorthBayScenery(scene:T.Scene){
  const {trees,vines}=northBayScenery();
  const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();
  const addPlants=(plants:Plant[],geometry:T.BufferGeometry,color:number,shape:(p:Plant)=>{y:number;xz:number;height:number})=>{
    if(!plants.length)return;
    const mesh=new T.InstancedMesh(geometry,material(color),plants.length);
    plants.forEach((p,i)=>{const s=shape(p);mesh.setMatrixAt(i,matrix.compose(position.set(p.x,p.y+s.y,p.z),rotation,scale.set(s.xz,s.height,s.xz)));});
    mesh.computeBoundingSphere();scene.add(mesh);
  };
  for(const group of Object.values(trees)){
    addPlants(group,new T.CylinderGeometry(.38,.52,1,6),0x6e5841,p=>({y:3*p.size,xz:p.size,height:6*p.size}));
    for(let shade=0;shade<3;shade++){
      const subset=group.filter(p=>p.shade===shade);
      // Taller, narrow redwoods alternate with broad coastal live oaks.
      const crown=shade===1?new T.IcosahedronGeometry(1,1):new T.ConeGeometry(1,1,7);
      addPlants(subset,crown,[0x385e49,0x416f52,0x567b59][shade],p=>({y:(shade===1?8:10)*p.size,xz:(shade===1?5:4)*p.size,height:(shade===1?3.5:17)*p.size}));
    }
  }
  for(let shade=0;shade<3;shade++)addPlants(vines.filter(p=>p.shade===shade),new T.IcosahedronGeometry(1,0),[0x668452,0x759455,0x8ca366][shade],()=>({y:.9,xz:1.7,height:.9}));
}
