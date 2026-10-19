import type { Entity } from './game';
import { canApproachDeliveryDestination, DELIVERY_DESTINATION_SNAP, nearestNavigationAnchor, planNavigation } from './navigation';
import { isRocketIsland } from './map';
import type { Level, Order } from './delivery';

type Place={id:string;x:number;z:number;areaId?:string};
type Customer=Place&{rooftop:boolean};
type Point={x:number;z:number};
type Origin=Point&{supportId?:Entity['supportId']};
type Indexed<T>=T&{index:number;level:Level};
type Choice={restaurant:number;customer:number};
type RouteVehicle=Pick<Entity,'x'|'z'|'yaw'|'kind'|'supportId'|'inDome'>;

const CELL=400;
export const DELIVERY_MAX_PICKUP_DISTANCE=1800;
export const DELIVERY_MAX_TRIP_DISTANCE=2200;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);

function spatialIndex<T extends Place>(items:readonly T[],requiredLevelAt:(x:number,z:number)=>Level) {
  const cells=new Map<string,Indexed<T>[]>();
  items.forEach((item,index)=>{
    const entry={...item,index,level:requiredLevelAt(item.x,item.z)};
    const key=`${Math.floor(item.x/CELL)},${Math.floor(item.z/CELL)}`;
    const cell=cells.get(key);if(cell)cell.push(entry);else cells.set(key,[entry]);
  });
  return (origin:Point,radius:number,level:Level):Indexed<T>[]=>{
    const results:Indexed<T>[]=[];
    for(let x=Math.floor((origin.x-radius)/CELL);x<=Math.floor((origin.x+radius)/CELL);x++)
      for(let z=Math.floor((origin.z-radius)/CELL);z<=Math.floor((origin.z+radius)/CELL);z++)
        for(const item of cells.get(`${x},${z}`)??[])if(item.level<=level&&distance(item,origin)<=radius)results.push(item);
    return results;
  };
}

// Candidate enumeration and route probes are separately bounded. A durable
// cursor can restart preparation after eviction without changing its result.
export const DELIVERY_SEARCH_CANDIDATES_PER_STEP=512;
export const DELIVERY_SEARCH_PLANS_PER_STEP=2;
export const DELIVERY_SEARCH_PAIRS_PER_STEP=16;
// Bump when candidate ordering or route eligibility changes. An unfinished
// durable checkpoint must not apply an old rank to a different pair.
export const DELIVERY_SEARCH_VERSION=1;
export type DeliverySearchCursor={pair:number;leg:0|1;heading:number;version?:number};
type SearchStep={status:'found';choice:Choice;plans:number;pairs:number;scans:number}|{status:'pending';cursor:DeliverySearchCursor;plans:number;pairs:number;scans:number}|{status:'none';plans:number;pairs:number;scans:number};
type Previous=Pick<Order,'restaurant'|'customer'>;
type Prepared={
  from:Point;offRoadOrigin:boolean;pickups:Indexed<Place>[];pickup:number;dropoff:number;
  heap:number[];ordered:number[];scores:Float64Array;ready:boolean;
  compare:(a:number,b:number)=>number;
};
const routeCache=new Map<string,boolean>(),approachCache=new Map<string,boolean>();
function remember(cache:Map<string,boolean>,key:string,value:boolean):void {
  if(cache.size>=4096)cache.delete(cache.keys().next().value!);
  cache.set(key,value);
}

function heapPush(heap:number[],value:number,compare:(a:number,b:number)=>number):void {
  let i=heap.length;heap.push(value);
  while(i>0){const parent=(i-1)>>1;if(compare(value,heap[parent])>=0)break;heap[i]=heap[parent];i=parent;}
  heap[i]=value;
}
function heapPop(heap:number[],compare:(a:number,b:number)=>number):number|undefined {
  const first=heap[0],last=heap.pop();if(first===undefined||last===undefined||!heap.length)return first;
  let i=0;
  while(true){const left=i*2+1;if(left>=heap.length)break;const right=left+1,child=right<heap.length&&compare(heap[right],heap[left])<0?right:left;
    if(compare(heap[child],last)>=0)break;heap[i]=heap[child];i=child;}
  heap[i]=last;return first;
}

/** Build static indexes once. All candidate and route work is resumable. */
export function createDeliveryScheduler(restaurants:readonly Place[],customers:readonly Customer[],requiredLevelAt:(x:number,z:number)=>Level) {
  const pickupsNear=spatialIndex(restaurants,requiredLevelAt),dropoffsNear=spatialIndex(customers,requiredLevelAt);
  const dropoffLevels=customers.map(p=>requiredLevelAt(p.x,p.z));
  const nearby=new Map<string,Indexed<Customer>[]>();
  const prepared=new Map<string,Prepared|null>();
  function rememberPrepared(key:string,value:Prepared|null):void {
    if(prepared.size>=128)prepared.delete(prepared.keys().next().value!);
    prepared.set(key,value);
  }
  function candidates(completed:number,origin:Origin,level:Level,roofEligible:boolean,previous?:Previous):Prepared|null {
    const key=JSON.stringify([completed,origin.x,origin.z,origin.supportId,level,roofEligible,previous?.restaurant,previous?.customer]);
    if(prepared.has(key))return prepared.get(key)!;
    const anchor=nearestNavigationAnchor(origin,level);
    if(!anchor){rememberPrepared(key,null);return null;}
    // Check the real ground join when it is within the planner's range.
    // Roof, ferry, playground and distant origins still use a road anchor:
    // the driver must first reach the road, for example by taking the ferry.
    const anchored=(origin.supportId!==undefined&&origin.supportId!=='ground')||
      (origin.supportId===undefined&&!!previous&&customers[previous.customer]?.rooftop)||
      isRocketIsland(origin.x,origin.z)||anchor.distance>150;
    const from=anchored?anchor.point:origin,offRoadOrigin=!anchored&&anchor.distance>7;
    const explore=level>0&&completed%2===0;
    const preferRooftop=roofEligible&&level>0&&!explore&&completed%3===1;
    const newest=Math.min(level,6),originLevel=requiredLevelAt(origin.x,origin.z);
    const recentArea=previous?customers[previous.customer]?.areaId:undefined;
    const relocked=originLevel>level;
    const searchRadius=relocked?16_000:DELIVERY_MAX_PICKUP_DISTANCE;
    const pickupRadius=relocked?16_000:anchor.distance>7?anchor.distance+searchRadius:searchRadius;
    const pickups=pickupsNear(from,searchRadius,level).filter(p=>distance(origin,p)<=pickupRadius);
    const scores=new Float64Array(restaurants.length*customers.length);
    const unpack=(id:number):[number,number]=>[Math.floor(id/customers.length),id%customers.length];
    const rank=(id:number)=>{
      const [pickup,dropoff]=unpack(id),required=dropoffLevels[dropoff];
      return {repeat:pickup===previous?.restaurant||dropoff===previous?.customer,
        exploreRank:newest>originLevel?(required===newest?0:required>originLevel?required-originLevel:20):0,
        rooftop:customers[dropoff].rooftop};
    };
    const compare=(a:number,b:number)=>{
      const left=rank(a),right=rank(b);
      return Number(left.repeat)-Number(right.repeat)||(explore?left.exploreRank-right.exploreRank:0)||
        (preferRooftop?Number(right.rooftop)-Number(left.rooftop):0)||scores[a]-scores[b]||a-b;
    };
    const result:Prepared={from,offRoadOrigin,pickups,pickup:0,dropoff:0,heap:[],ordered:[],scores,ready:false,compare};
    rememberPrepared(key,result);return result;
  }
  function advance(completed:number,origin:Origin,level:Level,roofEligible:boolean,previous:Previous|undefined,
    cursor:DeliverySearchCursor={pair:0,leg:0,heading:0}):SearchStep {
    const work=candidates(completed,origin,level,roofEligible,previous);
    if(!work)return {status:'none',plans:0,pairs:0,scans:0};
    const next=cursor.version===DELIVERY_SEARCH_VERSION?{...cursor}:{pair:0,leg:0 as const,heading:0,version:DELIVERY_SEARCH_VERSION};
    let plans=0,pairs=0,scans=0;
    const explore=level>0&&completed%2===0;
    const preferRooftop=roofEligible&&level>0&&!explore&&completed%3===1;
    const originLevel=requiredLevelAt(origin.x,origin.z),newest=Math.min(level,6);
    const recentArea=previous?customers[previous.customer]?.areaId:undefined;
    while(!work.ready&&scans<DELIVERY_SEARCH_CANDIDATES_PER_STEP){
      if(work.pickup>=work.pickups.length){work.ready=true;break;}
      const pickup=work.pickups[work.pickup],nearbyKey=`${pickup.index}:${level}`;
      let dropoffs=nearby.get(nearbyKey);
      if(!dropoffs){dropoffs=dropoffsNear(pickup,DELIVERY_MAX_TRIP_DISTANCE,level);nearby.set(nearbyKey,dropoffs);}
      if(work.dropoff>=dropoffs.length){work.pickup++;work.dropoff=0;continue;}
      const dropoff=dropoffs[work.dropoff++];scans++;
      if(dropoff.rooftop&&!preferRooftop)continue;
      const trip=distance(pickup,dropoff);if(trip<60)continue;
      const variation=((completed*97+pickup.index*37+dropoff.index*61)%101)/101;
      const bonus=explore&&newest<=originLevel&&recentArea&&dropoff.areaId&&recentArea!==dropoff.areaId? .2 : 0;
      const id=pickup.index*customers.length+dropoff.index;
      work.scores[id]=distance(work.from,pickup)/700+trip/1800+variation*.3-bonus;
      heapPush(work.heap,id,work.compare);
    }
    if(!work.ready)return {status:'pending',cursor:next,plans,pairs,scans};
    // Materialize only the ranked prefix that this cursor needs. If a job was
    // evicted, rebuilding that prefix also advances under the same pair cap.
    while(work.ordered.length<next.pair+DELIVERY_SEARCH_PAIRS_PER_STEP&&work.heap.length&&pairs<DELIVERY_SEARCH_PAIRS_PER_STEP){
      work.ordered.push(heapPop(work.heap,work.compare)!);pairs++;
    }
    if(work.ordered.length<=next.pair&&work.heap.length)return {status:'pending',cursor:next,plans,pairs,scans};
    pairs=0;
    while(next.pair<work.ordered.length&&pairs<DELIVERY_SEARCH_PAIRS_PER_STEP){
      const id=work.ordered[next.pair],pickup=restaurants[Math.floor(id/customers.length)],dropoff=customers[id%customers.length];pairs++;
      if(next.leg===1&&dropoff.rooftop)return {status:'found',choice:{restaurant:Math.floor(id/customers.length),customer:id%customers.length},plans,pairs,scans};
      const from=next.leg===0?work.from:pickup,to=next.leg===0?pickup:dropoff;
      const key=`${from.x},${from.z}:${to.x},${to.z}:${level}`;
      let reachable=routeCache.get(key);
      if(reachable===undefined){
        const approachKey=`${to.x},${to.z}:${level}`;
        let canApproach=approachCache.get(approachKey);
        if(canApproach===undefined){canApproach=canApproachDeliveryDestination(to,level);remember(approachCache,approachKey,canApproach);}
        if(!canApproach){reachable=false;remember(routeCache,key,false);}
        else {
          if(plans>=DELIVERY_SEARCH_PLANS_PER_STEP)return {status:'pending',cursor:next,plans,pairs,scans};
          const bearing=Math.atan2(from.x-to.x,from.z-to.z);
          const yaw=[bearing,0,Math.PI/2,Math.PI,-Math.PI/2][next.heading];
          const vehicle:RouteVehicle={x:from.x,z:from.z,yaw,kind:'model-3',supportId:'ground',inDome:false};
          reachable=!!planNavigation(vehicle,to,level,DELIVERY_DESTINATION_SNAP,true);plans++;
          if(reachable||next.heading===4||(next.leg===0&&work.offRoadOrigin))remember(routeCache,key,reachable);
          else {next.heading++;continue;}
        }
      }
      next.heading=0;
      if(!reachable){next.pair++;next.leg=0;continue;}
      if(next.leg===0){next.leg=1;continue;}
      return {status:'found',choice:{restaurant:Math.floor(id/customers.length),customer:id%customers.length},plans,pairs,scans};
    }
    if(next.pair===work.ordered.length&&!work.heap.length)return {status:'none',plans,pairs,scans};
    return {status:'pending',cursor:next,plans,pairs,scans};
  }
  // Offline verification may exhaust a search; gameplay resumes bounded steps.
  function choose(completed:number,origin:Origin,level:Level,roofEligible:boolean,previous?:Previous):Choice|null {
    let cursor:DeliverySearchCursor={pair:0,leg:0,heading:0};
    for(;;){const step=advance(completed,origin,level,roofEligible,previous,cursor);
      if(step.status==='found')return step.choice;if(step.status==='none')return null;cursor=step.cursor;}
  }
  choose.advance=advance;
  return choose;
}
