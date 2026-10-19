import { contact, type Body } from './physics';
import { primitiveExtent } from './new-landmark-surfaces';
import type { Building, MapPoint, RoadSegment } from './map';

/** Areas occupied by gameplay, scenery, or future map additions, in game meters. */
export type RoadsideExclusion = {x:number;z:number;w:number;d:number;yaw?:number};
export type RoadsideBuildingInputs = {
  highways:readonly {id:string;points:readonly MapPoint[]}[];
  buildings:readonly Building[];
  roads:readonly RoadSegment[];
  /** Include activity areas, landmarks (including decorative ones), airport and hill bounds. */
  exclusions:readonly RoadsideExclusion[];
  rail:readonly MapPoint[];
  regions:readonly {points:readonly MapPoint[]}[];
  isLand:(x:number,z:number)=>boolean;
  terrainHeight:(x:number,z:number)=>number|null;
};

const ROAD_CLEARANCE=12;
const BUILDING_CLEARANCE=8;
const EXCLUSION_CLEARANCE=10;
const RAIL_CLEARANCE=10;
const SPACING=280;
const MAX_BUILDINGS=120;

function asBody(rect:RoadsideExclusion):Body {
  return {x:rect.x,z:rect.z,w:rect.w,d:rect.d,yaw:rect.yaw??0};
}
function expanded(body:Body,clearance:number):Body {
  return {...body,w:body.w+2*clearance,d:body.d+2*clearance};
}
function distanceToSegment(x:number,z:number,a:MapPoint,b:MapPoint):number {
  const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
  const t=length2===0?0:Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length2));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}
function insidePolygon(x:number,z:number,points:readonly MapPoint[]):boolean {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
/** True when a segment enters the rectangle's open interior. */
function crossesInterior(a:MapPoint,b:MapPoint,minX:number,maxX:number,minZ:number,maxZ:number):boolean {
  let from=0,to=1;
  for(const [start,end,min,max] of [[a.x,b.x,minX,maxX],[a.z,b.z,minZ,maxZ]]){
    const delta=end-start;
    if(delta===0){if(start<=min||start>=max)return false;continue;}
    const lo=(min-start)/delta,hi=(max-start)/delta;
    from=Math.max(from,Math.min(lo,hi));to=Math.min(to,Math.max(lo,hi));
    if(from>=to)return false;
  }
  return from<to;
}
/** Require the entire apron in one polygon, even if two land regions overlap. */
function apronInsideRegion(building:Building,regions:RoadsideBuildingInputs['regions']):boolean {
  const minX=building.x-building.w/2-4,maxX=building.x+building.w/2+4;
  const minZ=building.z-building.d/2-4,maxZ=building.z+building.d/2+4;
  return regions.some(({points})=>{
    if(points.length<3||![[minX,minZ],[minX,maxZ],[maxX,minZ],[maxX,maxZ]].every(([x,z])=>insidePolygon(x,z,points)))return false;
    for(let i=0,j=points.length-1;i<points.length;j=i++)
      if(crossesInterior(points[j],points[i],minX,maxX,minZ,maxZ))return false;
    return true;
  });
}
function flatLand(building:Building,inputs:RoadsideBuildingInputs):boolean {
  if(!apronInsideRegion(building,inputs.regions))return false;
  // Land boundaries are checked exactly; sample height across the same apron.
  for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++){
    const x=building.x+ix*(building.w/2+4)/2,z=building.z+iz*(building.d/2+4)/2;
    const height=inputs.terrainHeight(x,z);
    if(!inputs.isLand(x,z)||height===null||Math.abs(height)>.01)return false;
  }
  return true;
}

/**
 * Place a bounded set of ordinary, flat-roofed buildings beside the two Bay
 * corridors. The caller supplies every activity/landmark exclusion before map
 * indexing; no rendering-only collision geometry is created here.
 */
export function generateRoadsideBuildings(inputs:RoadsideBuildingInputs):Building[] {
  const placed:Building[]=[];
  const roads=inputs.roads.map(road=>asBody({...road,yaw:road.angle??0}));
  const exclusions=inputs.exclusions.map(asBody);
  const existing=inputs.buildings.flatMap(building=>[
    asBody(building),
    // The spaceport channel extends beyond the pad's nominal footprint.
    ...(building.style==='spaceport'?building.parts?.map(part=>{
      const extent=primitiveExtent(part);
      return {x:building.x+part.x,z:building.z+part.z,w:extent.w,d:extent.d,yaw:extent.yaw};
    })??[]:[]),
  ]);
  const clear=(building:Building)=>{
    const shape=asBody(building);
    if(!flatLand(building,inputs))return false;
    if(roads.some(road=>contact(expanded(shape,ROAD_CLEARANCE),road)))return false;
    if(exclusions.some(area=>contact(expanded(shape,EXCLUSION_CLEARANCE),area)))return false;
    if(existing.some(other=>contact(expanded(shape,BUILDING_CLEARANCE),other)))return false;
    if(placed.some(other=>contact(expanded(shape,BUILDING_CLEARANCE),asBody(other))))return false;
    const railRadius=Math.hypot(building.w,building.d)/2+RAIL_CLEARANCE;
    for(let i=1;i<inputs.rail.length;i++)
      if(distanceToSegment(building.x,building.z,inputs.rail[i-1],inputs.rail[i])<railRadius)return false;
    return true;
  };
  for(const highway of inputs.highways.filter(route=>route.id==='peninsula'||route.id==='east-bay')){
    let traveled=0,next=SPACING;
    for(let i=1;i<highway.points.length;i++){
      const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(!length)continue;
      while(next<=traveled+length && placed.length<MAX_BUILDINGS){
        const t=(next-traveled)/length,x=a.x+dx*t,z=a.z+dz*t;
        const sample=Math.round(next/SPACING);
        // Keep the dense city centers, crossings and their special activities untouched.
        if(z>=650)for(const side of [-1,1]){
          const seed=(sample*17+(side>0?7:0)+(highway.id==='east-bay'?11:0))%19;
          for(const offset of [76,96,116,136]){
            const building:Building={
              x:x+dz/length*offset*side,z:z-dx/length*offset*side,
              w:22+(seed%4)*4,d:18+(seed%3)*5,h:8+(seed%4)*3,
              district:z>7600?'south-bay':highway.id==='east-bay'?'east-bay':'peninsula',style:'midrise',
            };
            if(clear(building)){placed.push(building);break;}
          }
        }
        next+=SPACING;
      }
      traveled+=length;
    }
  }
  return placed;
}
