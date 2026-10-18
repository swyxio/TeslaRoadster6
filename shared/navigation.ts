import { isSurface, nearbyBuildings, ROADS } from './map';
import { requiredLevelAt, type Level } from './delivery';
import { ROUTES, type Point } from './traffic';
import type { Entity } from './game';

export type Navigation = { destination:Point; path:Point[]; index:number; status:'driving'|'arrived' };
// With traffic stopping within four metres, this keeps delivery arrival within
// the nine-metre pickup/dropoff marker even after the endpoint is snapped.
export const DELIVERY_DESTINATION_SNAP = 4.5;
type Segment = {a:Point;b:Point;cuts:number[]};
type Edge = {to:number;distance:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(s:Segment,t:number):Point=>({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t});
const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
const canTurn=(a:Point,b:Point,c:Point)=>{
  const ab={x:b.x-a.x,z:b.z-a.z},bc={x:c.x-b.x,z:c.z-b.z};
  const scale=Math.hypot(ab.x,ab.z)*Math.hypot(bc.x,bc.z);
  return scale<=1||ab.x*bc.x+ab.z*bc.z>=-.9*scale;
};
const projection=(p:Point,s:Segment)=>{
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
  const t=Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(dx*dx+dz*dz||1)));
  return {t,point:point(s,t)};
};

type RoadGraph={segments:Segment[];nodes:Point[];edges:Edge[][];nodeIds:Map<string,number>;segmentNodes:{t:number;id:number}[][]};
let roadGraph:RoadGraph|undefined;

// Traffic tours omit the western SF streets. Extend that graph using the same
// 15 m street tiles as the map, joining touching tiles before adding lanes.
function cityLanes():Segment[] {
  const groups=new Map<string,{axis:'x'|'z';center:number;intervals:{start:number;end:number}[]}>();
  for(const road of ROADS){
    if(road.kind||road.angle||(road.axis==='x'?(road.w!==15||road.d!==14):(road.w!==14||road.d!==15)))continue;
    const axis=road.axis,center=axis==='x'?road.z:road.x,along=axis==='x'?road.x:road.z,key=`${axis}:${center}`;
    // The existing traffic graph covers x=-240 and eastward. Its westbound
    // join is included in the horizontal spans, but no map geometry moves.
    if(axis==='z'&&(center< -360||center> -300))continue;
    if(axis==='x'&&(along< -375||along> -225))continue;
    let group=groups.get(key);if(!group){group={axis,center,intervals:[]};groups.set(key,group);}
    group.intervals.push({start:along-7.5,end:along+7.5});
  }
  const lanes:Segment[]=[];
  for(const {axis,center,intervals} of groups.values()){
    intervals.sort((a,b)=>a.start-b.start);
    const runs:{start:number;end:number}[]=[];
    for(const interval of intervals){
      const last=runs.at(-1);
      if(last&&interval.start<=last.end+.01)last.end=Math.max(last.end,interval.end);
      else runs.push({...interval});
    }
    for(const run of runs)for(const offset of [-3,3]){
      const at=(along:number):Point=>axis==='x'?{x:along,z:center+offset}:{x:center+offset,z:along};
      const safe=(p:Point)=>isSurface(p.x,p.z)&&isSurface(p.x-2,p.z-2)&&isSurface(p.x-2,p.z+2)&&
        isSurface(p.x+2,p.z-2)&&isSurface(p.x+2,p.z+2)&&
        !nearbyBuildings(p.x,p.z,4).some(b=>Math.abs(p.x-b.x)<b.w/2+2&&Math.abs(p.z-b.z)<b.d/2+2);
      let start:number|null=null,last=0;
      const finish=()=>{
        if(start!==null&&last-start>=6){
          const a=at(start),b=at(last),forward=axis==='x'?offset>0:offset<0;
          lanes.push({a:forward?a:b,b:forward?b:a,cuts:[0,1]});
        }
        start=null;
      };
      for(let along=run.start+5;along<=run.end-5;along+=3){
        if(safe(at(along))){if(start===null)start=along;last=along;}else finish();
      }
      finish();
    }
  }
  return lanes;
}
function navigationGraph():RoadGraph {
  if(roadGraph)return roadGraph;
  // Build only when a route is requested. The browser predicts driving but
  // does not plan destinations, so it need not build this server-side graph.
  // Break the one-way traffic lanes at their shared intersections.
  const segments:Segment[]=ROUTES.flatMap(route=>route.map((a,i)=>({a,b:route[(i+1)%route.length],cuts:[0,1]})));
  segments.push(...cityLanes());
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j],ax=a.b.x-a.a.x,az=a.b.z-a.a.z,bx=b.b.x-b.a.x,bz=b.b.z-b.a.z;
    const denominator=cross(ax,az,bx,bz),dx=b.a.x-a.a.x,dz=b.a.z-a.a.z;
    if(Math.abs(denominator)>1e-6){
      const t=cross(dx,dz,bx,bz)/denominator,u=cross(dx,dz,ax,az)/denominator;
      if(t>=0&&t<=1&&u>=0&&u<=1){a.cuts.push(t);b.cuts.push(u);}
    }else{
      // Connect coincident parts of overlapping city loops at their endpoints.
      for(const t of [0,1]){const p=point(a,t),q=projection(p,b);if(distance(p,q.point)<.01){a.cuts.push(t);b.cuts.push(q.t);}}
      for(const t of [0,1]){const p=point(b,t),q=projection(p,a);if(distance(p,q.point)<.01){b.cuts.push(t);a.cuts.push(q.t);}}
    }
  }
  const nodes:Point[]=[],edges:Edge[][]=[],nodeIds=new Map<string,number>();
  function node(p:Point):number{
    const key=`${Math.round(p.x*100)},${Math.round(p.z*100)}`;
    let id=nodeIds.get(key);if(id===undefined){id=nodes.length;nodeIds.set(key,id);nodes.push(p);edges.push([]);}return id;
  }
  const segmentNodes=segments.map(s=>{
    const cuts=[...new Set(s.cuts.map(t=>Math.round(t*1e7)/1e7))].sort((a,b)=>a-b);
    return cuts.map(t=>({t,id:node(point(s,t))}));
  });
  for(let i=0;i<segments.length;i++){
    const cuts=segmentNodes[i];
    for(let j=0;j<cuts.length-1;j++){
      const from=cuts[j].id,to=cuts[j+1].id;if(from!==to)edges[from].push({to,distance:distance(nodes[from],nodes[to])});
    }
  }
  return roadGraph={segments,nodes,edges,nodeIds,segmentNodes};
}
function allowed(a:Point,b:Point,level:Level):boolean{
  const count=Math.max(1,Math.ceil(distance(a,b)/30));
  // A purchase may lower a driver's level while they are in a locked area.
  // Permit egress, but never let a route climb back into a higher tier.
  let ceiling=Math.max(level,requiredLevelAt(a.x,a.z));
  for(let i=1;i<=count;i++){
    const t=i/count,required=requiredLevelAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
    if(required>ceiling)return false;
    ceiling=Math.max(level,required);
  }
  return true;
}

/** Find a directed route to the nearest connected lane, respecting progress. */
export function planNavigation(car:Entity,destination:Point,level:Level,maxDestinationSnap=100):Navigation|null {
  if(car.kind==='person'||car.supportId!=='ground'||car.inDome||!isSurface(destination.x,destination.z)||requiredLevelAt(destination.x,destination.z)>level)return null;
  const {segments,nodes,edges,nodeIds,segmentNodes}=navigationGraph();
  const candidates=(p:Point,max:number)=>segments.map((s,i)=>({i,...projection(p,s)})).map(c=>({...c,distance:distance(p,c.point)})).filter(c=>c.distance<=max).sort((a,b)=>a.distance-b.distance);
  const starts=candidates(car,30),ends=candidates(destination,maxDestinationSnap);
  if(!starts.length||!ends.length)return null;
  const alignment=(c:typeof starts[number])=>{
    const s=segments[c.i],length=distance(s.a,s.b)||1;
    return (-Math.sin(car.yaw)*(s.b.x-s.a.x)-Math.cos(car.yaw)*(s.b.z-s.a.z))/length;
  };
  const forward=starts.filter(c=>c.distance<=starts[0].distance+7&&alignment(c)>.1);
  // If already on a lane facing against it, continue in the direction the
  // car faces only as far as the previous intersection, then use directed
  // streets normally. Avoid inventing an off-road turn to reach that lane.
  const closeStarts=(forward.length?forward.map(c=>({...c,reverse:false})):
    starts.filter(c=>c.distance<=3&&alignment(c)<-.75).map(c=>({...c,reverse:true}))).slice(0,12);
  if(!closeStarts.length)return null;
  const closeEnds=ends.filter(c=>c.distance<=ends[0].distance+6).slice(0,16);
  const dist=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),origins=new Map<number,Point>(),used=new Set<number>();
  const ahead=(p:Point)=>(p.x-car.x)*-Math.sin(car.yaw)+(p.z-car.z)*-Math.cos(car.yaw)>=-.5;
  for(const start of closeStarts){
    const heading=alignment(start)*(start.reverse?-1:1);
    const cuts=segmentNodes[start.i];
    const next=start.reverse?[...cuts].reverse().find(c=>c.t<=start.t+1e-7):cuts.find(c=>c.t>=start.t-1e-7);
    if(!next||(start.reverse&&(distance(start.point,nodes[next.id])>120||!ahead(nodes[next.id])))||!allowed(car,nodes[next.id],level))continue;
    const cost=start.distance*2+(1-heading)*8+distance(start.point,nodes[next.id]);
    if(cost<dist[next.id]){dist[next.id]=cost;origins.set(next.id,start.point);}
  }
  let bestCost=Infinity,bestNode=-1,bestEnd:Point|undefined;
  // Direct travel on a single segment need not pass through an intersection.
  let direct:Point[]|undefined;
  for(const start of closeStarts)for(const end of closeEnds)if(start.i===end.i&&(start.reverse?end.t<=start.t&&distance(start.point,end.point)<=120&&ahead(end.point):end.t>=start.t)&&allowed(car,end.point,level)){
    const cost=start.distance*2+distance(start.point,end.point)+end.distance*2;
    if(cost<bestCost){bestCost=cost;bestEnd=end.point;direct=[end.point];}
  }
  while(used.size<nodes.length){
    let at=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(at<0||dist[i]<dist[at]))at=i;
    if(at<0||!Number.isFinite(dist[at])||dist[at]>bestCost)break;
    used.add(at);
    for(const end of closeEnds){
      const cuts=segmentNodes[end.i],before=[...cuts].reverse().find(c=>c.t<=end.t+1e-7);
      if(before?.id!==at||!allowed(nodes[at],end.point,level))continue;
      const cost=dist[at]+distance(nodes[at],end.point)+end.distance*2;
      if(cost<bestCost){bestCost=cost;bestNode=at;bestEnd=end.point;direct=undefined;}
    }
    for(const edge of edges[at])if(allowed(nodes[at],nodes[edge.to],level)){
      const cost=dist[at]+edge.distance;
      if(cost<dist[edge.to]){dist[edge.to]=cost;previous[edge.to]=at;}
    }
  }
  // A one-way loop can technically connect nearby streets by routing around
  // the entire region. Reject those routes instead of promising a local trip.
  if(!bestEnd||bestCost>Math.max(1200,distance(car,bestEnd)*5))return null;
  const path:Point[]=direct??[];
  if(!direct){
    for(let at=bestNode;at!==-1;at=previous[at])path.unshift(nodes[at]);
    const origin=origins.get(path.length?nodeIds.get(`${Math.round(path[0].x*100)},${Math.round(path[0].z*100)}`)!:-1);
    if(origin&&distance(car,origin)>3)path.unshift(origin);
    path.push(bestEnd);
  }
  // Remove redundant collinear cuts, but retain actual turns and the destination.
  const clean:Point[]=[];
  for(const p of path){
    if(clean.length&&distance(clean[clean.length-1],p)<.1)continue;
    while(clean.length>=2){const a=clean[clean.length-2],b=clean[clean.length-1];
      const ab={x:b.x-a.x,z:b.z-a.z},bc={x:p.x-b.x,z:p.z-b.z};
      if(Math.abs(cross(ab.x,ab.z,bc.x,bc.z))>.01*(Math.hypot(ab.x,ab.z)*Math.hypot(bc.x,bc.z))||ab.x*bc.x+ab.z*bc.z<=0)break;
      clean.pop();
    }
    clean.push(p);
  }
  // A directed graph can connect two opposing lanes with a point turnaround.
  // The vehicle cannot turn in place: reject this path rather than direct it
  // off the street or claim a destination is reachable.
  // The driver advances through waypoints within seven metres, so tiny cuts
  // at intersections cannot provide room for a three-point turn.
  const turns:Point[]=[car];
  for(const p of clean)if(distance(turns[turns.length-1],p)>7)turns.push(p);
  for(let i=1;i<turns.length-1;i++){
    if(!canTurn(turns[i-1],turns[i],turns[i+1]))return null;
  }
  return {destination:bestEnd,path:clean,index:0,status:'driving'};
}
