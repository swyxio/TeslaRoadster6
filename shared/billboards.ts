/** Original, fictional roadside advertising for the compressed Bay. */
import { BUILDINGS, FERRY_DOCKS, HIGHWAYS, REGIONS, ROADS, terrainHeight, type MapPoint } from './map';
import { STATIONS } from './stations';
import { SHOPS } from './upgrades';
import { CUSTOMERS, RESTAURANTS } from './delivery';
import { PARKING_LOTS } from './parking-lots';
import { FERRY_DECK } from './ferry';
import { contact } from './physics';

export const BILLBOARD_WIDTH=16;
export const BILLBOARD_HEIGHT=6;
export const BILLBOARD_DESIGNS = [
  { company:'MOON GOOSE MIDDLEWARE', line:'The cloud honks back.', background:'#302b54', accent:'#b9f7cd', symbol:'☁' },
  { company:'VENTURE PRETZEL LABS', line:'Twist first. Pivot later.', background:'#b65434', accent:'#fff0ae', symbol:'↺' },
  { company:'GHOST AVOCADO DATABASES', line:'Eventually consistent guac.', background:'#2e624f', accent:'#e0fbaf', symbol:'◉' },
  { company:'JELLYBEAN FORKLIFT CLOUD', line:'Moving bytes, very carefully.', background:'#294d79', accent:'#f8bdce', symbol:'▣' },
  { company:'PARACHUTE PICKLE AI', line:'Our model is mostly brine.', background:'#57672c', accent:'#e8efb5', symbol:'✦' },
  { company:'PIGEON LATENCY RESEARCH', line:'Your packet is on its way.', background:'#57454b', accent:'#ffd7a7', symbol:'➜' },
  { company:'BANANA FOG ANALYTICS', line:'Now with 40% more fog.', background:'#32656b', accent:'#fff2a0', symbol:'≈' },
  { company:'TURBO MARMOT SYNDICATE', line:'Hibernation as a service.', background:'#744c2d', accent:'#f8d4a7', symbol:'◈' },
  { company:'DANCING SPOON NETWORKS', line:'We stir the internet.', background:'#503f76', accent:'#ffdb96', symbol:'✳' },
  { company:'PIXEL WAFFLE VENTURES', line:'Disrupting the breakfast stack.', background:'#8a4e35', accent:'#ffe7a6', symbol:'▦' },
  { company:'BOOP NOODLE ROBOTICS', line:'Polite machines. Big noodles.', background:'#275862', accent:'#bbf1d8', symbol:'☺' },
  { company:'SLEEPY COMET SPREADSHEETS', line:'Taking your cells to space.', background:'#263f70', accent:'#ffd9b0', symbol:'✧' },
] as const;

export type Billboard = {x:number;z:number;yaw:number;design:number;route:string};
const fractions=[.002,.035,.10,.17,.24,.31,.38,.45,.52,.59,.66,.73,.80,.87,.94];
const sfApron=REGIONS.find(region=>region.id==='sf-ferry-apron')!;
const apronX=sfApron.points.map(point=>point.x),apronZ=sfApron.points.map(point=>point.z);
const apronMinX=Math.min(...apronX),apronMaxX=Math.max(...apronX),apronMinZ=Math.min(...apronZ),apronMaxZ=Math.max(...apronZ);
// Protect the activity rectangles and the whole dock, including the docked
// ferry. Two meters of margin keeps a sign frame off their edges.
const protectedAreas=[
  ...PARKING_LOTS.flatMap(lot=>[lot.area,lot.approach]),
  {x:(apronMinX+apronMaxX)/2,z:(apronMinZ+apronMaxZ)/2,yaw:0,width:apronMaxX-apronMinX,length:apronMaxZ-apronMinZ},
  {x:FERRY_DOCKS.sf.x,z:FERRY_DOCKS.sf.deckZ,yaw:0,width:FERRY_DECK.width,length:FERRY_DECK.length},
];

function pointAlong(points:MapPoint[],fraction:number):{x:number;z:number;yaw:number} {
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  const distance=lengths.reduce((total,length)=>total+length,0)*fraction;
  let passed=0;
  for(let i=0;i<lengths.length;i++){
    const length=lengths[i];
    if(length&&(passed+length>=distance||i===lengths.length-1)){
      const a=points[i],b=points[i+1],t=Math.max(0,Math.min(1,(distance-passed)/length));
      return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z)};
    }
    passed+=length;
  }
  throw new Error('A billboard route needs a nonempty road');
}

/** Distance outside the rotated rectangle that represents each shared paved road. */
function distanceToRoad(x:number,z:number,road:typeof ROADS[number]):number {
  const a=road.angle??0,dx=x-road.x,dz=z-road.z;
  const across=dx*Math.cos(a)-dz*Math.sin(a),along=dx*Math.sin(a)+dz*Math.cos(a);
  return Math.hypot(Math.max(0,Math.abs(across)-road.w/2),Math.max(0,Math.abs(along)-road.d/2));
}

function clearPoint(x:number,z:number):boolean {
  if(terrainHeight(x,z)===null)return false;
  if(ROADS.some(road=>distanceToRoad(x,z,road)<3))return false;
  if(BUILDINGS.some(b=>Math.abs(x-b.x)<b.w/2+8&&Math.abs(z-b.z)<b.d/2+8))return false;
  if([...STATIONS,...SHOPS,...RESTAURANTS,...CUSTOMERS].some(place=>Math.hypot(x-place.x,z-place.z)<20))return false;
  return true;
}

// The board spans the local X axis; sample the whole panel and both posts,
// so neither the face nor its supports encroach on roads and active markers.
function clearBillboard(x:number,z:number,yaw:number):boolean {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const frame={x,z,yaw,w:BILLBOARD_WIDTH+.35,d:.35};
  if(protectedAreas.some(area=>contact(frame,{x:area.x,z:area.z,yaw:area.yaw,w:area.width+4,d:area.length+4})))return false;
  return [-8,-4,0,4,8].every(offset=>clearPoint(x+c*offset,z-s*offset));
}

/** Decorative, non-colliding props placed on real shared ground alongside shared roads. */
export const BILLBOARDS:Billboard[]=[];
for(const highway of HIGHWAYS){
  fractions.forEach((fraction,index)=>{
    const point=pointAlong(highway.points,fraction),c=Math.cos(point.yaw),s=Math.sin(point.yaw);
    const preferred=index%2?1:-1;
    for(const side of [preferred,-preferred])for(const offset of [30,36,42,50]){
      const x=point.x+c*offset*side,z=point.z-s*offset*side;
      if(!clearBillboard(x,z,point.yaw))continue;
      BILLBOARDS.push({x,z,yaw:point.yaw,design:(index+(highway.id==='east-bay'?5:0))%BILLBOARD_DESIGNS.length,route:highway.name});
      return;
    }
  });
}
