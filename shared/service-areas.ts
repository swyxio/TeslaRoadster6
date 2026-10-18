import { FERRY_DOCKS, MAP_BOUNDS, isRocketIsland, type MapPoint } from './map';
import { PARKING_LOTS } from './parking-lots';

/** Town identities for delivery catalogs. Locations are fictional game positions. */
export const SERVICE_AREAS = [
  {id:'san-francisco',name:'San Francisco',unlockLevel:0},
  {id:'mill-valley',name:'Mill Valley',unlockLevel:0},
  {id:'corte-madera',name:'Corte Madera',unlockLevel:0},
  {id:'playground',name:'North Bay Playground',unlockLevel:0},
  {id:'oakland',name:'Oakland',unlockLevel:1},
  {id:'berkeley',name:'Berkeley',unlockLevel:1},
  {id:'emeryville',name:'Emeryville',unlockLevel:1},
  {id:'south-san-francisco',name:'South San Francisco',unlockLevel:2},
  {id:'sfo',name:'SFO',unlockLevel:2},
  {id:'san-mateo',name:'San Mateo',unlockLevel:3},
  {id:'redwood-city',name:'Redwood City',unlockLevel:3},
  {id:'palo-alto',name:'Palo Alto',unlockLevel:4},
  {id:'menlo-park',name:'Menlo Park',unlockLevel:4},
  {id:'mountain-view',name:'Mountain View',unlockLevel:5},
  {id:'santa-clara',name:'Santa Clara',unlockLevel:5},
  {id:'hayward',name:'Hayward',unlockLevel:5},
  {id:'fremont',name:'Fremont',unlockLevel:5},
  {id:'san-jose',name:'San Jose',unlockLevel:6},
  {id:'cupertino',name:'Cupertino',unlockLevel:6},
] as const;
export type ServiceAreaId = typeof SERVICE_AREAS[number]['id'];
export type AccessLevel = 0|1|2|3|4|5|6;

// These longitudinal cuts cross the existing highways; the split between
// corridors follows the water between the compressed routes, not city boxes.
export const ACCESS_BOUNDARIES = {
  oaklandX:110, islandNorthZ:-650, islandMaxX:430, bayMaxZ:300,
  sanMateoMinZ:1350, paloAltoMinZ:3100, mountainViewMinZ:4800,
  cupertinoMinZ:7000, sanJoseMinZ:7600,
} as const;

const DIVIDER:readonly MapPoint[] = [
  {x:110,z:300},{x:140,z:1000},{x:10,z:2500},{x:335,z:4000},
  {x:625,z:5500},{x:1040,z:7000},{x:1240,z:7600},{x:1600,z:9400},
];
function dividerX(z:number):number {
  for(let i=1;i<DIVIDER.length;i++){
    const a=DIVIDER[i-1],b=DIVIDER[i];
    if(z<=b.z)return a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z);
  }
  return DIVIDER[DIVIDER.length-1].x;
}
const SF_PARKING=PARKING_LOTS.find(lot=>lot.id==='sf-playground')!.area;
const parkingPocket=[
  {x:SF_PARKING.x-SF_PARKING.width/2,z:ACCESS_BOUNDARIES.bayMaxZ},
  {x:SF_PARKING.x+SF_PARKING.width/2,z:ACCESS_BOUNDARIES.bayMaxZ},
  {x:SF_PARKING.x+SF_PARKING.width/2,z:SF_PARKING.z+SF_PARKING.length/2},
  {x:SF_PARKING.x-SF_PARKING.width/2,z:SF_PARKING.z+SF_PARKING.length/2},
];

/** The same gate geometry used for the map's exact locked-area overlays. */
export type AccessZone = {level:Exclude<AccessLevel,0>; points:MapPoint[]; holes?:MapPoint[][]};
function corridor(level:AccessZone['level'],side:'west'|'east',start:number,end:number,holes?:MapPoint[][]):AccessZone {
  const divider=[{x:dividerX(start),z:start},...DIVIDER.filter(point=>point.z>start&&point.z<end),{x:dividerX(end),z:end}];
  const edge=side==='west'?MAP_BOUNDS.minX:MAP_BOUNDS.maxX;
  return {level,points:[{x:edge,z:start},...divider,{x:edge,z:end}],holes};
}
export const ACCESS_ZONES:readonly AccessZone[] = [
  {level:1,points:[
    {x:ACCESS_BOUNDARIES.islandMaxX,z:FERRY_DOCKS.island.z},
    {x:MAP_BOUNDS.maxX,z:FERRY_DOCKS.island.z},
    {x:MAP_BOUNDS.maxX,z:ACCESS_BOUNDARIES.bayMaxZ},
    {x:ACCESS_BOUNDARIES.oaklandX,z:ACCESS_BOUNDARIES.bayMaxZ},
    {x:ACCESS_BOUNDARIES.oaklandX,z:ACCESS_BOUNDARIES.islandNorthZ},
    {x:ACCESS_BOUNDARIES.islandMaxX,z:ACCESS_BOUNDARIES.islandNorthZ},
  ]},
  corridor(2,'west',ACCESS_BOUNDARIES.bayMaxZ,ACCESS_BOUNDARIES.sanMateoMinZ,[parkingPocket]),
  corridor(3,'west',ACCESS_BOUNDARIES.sanMateoMinZ,ACCESS_BOUNDARIES.paloAltoMinZ),
  corridor(4,'west',ACCESS_BOUNDARIES.paloAltoMinZ,ACCESS_BOUNDARIES.mountainViewMinZ),
  corridor(5,'west',ACCESS_BOUNDARIES.mountainViewMinZ,ACCESS_BOUNDARIES.cupertinoMinZ),
  corridor(6,'west',ACCESS_BOUNDARIES.cupertinoMinZ,MAP_BOUNDS.maxZ),
  corridor(5,'east',ACCESS_BOUNDARIES.bayMaxZ,ACCESS_BOUNDARIES.sanJoseMinZ),
  corridor(6,'east',ACCESS_BOUNDARIES.sanJoseMinZ,MAP_BOUNDS.maxZ),
];

/** Levels apply at every altitude; spending can lower access without losing ownership. */
export function requiredAccessLevelAt(x:number,z:number):AccessLevel {
  if(isRocketIsland(x,z))return 0;
  if(z<=ACCESS_BOUNDARIES.bayMaxZ){
    if(z<=FERRY_DOCKS.island.z)return 0;
    const islandApproach=z<ACCESS_BOUNDARIES.islandNorthZ&&x<ACCESS_BOUNDARIES.islandMaxX;
    return x>ACCESS_BOUNDARIES.oaklandX&&!islandApproach?1:0;
  }
  if(Math.abs(x-SF_PARKING.x)<=SF_PARKING.width/2&&z<=SF_PARKING.z+SF_PARKING.length/2)return 0;
  if(x>dividerX(z))return z>ACCESS_BOUNDARIES.sanJoseMinZ?6:5;
  if(z>ACCESS_BOUNDARIES.cupertinoMinZ)return 6;
  if(z>ACCESS_BOUNDARIES.mountainViewMinZ)return 5;
  if(z>ACCESS_BOUNDARIES.paloAltoMinZ)return 4;
  if(z>ACCESS_BOUNDARIES.sanMateoMinZ)return 3;
  return 2;
}

/** Road crossings for the visual checkpoints; all planes use the cuts above. */
export const ACCESS_ROAD_GATES = [
  {road:'peninsula',z:ACCESS_BOUNDARIES.bayMaxZ,level:2},
  {road:'peninsula',z:ACCESS_BOUNDARIES.sanMateoMinZ,level:3},
  {road:'peninsula',z:ACCESS_BOUNDARIES.paloAltoMinZ,level:4},
  {road:'i-280',z:ACCESS_BOUNDARIES.paloAltoMinZ,level:4},
  {road:'el-camino-real',z:ACCESS_BOUNDARIES.paloAltoMinZ,level:4},
  {road:'peninsula',z:ACCESS_BOUNDARIES.mountainViewMinZ,level:5},
  {road:'i-280',z:ACCESS_BOUNDARIES.mountainViewMinZ,level:5},
  {road:'el-camino-real',z:ACCESS_BOUNDARIES.mountainViewMinZ,level:5},
  {road:'peninsula',z:ACCESS_BOUNDARIES.cupertinoMinZ,level:6},
  {road:'east-bay',z:ACCESS_BOUNDARIES.bayMaxZ,level:5},
  {road:'east-bay',z:ACCESS_BOUNDARIES.sanJoseMinZ,level:6},
] as const;
