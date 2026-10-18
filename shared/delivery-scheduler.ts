import type { Entity } from './game';
import { DELIVERY_DESTINATION_SNAP, nearestNavigationAnchor, planNavigation } from './navigation';
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

// The route planner is also used by self-driving. At a delivery stop the
// driver's heading can vary, so try four cardinal headings and the bearing.
// A small cache amortizes repeated projection/replay of the same accepted stop.
const routeCache=new Map<string,boolean>();
function reachable(from:Point,to:Point,level:Level):boolean {
  const key=`${from.x},${from.z}:${to.x},${to.z}:${level}`;
  const cached=routeCache.get(key);if(cached!==undefined)return cached;
  const vehicle:RouteVehicle={x:from.x,z:from.z,yaw:0,kind:'model-3',supportId:'ground',inDome:false};
  const bearing=Math.atan2(from.x-to.x,from.z-to.z);
  const found=[bearing,0,Math.PI/2,Math.PI,-Math.PI/2].some(yaw=>{
    vehicle.yaw=yaw;
    return !!planNavigation(vehicle,to,level,DELIVERY_DESTINATION_SNAP);
  });
  if(routeCache.size>=1024)routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(key,found);return found;
}

/** Build indexes once; select and validate only when an order is created. */
export function createDeliveryScheduler(restaurants:readonly Place[],customers:readonly Customer[],requiredLevelAt:(x:number,z:number)=>Level) {
  const pickupsNear=spatialIndex(restaurants,requiredLevelAt),dropoffsNear=spatialIndex(customers,requiredLevelAt);
  return (completed:number,origin:Origin,level:Level,canFly:boolean,previous?:Order):Choice|null=>{
    const anchor=nearestNavigationAnchor(origin,level);if(!anchor)return null;
    // A driver on a roof or parked off-network may manually approach this
    // road; it is only an assignment anchor, never a claim of autopilot access.
    const from=((origin.supportId!==undefined&&origin.supportId!=='ground')||
      (!!previous&&customers[previous.customer]?.rooftop)||anchor.distance>7)?anchor.point:origin;
    const explore=level>0&&completed%2===0;
    const preferRooftop=canFly&&level>0&&!explore&&completed%3===1;
    const newest=Math.min(level,6);
    const originLevel=requiredLevelAt(origin.x,origin.z);
    const recentArea=previous?customers[previous.customer]?.areaId:undefined;
    // If spending relocked the current location, the nearest open pickup may
    // be farther away; navigation still only permits an exit toward open land.
    const relocked=requiredLevelAt(origin.x,origin.z)>level;
    // For an off-network origin, locality is measured from its road anchor.
    // The player still has to reach that road, for example by taking the ferry.
    const searchRadius=relocked?16_000:DELIVERY_MAX_PICKUP_DISTANCE;
    const pickupRadius=relocked?16_000:anchor.distance>7?anchor.distance+searchRadius:searchRadius;
    const pickups=pickupsNear(from,searchRadius,level).filter(p=>distance(origin,p)<=pickupRadius)
      .sort((a,b)=>distance(from,a)-distance(from,b)||a.index-b.index);
    type Pair={pickup:Indexed<Place>;dropoff:Indexed<Customer>;score:number;exploreRank:number;repeat:boolean};
    const pairs:Pair[]=[];
    for(const pickup of pickups){
      for(const dropoff of dropoffsNear(pickup,DELIVERY_MAX_TRIP_DISTANCE,level)){
        if(dropoff.rooftop&&!preferRooftop)continue;
        const trip=distance(pickup,dropoff);if(trip<60)continue;
        // Seeded variation is deterministic across room and durable replays.
        const variation=((completed*97+pickup.index*37+dropoff.index*61)%101)/101;
        // Encourage nearby neighboring areas without placing every cross-bay
        // candidate ahead of a short local job. A forced area change can
        // otherwise require hundreds of failed road plans in one room tick.
        const nearbyAreaBonus=explore&&newest<=originLevel&&recentArea&&dropoff.areaId&&recentArea!==dropoff.areaId ? .2 : 0;
        const score=distance(from,pickup)/700+trip/1800+variation*.3-nearbyAreaBonus;
        // If the latest tier is not within reach yet, move outward one tier at
        // a time instead of repeatedly choosing the same SF neighborhood.
        const exploreRank=newest>originLevel?
          dropoff.level===newest?0:dropoff.level>originLevel?dropoff.level-originLevel:20:0;
        pairs.push({pickup,dropoff,score,exploreRank,
          repeat:pickup.index===previous?.restaurant||dropoff.index===previous?.customer});
      }
    }
    pairs.sort((a,b)=>Number(a.repeat)-Number(b.repeat)||(explore?a.exploreRank-b.exploreRank:0)||
      (preferRooftop?Number(b.dropoff.rooftop)-Number(a.dropoff.rooftop):0)||
      a.score-b.score||a.pickup.index-b.pickup.index||a.dropoff.index-b.dropoff.index);
    // Check all ranked candidates rather than accepting a visually nearby but
    // disconnected street. Every offered ground leg has a navigation route.
    for(const pair of pairs){
      if(!reachable(from,pair.pickup,level))continue;
      if(!pair.dropoff.rooftop&&!reachable(pair.pickup,pair.dropoff,level))continue;
      return {restaurant:pair.pickup.index,customer:pair.dropoff.index};
    }
    return null;
  };
}
