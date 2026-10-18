/** Compressed, hand-authored Bay geography. X east, Z south, meters in game space. */
export type MapPoint = { x:number; z:number };
export type Region = { id:string; name:string; color:number; points:MapPoint[] };
const polygon=(pairs:number[][]):MapPoint[]=>pairs.map(([x,z])=>({x,z}));
export const MAP_BOUNDS={minX:-440,maxX:620,minZ:-550,maxZ:350} as const;
export const REGIONS:Region[]=[
  {id:'sf',name:'San Francisco',color:0xd4d1bb,points:polygon([[-390,-225],[-355,-290],[-285,-302],[-230,-290],[-160,-290],[-90,-276],[-25,-240],[25,-205],[65,-150],[86,-90],[92,-30],[86,45],[78,105],[52,170],[12,230],[-52,285],[-165,305],[-285,300],[-390,245],[-410,120],[-408,-80]])},
  {id:'oakland',name:'Oakland',color:0xd3cfb8,points:polygon([[310,-270],[400,-300],[550,-280],[602,-205],[610,260],[540,310],[390,302],[315,260],[285,195],[290,110],[305,50],[295,-40],[280,-125],[287,-215]])},
  {id:'marin',name:'Marin Headlands',color:0x9ba883,points:polygon([[-410,-550],[-120,-550],[-116,-460],[-140,-413],[-185,-385],[-230,-374],[-275,-385],[-340,-382],[-400,-405],[-420,-470]])},
  {id:'yerba',name:'Yerba Buena Island',color:0xa9b49a,points:polygon([[169,27],[193,12],[222,22],[238,44],[235,70],[220,87],[187,91],[164,76],[158,49]])},
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
export function insidePolygon(x:number,z:number,points:MapPoint[]):boolean {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function isLand(x:number,z:number):boolean{return REGIONS.some(r=>insidePolygon(x,z,r.points));}
export function isBridge(x:number,z:number):boolean{return BRIDGES.some(b=>b.axis==='x'?x>=b.start&&x<=b.end&&Math.abs(z-b.center)<=b.width/2:z>=b.start&&z<=b.end&&Math.abs(x-b.center)<=b.width/2);}
export function isSurface(x:number,z:number):boolean{return isLand(x,z)||isBridge(x,z);}
export type RoadSegment={x:number;z:number;w:number;d:number;axis:'x'|'z'};
export const ROADS:RoadSegment[]=[];
function streetGrid(xs:number[],zs:number[],xmin:number,xmax:number,zmin:number,zmax:number){
 for(const x of xs)for(let z=zmin;z<zmax;z+=15)if(isLand(x,z+7.5))ROADS.push({x,z:z+7.5,w:14,d:15,axis:'z'});
 for(const z of zs)for(let x=xmin;x<xmax;x+=15)if(isLand(x+7.5,z))ROADS.push({x:x+7.5,z,w:15,d:14,axis:'x'});
}
streetGrid([-360,-300,-240,-180,-120,-60,0,60],[-240,-180,-120,-60,0,60,120,180,240],-405,105,-300,300);
streetGrid([330,390,450,510,570],[-240,-180,-120,-60,0,60,120,180,240],270,610,-285,300);
// Shore roads and bridge approaches, connected to the two street grids.
ROADS.push({x:-240,z:-330,w:18,d:180,axis:'z'},{x:195,z:60,w:270,d:24,axis:'x'});
export type Building={x:number;z:number;w:number;d:number;h:number;district:'sf'|'oakland';style:'house'|'midrise'|'tower'|'pyramid'|'ferry'|'coit'|'salesforce'|'tribune'};
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
  BUILDINGS.push({x:cx-10,z:cz,w:18,d:24,h:tall,district,style:type});
  BUILDINGS.push({x:cx+12,z:cz,w:15,d:20,h:Math.max(8,tall*(.56+(seed%3)*.11)),district,style:type==='tower'?'midrise':type});
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
