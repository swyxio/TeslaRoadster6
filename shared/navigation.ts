import { buildingBlocksPose } from './landmark-collision';
import { primitiveExtent } from './new-landmark-surfaces';
import { terrainHeight, isSurface, nearbyBuildings, ROADS, STUNT_LOOP, STUNT_RAMP } from './map';
import { requiredLevelAt, type Level } from './delivery';
import { ROUTES, type Point } from './traffic';
import { VEHICLES } from './vehicles';
import type { Entity } from './game';
import type { DriveMode } from './drive-mode';
import type { AutonomousFlightState } from './autonomous-flight';

export type Navigation = {
  destination:Point; path:Point[]; index:number; status:'driving'|'arrived'|'failed';
  mode?:DriveMode; flight?:AutonomousFlightState;
  // The off-road join is planned once, then followed with slower manoeuvres.
  join?:Point; joinReached?:boolean;
  recovery?:{index:number;distance:number;at:number;attempts:number;reverseUntil:number};
};
// With traffic stopping within four metres, this keeps delivery arrival within
// the nine-metre pickup/dropoff marker even after the endpoint is snapped.
export const DELIVERY_DESTINATION_SNAP = 4.5;
type Segment = {a:Point;b:Point;cuts:number[]};
type Edge = {to:number;distance:number;accessChecked:number;accessAllowed:number};
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
        !nearbyBuildings(p.x,p.z,4).some(b=>b.style==='structure'||b.style==='spaceport'?buildingBlocksPose(b,{...p,kind:'model-3',y:terrainHeight(p.x,p.z)??0,yaw:axis==='x'?Math.PI/2:0,pitch:0,roll:0,supportId:'ground'}):Math.abs(p.x-b.x)<b.w/2+2&&Math.abs(p.z-b.z)<b.d/2+2);
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
      const from=cuts[j].id,to=cuts[j+1].id;if(from!==to)edges[from].push({to,distance:distance(nodes[from],nodes[to]),accessChecked:0,accessAllowed:0});
    }
  }
  return roadGraph={segments,nodes,edges,nodeIds,segmentNodes};
}

/** Prepare the shared graph before a room starts its simulation timer. */
export function prepareNavigationGraph():void {
  navigationGraph();
}

/** A necessary, inexpensive test before planning a delivery route. */
export function canSnapDeliveryDestination(destination:Point,level:Level):boolean {
  if(!isSurface(destination.x,destination.z)||requiredLevelAt(destination.x,destination.z)>level)return false;
  return navigationGraph().segments.some(segment=>distance(destination,projection(destination,segment).point)<=DELIVERY_DESTINATION_SNAP);
}

/** Nearest supported road lane for localizing a job, not a route or teleport. */
export function nearestNavigationAnchor(origin:Point,level:Level):{point:Point;distance:number}|null {
  const ceiling=Math.max(level,requiredLevelAt(origin.x,origin.z));
  let best:{point:Point;distance:number}|null=null;
  for(const segment of navigationGraph().segments){
    const candidate=projection(origin,segment).point,d=distance(origin,candidate);
    if((!best||d<best.distance)&&isSurface(candidate.x,candidate.z)&&requiredLevelAt(candidate.x,candidate.z)<=ceiling)
      best={point:candidate,distance:d};
  }
  return best;
}
function allowed(a:Point,b:Point,level:Level):boolean{
  // Road navigation must not enter the loop, drive up the ramp, or try to
  // pass through its high end. Manual driving still uses the stunt surfaces.
  const crosses=(x:number,z:number,width:number)=>{
    const dx=b.x-a.x;if(!dx)return false;
    const t=(x-a.x)/dx;
    return t>=0&&t<=1&&Math.abs(a.z+(b.z-a.z)*t-z)<width/2;
  };
  if(crosses(STUNT_LOOP.x,STUNT_LOOP.z,STUNT_LOOP.width)||
    (a.x<=STUNT_RAMP.start&&b.x>STUNT_RAMP.start&&crosses(STUNT_RAMP.start,STUNT_RAMP.z,STUNT_RAMP.width))||
    (a.x>=STUNT_RAMP.end&&b.x<STUNT_RAMP.end&&crosses(STUNT_RAMP.end,STUNT_RAMP.z,STUNT_RAMP.width)))return false;
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

// Graph edges and access boundaries are static. Cache the directed edge check
// independently for each level, including the existing locked-area exit rule.
function allowedEdge(a:Point,b:Point,edge:Edge,level:Level):boolean {
  const bit=1<<level;
  if(!(edge.accessChecked&bit)){
    edge.accessChecked|=bit;
    if(allowed(a,b,level))edge.accessAllowed|=bit;
  }
  return !!(edge.accessAllowed&bit);
}

// Order equal costs by node id, matching the previous ascending-node scan.
class NavigationQueue {
  private items:{id:number;cost:number}[]=[];
  private before(a:{id:number;cost:number},b:{id:number;cost:number}):boolean {
    return a.cost<b.cost||(a.cost===b.cost&&a.id<b.id);
  }
  push(id:number,cost:number):void {
    const item={id,cost},items=this.items;let index=items.length;
    items.push(item);
    while(index>0){
      const parent=(index-1)>>1;if(!this.before(item,items[parent]))break;
      items[index]=items[parent];index=parent;
    }
    items[index]=item;
  }
  pop():{id:number;cost:number}|undefined {
    const items=this.items,first=items[0],last=items.pop();
    if(!first||!last||!items.length)return first;
    let index=0;
    while(true){
      const left=index*2+1;if(left>=items.length)break;
      const right=left+1,child=right<items.length&&this.before(items[right],items[left])?right:left;
      if(!this.before(items[child],last))break;
      items[index]=items[child];index=child;
    }
    items[index]=last;return first;
  }
}

// Connect an off-road car to a lane without crossing a building, unsupported
// ground, or a locked region. Keep conservative building envelopes for turning
// clearance; bridge/arena beams and spaceport parts use actual vertical clearance.
// This small visibility search runs only when a destination is requested.
type NavigationVehicle = Pick<Entity,'x'|'z'|'yaw'|'kind'|'supportId'|'inDome'>;
function offRoadApproach(car:NavigationVehicle,end:Point,level:Level):Point[]|null {
  if(car.kind==='person')return null;
  const radius=Math.max(2,VEHICLES[car.kind].width/2+1);
  const clear=(a:Point,b:Point)=>{
    if(!allowed(a,b,level))return false;
    const count=Math.max(1,Math.ceil(distance(a,b)/3));
    for(let i=1;i<=count;i++){
      const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(!isSurface(x-radius,z-radius)||!isSurface(x-radius,z+radius)||
        !isSurface(x+radius,z-radius)||!isSurface(x+radius,z+radius)||
        nearbyBuildings(x,z,radius).some(building=>building.style==='structure'||building.style==='spaceport'?buildingBlocksPose(building,{x,z,kind:car.kind,y:terrainHeight(x,z)??0,yaw:Math.atan2(a.x-b.x,a.z-b.z),pitch:0,roll:0,supportId:'ground'}):Math.abs(x-building.x)<building.w/2+radius&&Math.abs(z-building.z)<building.d/2+radius))return false;
    }
    return true;
  };
  if(clear(car,end))return [end];
  const reach=distance(car,end)+20;
  const corners=nearbyBuildings(car.x,car.z,reach).flatMap(b=>{
    const margin=radius+3;
    const boxes=b.style==='spaceport'&&b.parts?b.parts.map(part=>{
      const e=primitiveExtent(part),c=Math.abs(Math.cos(e.yaw)),s=Math.abs(Math.sin(e.yaw));
      return {x:b.x+part.x,z:b.z+part.z,w:e.w*c+e.d*s,d:e.w*s+e.d*c};
    }):[b];
    return boxes.flatMap(box=>[-1,1].flatMap(x=>[-1,1].map(z=>({x:box.x+x*(box.w/2+margin),z:box.z+z*(box.d/2+margin)}))));
  }).filter(p=>distance(car,p)<=reach&&distance(end,p)<=reach);
  const points:Point[]=[car,end,...corners],cost=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set<number>();
  cost[0]=0;
  while(visited.size<points.length){
    let at=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(at<0||cost[i]<cost[at]))at=i;
    if(at<0||!Number.isFinite(cost[at]))break;
    if(at===1){const path:Point[]=[];for(let i=at;i>0;i=previous[i])path.unshift(points[i]);return path;}
    visited.add(at);
    for(let i=1;i<points.length;i++){
      const next=cost[at]+distance(points[at],points[i]);
      if(!visited.has(i)&&next<cost[i]&&clear(points[at],points[i])){cost[i]=next;previous[i]=at;}
    }
  }
  return null;
}

/** Find a directed route to the nearest connected lane, respecting progress. */
export function planNavigation(car:NavigationVehicle,destination:Point,level:Level,maxDestinationSnap=100):Navigation|null {
  if(car.kind==='person'||car.supportId!=='ground'||car.inDome||!isSurface(destination.x,destination.z)||requiredLevelAt(destination.x,destination.z)>level)return null;
  const {segments,nodes,edges,nodeIds,segmentNodes}=navigationGraph();
  const candidates=(p:Point,max:number)=>segments.map((s,i)=>({i,...projection(p,s)})).map(c=>({...c,distance:distance(p,c.point)})).filter(c=>c.distance<=max).sort((a,b)=>a.distance-b.distance);
  const starts=candidates(car,150),ends=candidates(destination,maxDestinationSnap);
  if(!starts.length||!ends.length)return null;
  const alignment=(c:typeof starts[number])=>{
    const s=segments[c.i],length=distance(s.a,s.b)||1;
    return (-Math.sin(car.yaw)*(s.b.x-s.a.x)-Math.cos(car.yaw)*(s.b.z-s.a.z))/length;
  };
  const forward=starts.filter(c=>c.distance<=starts[0].distance+7&&alignment(c)>.1);
  const reverseStarts=starts.filter(c=>c.distance<=3&&alignment(c)<-.75);
  const city=car.x>-400&&car.x<650&&car.z>-250&&car.z<250;
  const paved=!city||ROADS.some(road=>{
    const dx=car.x-road.x,dz=car.z-road.z,angle=road.angle??0,c=Math.cos(angle),s=Math.sin(angle);
    return Math.abs(dx*c-dz*s)<=road.w/2&&Math.abs(dx*s+dz*c)<=road.d/2;
  });
  const onRoad=paved&&starts[0].distance<=7&&(forward.length>0||reverseStarts.length>0);
  // If already on a lane facing against it, continue in the direction the
  // car faces only as far as the previous intersection, then use directed
  // streets normally. Avoid inventing an off-road turn to reach that lane.
  const closeStarts=onRoad?(forward.length?forward.map(c=>({...c,reverse:false,approach:[] as Point[]})):
    reverseStarts.map(c=>({...c,reverse:true,approach:[] as Point[]}))).slice(0,12):
    starts.filter(c=>c.distance<=starts[0].distance+35).slice(0,18).flatMap(c=>{
      const approach=offRoadApproach(car,c.point,level);
      return approach?[{...c,reverse:false,approach}]:[];
    });
  if(!closeStarts.length)return null;
  const closeEnds=ends.filter(c=>c.distance<=ends[0].distance+6).slice(0,16);
  const dist=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),origins=new Map<number,typeof closeStarts[number]>(),used=new Set<number>(),queue=new NavigationQueue();
  const ahead=(p:Point)=>(p.x-car.x)*-Math.sin(car.yaw)+(p.z-car.z)*-Math.cos(car.yaw)>=-.5;
  for(const start of closeStarts){
    const heading=alignment(start)*(start.reverse?-1:1);
    const cuts=segmentNodes[start.i];
    const next=start.reverse?[...cuts].reverse().find(c=>c.t<=start.t+1e-7):cuts.find(c=>c.t>=start.t-1e-7);
    if(!next||(start.reverse&&(distance(start.point,nodes[next.id])>120||!ahead(nodes[next.id])))||
      !allowed(car,nodes[next.id],level)||!allowed(start.point,nodes[next.id],level))continue;
    const approachLength=start.approach.reduce((sum,p,i)=>sum+distance(i?start.approach[i-1]:car,p),0);
    const cost=(onRoad?start.distance*2:approachLength)+(1-heading)*8+distance(start.point,nodes[next.id]);
    if(cost<dist[next.id]){dist[next.id]=cost;origins.set(next.id,start);queue.push(next.id,cost);}
  }
  let bestCost=Infinity,bestNode=-1,bestEnd:Point|undefined;
  // Direct travel on a single segment need not pass through an intersection.
  let direct:Point[]|undefined,directStart:typeof closeStarts[number]|undefined;
  for(const start of closeStarts)for(const end of closeEnds)if(start.i===end.i&&(start.reverse?end.t<=start.t&&distance(start.point,end.point)<=120&&ahead(end.point):end.t>=start.t)&&allowed(car,end.point,level)&&allowed(start.point,end.point,level)){
    const approachLength=start.approach.reduce((sum,p,i)=>sum+distance(i?start.approach[i-1]:car,p),0);
    const cost=(onRoad?start.distance*2:approachLength)+distance(start.point,end.point)+end.distance*2;
    if(cost<bestCost){bestCost=cost;bestEnd=end.point;direct=[...start.approach,end.point];directStart=start;}
  }
  while(true){
    const next=queue.pop();if(!next)break;
    const at=next.id;if(used.has(at)||next.cost!==dist[at])continue;
    if(next.cost>bestCost)break;
    used.add(at);
    for(const end of closeEnds){
      const cuts=segmentNodes[end.i],before=[...cuts].reverse().find(c=>c.t<=end.t+1e-7);
      if(before?.id!==at||!allowed(nodes[at],end.point,level))continue;
      const cost=dist[at]+distance(nodes[at],end.point)+end.distance*2;
      if(cost<bestCost){bestCost=cost;bestNode=at;bestEnd=end.point;direct=undefined;directStart=undefined;}
    }
    for(const edge of edges[at])if(allowedEdge(nodes[at],nodes[edge.to],edge,level)){
      const cost=dist[at]+edge.distance;
      if(cost<dist[edge.to]){dist[edge.to]=cost;previous[edge.to]=at;queue.push(edge.to,cost);}
    }
  }
  // A one-way loop can technically connect nearby streets by routing around
  // the entire region. Reject those routes instead of promising a local trip.
  if(!bestEnd||bestCost>Math.max(1200,distance(car,bestEnd)*5))return null;
  const path:Point[]=direct??[];let origin=directStart;
  if(!direct){
    for(let at=bestNode;at!==-1;at=previous[at])path.unshift(nodes[at]);
    origin=origins.get(path.length?nodeIds.get(`${Math.round(path[0].x*100)},${Math.round(path[0].z*100)}`)!:-1);
    if(origin?.approach.length)path.unshift(...origin.approach);
    else if(origin&&distance(car,origin.point)>3)path.unshift(origin.point);
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
    // An off-road join may require a low-speed multi-point manoeuvre to line
    // up with the lane; retain the existing rejection for road-only routes.
    if(!canTurn(turns[i-1],turns[i],turns[i+1])&&(!origin?.approach.length||distance(turns[i],origin.point)>8))return null;
  }
  return {destination:bestEnd,path:clean,index:0,status:'driving',...(origin?.approach.length?{join:origin.point}:{})};
}
