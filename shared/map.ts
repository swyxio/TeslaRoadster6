/** Compressed Bay geography. X east, Z south, meters in game space. */
import { BAY_HIGHWAY_TRACES } from './bay-highway-traces';
import { SHORT_TRACK } from './race-courses';
import { bankSurface } from './island-stunts';
import { DOME } from './dome';
import { NORTH_LANDMARKS, NORTH_NATURAL_LANDMARKS } from './north-landmarks';
import { SOUTH_LANDMARKS } from './south-landmarks';
import { CHARGER_LOT, STATIONS } from './stations';
export type MapPoint = { x:number; z:number };
export type Region = { id:string; name:string; color:number; points:MapPoint[] };
const polygon=(pairs:number[][]):MapPoint[]=>pairs.map(([x,z])=>({x,z}));
export const MAP_BOUNDS={minX:-1800,maxX:2400,minZ:-2400,maxZ:9400} as const;
// A vertical, driveable ribbon along Oakland's eastbound 180 street. The same
// circle defines its collision surface and its rendered geometry.
export const STUNT_LOOP={x:450,z:180,radius:12,width:12} as const;
export const STUNT_RAMP={start:370,end:398,z:180,width:12,height:4} as const;
export function rampHeight(x:number,z:number):number|null {
  if(x<STUNT_RAMP.start||x>STUNT_RAMP.end||Math.abs(z-STUNT_RAMP.z)>STUNT_RAMP.width/2)return null;
  return STUNT_RAMP.height*(x-STUNT_RAMP.start)/(STUNT_RAMP.end-STUNT_RAMP.start);
}
/** Fictional playground: the southward projection is the island ferry apron. */
export const ROCKET_ISLAND:Region={id:'rocket-island',name:'Rocket Island',color:0xb8c7a3,points:polygon([
  [-500,-1800],[-450,-2050],[-300,-2180],[600,-2180],[850,-2050],[900,-1700],
  [800,-1300],[600,-1140],[250,-1100],[20,-1100],[20,-1060],[-20,-1060],
  [-20,-1100],[-150,-1100],[-400,-1250],
])};
// Compressed China Basin waterfront: the stadium and its plaza remain on shared land.
const DOME_WATERFRONT:Region={id:'china-basin',name:'China Basin Rocket Dome',color:0xd4d1bb,points:polygon([[-150,140],[45,140],[55,165],[55,230],[30,285],[-150,285]])};
/** Pier tips and the center of a 38 m ferry deck alongside each tip. */
export const FERRY_DOCKS={
  sf:{x:0,z:-255,deckZ:-274},
  island:{x:0,z:-1060,deckZ:-1041},
} as const;
export const REGIONS:Region[]=[
  {id:'sf',name:'San Francisco and the Peninsula',color:0xd4d1bb,points:polygon([[-390,-225],[-355,-290],[-285,-302],[-230,-290],[-160,-290],[-90,-276],[-25,-240],[25,-205],[65,-150],[86,-90],[92,-30],[86,45],[78,105],[52,170],[12,230],[-5,290],[10,600],[80,1200],[180,3000],[340,4800],[650,6500],[1150,8000],[1450,8800],[1600,8800],[1900,9200],[1050,9300],[650,9000],[350,8000],[-500,6800],[-800,5500],[-1200,4500],[-1500,3000],[-1550,2000],[-1500,1700],[-1300,1300],[-800,1000],[-600,700],[-400,300],[-390,245],[-410,120],[-408,-80]])},
  {id:'oakland',name:'Oakland and the East Bay',color:0xd3cfb8,points:polygon([[310,-270],[400,-300],[550,-280],[602,-205],[610,260],[950,1000],[1300,2000],[1800,3500],[1800,5000],[2200,6500],[2340,8000],[1890,9100],[1500,9200],[1300,8800],[1600,8000],[1550,6500],[1150,5000],[760,3400],[500,1600],[350,1000],[230,430],[285,260],[285,195],[290,110],[305,50],[295,-40],[280,-125],[287,-215]])},
  {id:'marin',name:'Marin Headlands',color:0x9ba883,points:polygon([[-410,-550],[-120,-550],[-116,-460],[-140,-413],[-185,-385],[-230,-374],[-275,-385],[-340,-382],[-400,-405],[-420,-470]])},
  {id:'yerba',name:'Yerba Buena Island',color:0xa9b49a,points:polygon([[169,27],[193,12],[222,22],[238,44],[235,70],[220,87],[187,91],[164,76],[158,49]])},
  {id:'sf-ferry-apron',name:'San Francisco ferry apron',color:0xb9b7a4,points:polygon([[-20,-255],[20,-255],[20,-195],[-20,-195]])},
  DOME_WATERFRONT, ROCKET_ISLAND,
];
export type Bridge = { id:'golden-gate'|'bay-bridge'; name:string; axis:'x'|'z'; start:number; end:number; center:number; width:number };
// Decks are at ground height, deliberate arcade simplification; water is below.
export const BRIDGES:Bridge[]=[
 {id:'golden-gate',name:'Golden Gate Bridge',axis:'z',start:-419,end:-240,center:-240,width:24},
 {id:'bay-bridge',name:'Bay Bridge',axis:'x',start:60,end:330,center:60,width:24},
];
export const PARKS=[
 {id:'presidio',x:-270,z:-245,w:92,d:65,color:0x8da97c},
 {id:'golden-gate-park',x:-300,z:62,w:125,d:35,color:0x8fae80},
 {id:'lake-merritt',x:480,z:150,w:44,d:44,color:0x8cab83},
 {id:'yerba-green',x:201,z:55,w:50,d:38,color:0x94a985},
];
// Lake Merritt is a shallow decorative feature: the shared ground remains drivable.
export const LAKE_MERRITT={x:480,z:150,rx:18,rz:21,islands:[{x:474,z:145,r:4},{x:484,z:148,r:3.5},{x:480,z:157,r:3}]} as const;
// A fictional sightseeing easter egg, not a depiction of any real person's vessel.
export const MYSTERY_YACHT={x:210,z:-115,name:'Larry’s Imaginary Yacht'} as const;
export function insidePolygon(x:number,z:number,points:MapPoint[]):boolean {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function isLand(x:number,z:number):boolean{return REGIONS.some(r=>insidePolygon(x,z,r.points));}
/** Rocket Island has a server-side safety boundary at any altitude. */
export function isRocketIsland(x:number,z:number):boolean{return insidePolygon(x,z,ROCKET_ISLAND.points);}
export function isBridge(x:number,z:number):boolean{return BRIDGES.some(b=>b.axis==='x'?x>=b.start&&x<=b.end&&Math.abs(z-b.center)<=b.width/2:z>=b.start&&z<=b.end&&Math.abs(x-b.center)<=b.width/2);}
export function isSurface(x:number,z:number):boolean{return isLand(x,z)||isBridge(x,z);}

/** A small authored hill south of SF. Its height and gradient taper to zero at every edge. */
export const HILL={minX:-200,maxX:-15,minZ:500,maxZ:760,height:10,columns:32,rows:48} as const;
// Small arcade-scale landforms echo real Bay peaks; these are not elevation data.
// Their extents stay off the shared road and are sampled by both physics and rendering.
const twin=NORTH_NATURAL_LANDMARKS.find(place=>place.id==='twin-peaks')!;
const tam=NORTH_NATURAL_LANDMARKS.find(place=>place.id==='mount-tamalpais')!;
const missionPeak=SOUTH_LANDMARKS.find(place=>place.id==='mission-peak')!;
export const NATURAL_HILLS=[
 {id:'twin-peaks',minX:twin.x-20,maxX:twin.x+20,minZ:twin.z-20,maxZ:twin.z+20,height:12,columns:32,rows:32,twin:true},
 {id:'mount-tamalpais',minX:tam.x-25,maxX:tam.x+25,minZ:tam.z-25,maxZ:tam.z+25,height:30,columns:32,rows:32,twin:false},
 {id:'mission-peak',minX:missionPeak.x-32,maxX:missionPeak.x+32,minZ:missionPeak.z-32,maxZ:missionPeak.z+32,height:35,columns:32,rows:32,twin:false},
] as const;
/** A fictional east/west crossing of US 101, with two 90 m approaches. */
export const OVERPASS={id:'overpass',start:-430,deckStart:-340,deckEnd:-240,end:-150,z:480,width:18,height:8,thickness:.8} as const;
export type SupportId='ground'|'overpass'|'stunt-ramp'|'stunt-loop'|'dome'|'island-bank'|'island-cliff'|'ferry'|`roof:${number}`;
// Both simulation and the rendered mesh use these same two triangles per cell.
function sampledHill(hill:{minX:number;maxX:number;minZ:number;maxZ:number;height:number;columns:number;rows:number;twin?:boolean},x:number,z:number):{height:number;dx:number;dz:number} {
 if(x<=hill.minX||x>=hill.maxX||z<=hill.minZ||z>=hill.maxZ)return {height:0,dx:0,dz:0};
 const width=(hill.maxX-hill.minX)/hill.columns,depth=(hill.maxZ-hill.minZ)/hill.rows;
 const gx=(x-hill.minX)/width,gz=(z-hill.minZ)/depth,i=Math.floor(gx),j=Math.floor(gz),u=gx-i,v=gz-j;
 const vertex=(a:number,b:number)=>hill.height*Math.sin((hill.twin?2:1)*Math.PI*a/hill.columns)**2*Math.sin(Math.PI*b/hill.rows)**2;
 const h00=vertex(i,j),h10=vertex(i+1,j),h01=vertex(i,j+1),h11=vertex(i+1,j+1);
 return u+v<=1
  ? {height:h00+u*(h10-h00)+v*(h01-h00),dx:(h10-h00)/width,dz:(h01-h00)/depth}
  : {height:h11+(1-u)*(h01-h11)+(1-v)*(h10-h11),dx:(h11-h01)/width,dz:(h11-h10)/depth};
}
function hillSurface(x:number,z:number):{height:number;dx:number;dz:number} {
 let surface=sampledHill(HILL,x,z);
 for(const hill of NATURAL_HILLS){const next=sampledHill(hill,x,z);if(next.height>surface.height)surface=next;}
 return surface;
}
export function terrainHeight(x:number,z:number):number|null {
 if(!isSurface(x,z))return null;
 return hillSurface(x,z).height;
}
export function overpassHeight(x:number,z:number):number|null {
 if(x<OVERPASS.start||x>OVERPASS.end||Math.abs(z-OVERPASS.z)>OVERPASS.width/2)return null;
 if(x<OVERPASS.deckStart)return OVERPASS.height*(x-OVERPASS.start)/(OVERPASS.deckStart-OVERPASS.start);
 if(x>OVERPASS.deckEnd)return OVERPASS.height*(OVERPASS.end-x)/(OVERPASS.end-OVERPASS.deckEnd);
 return OVERPASS.height;
}
/** Surface IDs are static map identities; null denotes no support at the pivot. */
export function supportHeight(id:SupportId,x:number,z:number):number|null {
 if(id==='ground')return terrainHeight(x,z);
 if(id==='overpass')return overpassHeight(x,z);
 if(id==='stunt-ramp')return rampHeight(x,z);
 if(id==='island-bank')return bankSurface(x,z)?.height??null;
 // Curved surfaces can have multiple heights at one point; ferry support moves.
 if(id==='stunt-loop'||id==='dome'||id==='island-cliff'||id==='ferry')return null;
 const b=BUILDINGS[Number(id.slice(5))];
 return b&&Math.abs(x-b.x)<=b.w/2&&Math.abs(z-b.z)<=b.d/2?b.h:null;
}
export function supportNormal(id:SupportId,x:number,z:number):{x:number;y:number;z:number}|null {
 if(supportHeight(id,x,z)===null)return null;
 if(id==='island-bank')return bankSurface(x,z)?.normal??null;
 let dx=0,dz=0;
 if(id==='ground')({dx,dz}=hillSurface(x,z));
 else if(id==='stunt-ramp')dx=STUNT_RAMP.height/(STUNT_RAMP.end-STUNT_RAMP.start);
 else if(id==='overpass'){
  if(x<OVERPASS.deckStart)dx=OVERPASS.height/(OVERPASS.deckStart-OVERPASS.start);
  else if(x>OVERPASS.deckEnd)dx=-OVERPASS.height/(OVERPASS.end-OVERPASS.deckEnd);
 }
 const length=Math.hypot(dx,1,dz);return {x:-dx/length,y:1/length,z:-dz/length};
}
/** Arc length around the dome's inner cross-section, starting at the -Z floor edge.
 * Tangent follows increasing arc length; normal points into the dome. */
export const DOME_PERIMETER=4*DOME.flatHalfWidth+2*Math.PI*DOME.radius;
export function domeSurface(arcLength:number):{y:number;z:number;tangentY:number;tangentZ:number;normalY:number;normalZ:number} {
 const w=DOME.flatHalfWidth,r=DOME.radius,arc=Math.PI*r;
 const s=((arcLength%DOME_PERIMETER)+DOME_PERIMETER)%DOME_PERIMETER;
 if(s<2*w)return {y:0,z:DOME.z-w+s,tangentY:0,tangentZ:1,normalY:1,normalZ:0};
 if(s<2*w+arc){const a=(s-2*w)/r;return {y:r*(1-Math.cos(a)),z:DOME.z+w+r*Math.sin(a),tangentY:Math.sin(a),tangentZ:Math.cos(a),normalY:Math.cos(a),normalZ:-Math.sin(a)};}
 if(s<4*w+arc)return {y:2*r,z:DOME.z+w-(s-2*w-arc),tangentY:0,tangentZ:-1,normalY:-1,normalZ:0};
 const a=(s-4*w-arc)/r;
 return {y:r*(1+Math.cos(a)),z:DOME.z-w-r*Math.sin(a),tangentY:-Math.sin(a),tangentZ:-Math.cos(a),normalY:-Math.cos(a),normalZ:Math.sin(a)};
}

export type RoadSegment={x:number;z:number;w:number;d:number;axis:'x'|'z';angle?:number;kind?:'highway'|'island'};
export const ROADS:RoadSegment[]=[];
/** Clear the stadium footprint while leaving the adjoining city streets intact. */
export function inDomePlaza(x:number,z:number):boolean {
 return Math.abs(x-DOME.x)<96&&z>=DOME.z-65&&z<=DOME.z+80;
}
function streetGrid(xs:number[],zs:number[],xmin:number,xmax:number,zmin:number,zmax:number){
 for(const x of xs)for(let z=zmin;z<zmax;z+=15)if(isLand(x,z+7.5)&&!inDomePlaza(x,z+7.5))ROADS.push({x,z:z+7.5,w:14,d:15,axis:'z'});
 for(const z of zs)for(let x=xmin;x<xmax;x+=15)if(isLand(x+7.5,z)&&!inDomePlaza(x+7.5,z))ROADS.push({x:x+7.5,z,w:15,d:14,axis:'x'});
}
streetGrid([-360,-300,-240,-180,-120,-60,0,60],[-240,-180,-120,-60,0,60,120,180,240],-405,105,-300,300);
streetGrid([330,390,450,510,570],[-240,-180,-120,-60,0,60,120,180,240],270,610,-285,300);
// Shore roads and bridge approaches, connected to the two street grids.
ROADS.push({x:-240,z:-330,w:18,d:180,axis:'z'},{x:195,z:60,w:270,d:24,axis:'x'});
// The north gate connects directly to the z=120 city street.
ROADS.push({x:DOME.x,z:(120+DOME.z-DOME.flatHalfWidth)/2,w:18,d:DOME.z-DOME.flatHalfWidth-120,axis:'z'});

// A flat, wide free-roam loop and dock connection. The land is the physical
// surface; these shared road rectangles are the same paint shown in the map.
export const ISLAND_TRACK:MapPoint[]=Array.from({length:48},(_,i)=>{
 const a=i/48*Math.PI*2;
 return {x:200+510*Math.cos(a),z:-1650+350*Math.sin(a)};
});
for(let i=0;i<ISLAND_TRACK.length;i++){
 const a=ISLAND_TRACK[i],b=ISLAND_TRACK[(i+1)%ISLAND_TRACK.length],dx=b.x-a.x,dz=b.z-a.z;
 ROADS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:28,d:Math.hypot(dx,dz)+1,axis:'z',angle:Math.atan2(dx,dz),kind:'island'});
}
for(let i=0;i<SHORT_TRACK.length;i++){
 const a=SHORT_TRACK[i],b=SHORT_TRACK[(i+1)%SHORT_TRACK.length],dx=b.x-a.x,dz=b.z-a.z;
 ROADS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:28,d:Math.hypot(dx,dz)+1,axis:'z',angle:Math.atan2(dx,dz),kind:'island'});
}
ROADS.push(
 {x:0,z:-1200,w:24,d:280,axis:'z',kind:'island'},
 {x:0,z:-225,w:24,d:60,axis:'z'},
);

/** Distances and shorelines are game-space approximations, not navigation. */
export const HIGHWAYS:{id:string;name:string;points:MapPoint[]}[]=[
 {id:'peninsula',name:'US 101',points:BAY_HIGHWAY_TRACES.peninsula.map(([x,z])=>({x,z}))},
 {id:'east-bay',name:'I-880',points:BAY_HIGHWAY_TRACES['east-bay'].map(([x,z])=>({x,z}))},
];
// Shared route is closed implicitly: its final point joins the first on SF streets.
export const BAY_CIRCUIT:MapPoint[]=[
 {x:-180,z:60},...HIGHWAYS[0].points,...HIGHWAYS[1].points.slice(1),{x:330,z:60},
];
function pointAtZ(highway:typeof HIGHWAYS[number],z:number):MapPoint{
 for(let i=1;i<highway.points.length;i++){
  const a=highway.points[i-1],b=highway.points[i];
  if(z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z))return {x:a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z),z};
 }
 throw new Error(`No highway point at ${z}`);
}
// Approximate arcade destinations, placed beside the compressed traced corridors.
export const DISTRICTS=[
 {id:'san-mateo',name:'San Mateo',...pointAtZ(HIGHWAYS[0],2000)},
 {id:'palo-alto',name:'Palo Alto',...pointAtZ(HIGHWAYS[0],4000)},
 {id:'mountain-view',name:'Mountain View',...pointAtZ(HIGHWAYS[0],6000)},
 {id:'san-jose',name:'San Jose',x:1530,z:8770},
 {id:'fremont',name:'Fremont',...pointAtZ(HIGHWAYS[1],6000)},
 {id:'east-bay',name:'East Bay',...pointAtZ(HIGHWAYS[1],3000)},
] as const;
// Recognizable places, entirely re-positioned and scaled for the arcade map.
// Arrival points are clear of shared building collision for delivery gameplay.
export const LANDMARKS=[
 {id:'berkeley',name:'UC Berkeley · Campanile',x:540,z:-260,w:14,d:14,h:66,district:'oakland',style:'campanile',arrival:{x:510,z:-240}},
 {id:'sfo',name:'SFO · Airport',x:-740,z:1200,w:20,d:20,h:46,district:'peninsula',style:'airport',arrival:{x:-710,z:1200}},
 {id:'stanford',name:'Stanford · Hoover Tower',x:-940,z:4000,w:16,d:16,h:60,district:'peninsula',style:'hoover',arrival:{x:-940,z:4030}},
 {id:'mission-san-jose',name:'Fremont · Mission San José',x:1770,z:6000,w:26,d:18,h:20,district:'east-bay',style:'mission',arrival:{x:1770,z:6035}},
 {id:'san-jose-city-hall',name:'San José · City Hall',x:1680,z:8700,w:22,d:22,h:23,district:'south-bay',style:'rotunda',arrival:{x:1705,z:8730}},
] as const;
// Runway paint sits on the same supported land as the cars; no aircraft simulation.
export const AIRPORT_RUNWAY={x:-660,z:1200,w:20,d:110} as const;
for(const highway of HIGHWAYS)for(let i=1;i<highway.points.length;i++){
 const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z;
 ROADS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:32,d:Math.hypot(dx,dz)+1,axis:'z',angle:Math.atan2(dx,dz),kind:'highway'});
}

export type Building={x:number;z:number;w:number;d:number;h:number;district:'sf'|'oakland'|'peninsula'|'south-bay'|'east-bay';style:'house'|'midrise'|'tower'|'pyramid'|'ferry'|'coit'|'salesforce'|'tribune'|'campanile'|'airport'|'hoover'|'mission'|'rotunda'|'landmark'};
export const BUILDINGS:Building[]=[];
function inPark(x:number,z:number){return PARKS.some(p=>Math.abs(x-p.x)<p.w/2+8&&Math.abs(z-p.z)<p.d/2+8);}
function blocks(district:'sf'|'oakland',xmin:number,xmax:number,zmin:number,zmax:number){
 for(let x=xmin;x<xmax;x+=60)for(let z=zmin;z<zmax;z+=60){
  const cx=x+30,cz=z+30;
  if(inPark(cx,cz)||![-20,20].every(dx=>[-20,20].every(dz=>isLand(cx+dx,cz+dz))))continue;
  // Preserve a shared, unobstructed Bay Bridge approach and hand-authored landmarks.
  if(district==='sf'&&cx===-30&&(cz===-210||cz===-90||cz===-30))continue;
  if(district==='oakland'&&cx===420&&cz===-90)continue;
  const seed=Math.abs((x*71+z*31)%17), downtown=district==='sf'&&cx>-165&&cz<75&&cz>-190;
  const tall= downtown?28+seed*3 : district==='oakland'&&cx>375&&cx<525&&cz<65?20+seed*2:9+seed;
  const type:Building['style']=tall>38?'tower':tall>22?'midrise':'house';
  const generated:Building[]=[
   {x:cx-10,z:cz,w:18,d:24,h:tall,district,style:type},
   {x:cx+12,z:cz,w:15,d:20,h:Math.max(8,tall*(.56+(seed%3)*.11)),district,style:type==='tower'?'midrise':type},
  ];
  for(const b of generated)if(!inDomePlaza(b.x,b.z)&&!STATIONS.some(s=>Math.abs(b.x-s.x)<(b.w+CHARGER_LOT.width)/2&&Math.abs(b.z-s.z)<(b.d+CHARGER_LOT.length)/2))BUILDINGS.push(b);
 }
}
blocks('sf',-360,60,-240,240);blocks('oakland',330,570,-240,240);
BUILDINGS.push(
 {x:-30,z:-90,w:19,d:19,h:68,district:'sf',style:'pyramid'},
 {x:-30,z:-30,w:22,d:22,h:82,district:'sf',style:'salesforce'},
 {x:-30,z:-210,w:10,d:10,h:32,district:'sf',style:'coit'},
 {x:420,z:-90,w:17,d:17,h:44,district:'oakland',style:'tribune'},
 {x:45,z:-35,w:17,d:31,h:11,district:'sf',style:'ferry'},
);
function distanceToHighway(x:number,z:number){
 let best=Infinity;
 for(const h of HIGHWAYS)for(let i=1;i<h.points.length;i++){
  const a=h.points[i-1],b=h.points[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
 }
 return best;
}
// Compact, physically collidable district clusters. Roads and shoulders remain clear.
for(const district of DISTRICTS){
 const highway=HIGHWAYS[district.id==='fremont'||district.id==='east-bay'?1:0];
 const point=highway.points.findIndex((p,i)=>i>0&&district.z>=Math.min(p.z,highway.points[i-1].z)&&district.z<=Math.max(p.z,highway.points[i-1].z));
 if(point<1)continue;
 const before=highway.points[point-1],after=highway.points[point];
 const dx=after.x-before.x,dz=after.z-before.z,length=Math.hypot(dx,dz),tx=dx/length,tz=dz/length;
 for(const side of [-1,1])for(const along of [-70,0,70])for(const offset of [65,120]){
  const x=district.x+tx*along+tz*offset*side,z=district.z+tz*along-tx*offset*side;
  const w=24,d=22;
  if(distanceToHighway(x,z)<Math.hypot(w,d)/2+21||![-1,1].every(sx=>[-1,1].every(sz=>isLand(x+sx*w/2,z+sz*d/2))))continue;
  const high=district.id==='san-jose'&&offset===65;
  const h=high?48+(along+70)/7:12+(Math.abs(along)+offset)%17;
  BUILDINGS.push({x,z,w,d,h,district:district.id==='san-jose'?'south-bay':district.id==='fremont'||district.id==='east-bay'?'east-bay':'peninsula',style:high?'tower':h>22?'midrise':'house'});
 }
}
for(const {x,z,w,d,h,district,style} of LANDMARKS)BUILDINGS.push({x,z,w,d,h,district,style});
// Replace only generated background blocks where a hand-authored landmark or
// a physical hill stands. Existing special landmarks keep their own identity.
export const EXTRA_LANDMARKS=[...NORTH_LANDMARKS,...SOUTH_LANDMARKS];
const landmarkBuildings:Building[]=EXTRA_LANDMARKS.filter(place=>place.id!=='mission-peak')
 .map(({x,z,w,d,h,district})=>({x,z,w,d,h,district,style:'landmark'}));
for(let i=BUILDINGS.length-1;i>=0;i--){
 const b=BUILDINGS[i];
 if(b.style!=='house'&&b.style!=='midrise'&&b.style!=='tower')continue;
 const overlapsLandmark=landmarkBuildings.some(p=>Math.abs(p.x-b.x)<(p.w+b.w)/2+1&&Math.abs(p.z-b.z)<(p.d+b.d)/2+1);
 const overlapsHill=NATURAL_HILLS.some(h=>b.x+b.w/2>h.minX&&b.x-b.w/2<h.maxX&&b.z+b.d/2>h.minZ&&b.z-b.d/2<h.maxZ);
 if(overlapsLandmark||overlapsHill)BUILDINGS.splice(i,1);
}
BUILDINGS.push(...landmarkBuildings);
// Shared candidate index keeps collision cost local as the city grows.
const CELL=60,buildingCells=new Map<string,Building[]>();
for(const b of BUILDINGS){
 for(let x=Math.floor((b.x-b.w/2)/CELL);x<=Math.floor((b.x+b.w/2)/CELL);x++)for(let z=Math.floor((b.z-b.d/2)/CELL);z<=Math.floor((b.z+b.d/2)/CELL);z++){
  const key=`${x},${z}`,cell=buildingCells.get(key)??[];cell.push(b);buildingCells.set(key,cell);
 }
}
export function nearbyBuildings(x:number,z:number,radius=8):Building[]{
 const found=new Set<Building>();
 for(let a=Math.floor((x-radius)/CELL);a<=Math.floor((x+radius)/CELL);a++)for(let b=Math.floor((z-radius)/CELL);b<=Math.floor((z+radius)/CELL);b++)for(const building of buildingCells.get(`${a},${b}`)??[])found.add(building);
 return [...found];
}
