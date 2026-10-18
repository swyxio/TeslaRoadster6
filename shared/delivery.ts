import type { Entity, Input, Player, World } from './game';
import { BUILDINGS, LANDMARKS, isRocketIsland, terrainHeight } from './map';
import { requiredAccessLevelAt } from './service-areas';
export { ACCESS_BOUNDARIES } from './service-areas';
import { hasRockets } from './upgrades';
import { initialOta, type OtaSubscription } from './ota';
import { dropoffPayouts, pickupPayout, resolveDeliveryPayout, type DeliveryPayoutResolver, type ResolvedDeliveryPayout } from './delivery-payout';
import { createDeliveryScheduler } from './delivery-scheduler';
import { ADDED_CUSTOMERS, ADDED_RESTAURANTS, HISTORIC_CUSTOMER_AREAS, HISTORIC_RESTAURANT_DETAILS, type DeliveryAreaId, type DeliveryCityId } from './delivery-locations';

// Current spendable cash determines level; ownership and awards survive a drop.
export const LEVELS = [
  {level:0,name:'San Francisco',cash:0},
  {level:1,name:'Oakland, Berkeley & Emeryville',cash:10_000},
  {level:2,name:'South SF & SFO',cash:50_000},
  {level:3,name:'San Mateo & Redwood City',cash:250_000},
  {level:4,name:'Palo Alto & Menlo Park',cash:500_000},
  {level:5,name:'Mountain View, Santa Clara, Hayward & Fremont',cash:1_000_000},
  {level:6,name:'San Jose & Cupertino',cash:2_000_000},
  {level:7,name:'Level 7',cash:4_000_000},
  {level:8,name:'Level 8',cash:8_000_000},
] as const;
export type Level = typeof LEVELS[number]['level'];
export function levelForCash(cash:number):Level {
  let level:Level=0;
  for(const milestone of LEVELS)if(cash>=milestone.cash)level=milestone.level;
  return level;
}
const BASE_FARES=[1_200,1_600,2_500,4_000,5_500,7_000,9_000,12_000,16_000] as const;
export const requiredLevelAt = requiredAccessLevelAt;

// Real business identities; game positions are artistic, not surveyed locations.
const HISTORIC_RESTAURANTS = [
  { id: 'tartine', name: 'Tartine Bakery', address: '600 Guerrero St, San Francisco', x: -180, z: 120, source: 'https://tartinebakery.com/san-francisco/bakery' },
  { id: 'tonys', name: 'Tony’s Pizza Napoletana', address: '1570 Stockton St, San Francisco', x: -60, z: -180, source: 'https://tonyspizzanapoletana.com/location/' },
  { id: 'burma', name: 'Burma Superstar', address: '309 Clement St, San Francisco', x: -300, z: -120, source: 'https://www.burmasuperstar.com/' },
  { id: 'nanking', name: 'House of Nanking', address: '919 Kearny St, San Francisco', x: 0, z: -120, source: 'https://houseofnanking.net/' },
  { id: 'homeroom', name: 'Homeroom To Go', address: '4007 Webster St, Oakland', x: 390, z: -120, source: 'https://www.homeroom510.com/locations' },
  { id: 'comal', name: 'Comal Next Door', address: '550 Grand Ave, Oakland', x: 510, z: 120, source: 'https://www.comalnextdoor.com/location/comal-next-door-oakland/' },
] as const;
// Append to the original array: durable orders use numeric indices.
export const RESTAURANTS = [
  ...HISTORIC_RESTAURANTS.map(place=>({...place,...HISTORIC_RESTAURANT_DETAILS[place.id]})),
  ...ADDED_RESTAURANTS,
];

// Customer addresses are fictional and placed on streets in the compressed world.
type CustomerPosition = { id:string; name:string; x:number; z:number; y:number; rooftop:boolean };
type Customer = CustomerPosition & {cityId:DeliveryCityId;areaId:DeliveryAreaId};
const historicCustomers: CustomerPosition[] = [
  { id: 'poly', name: '88 Poly Ave · SF', x: -120, z: 60, y: 0, rooftop: false },
  { id: 'fog', name: '12 Foggy Lane · SF', x: -240, z: 180, y: 0, rooftop: false },
  { id: 'cable', name: '45 Cable Court · SF', x: 0, z: -180, y: 0, rooftop: false },
  { id: 'coast', name: '19 Sunset Steps · SF', x: -300, z: 0, y: 0, rooftop: false },
  { id: 'oak', name: '77 Oak Walk · Oakland', x: 450, z: 0, y: 0, rooftop: false },
  { id: 'lake', name: '34 Lake Lane · Oakland', x: 510, z: -180, y: 0, rooftop: false },
  { id: 'port', name: '8 Port Place · Oakland', x: 330, z: 120, y: 0, rooftop: false },
];
// Landmark drop-offs use the same clear arrival coordinates as the shared map.
for (const landmark of LANDMARKS) {
  historicCustomers.push({ id:`landmark-${landmark.id}`, name:`${landmark.name} · Delivery`, ...landmark.arrival, y:0, rooftop:false });
}
// Pick flat, physically supported rooftops from the shared map rather than inventing altitudes.
for (const {x,z,district,name} of [
  {x:-78,z:-90,district:'sf',name:'Skyline Terrace · SF'},
  {x:42,z:150,district:'sf',name:'Bayview Rooftop · SF'},
  {x:350,z:-30,district:'oakland',name:'Oakland Sky Deck'},
] as const) {
  const building = BUILDINGS.filter(b=>b.district===district&&b.style==='midrise'&&b.w>=15&&b.d>=20&&b.h<=30)
    .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
  if (!building) throw new Error(`No flat rooftop in ${district}`);
  historicCustomers.push({ id:`roof-${district}-${x}-${z}`, name, x:building.x, z:building.z, y:building.h, rooftop:true });
}
export const CUSTOMERS: Customer[] = [
  ...historicCustomers.map(place=>{
    const area=HISTORIC_CUSTOMER_AREAS[place.id as keyof typeof HISTORIC_CUSTOMER_AREAS];
    if(!area)throw new Error(`No delivery area for historic customer ${place.id}`);
    return {...place,...area};
  }),
  ...ADDED_CUSTOMERS,
];
export type Order = { restaurant: number; customer: number; stage: 'pickup' | 'dropoff'; elapsed: number; pickupEstimate: number; estimate: number; base: number };
export type Ticket = { amount:number; offense:number; flightSeconds:number; peakHeight:number; durationFine:number; heightFine:number; repeatFine:number };
export type DeliveryReward = { id:number; kind:'pickup'|'delivery'|'pickup-research'|'delivery-research'|'supply-repair'|'supply-air'|'research'; amount:number };
export type DeliveryState = { cash: number; lifetimeIncome:number; ota: OtaSubscription; earned: number; level: Level; lastBlocked: {level:Level; at:number} | null; activeSeconds: number; activeUntil: number; completed: number; order: Order; lastPayout: number | null; lastReroute: {id:number;reason?:'repeat'|'ferry'|'unavailable'} | null; lastReward: DeliveryReward | null; lastTicket: Ticket | null; tickets: number; ticketGraceUntil: number; flight: { seconds:number; peakHeight:number; lastAirborneAt:number } };

/** Immutable physical facts needed to evaluate a delivery stop against an order. */
type DeliveryPose = Pick<Entity,'x'|'y'|'z'|'vy'|'speed'|'supportId'|'kind'>;
export type DeliveryStop = DeliveryPose & {canFly:boolean};
export function captureDeliveryStop(entity:Entity):DeliveryStop {
  const {x,y,z,vy,speed,supportId,kind}=entity;
  return {x,y,z,vy,speed,supportId,kind,canFly:hasRockets(entity)};
}
function matchesTarget(stop:DeliveryPose,target:{x:number;y?:number;z:number;rooftop?:boolean}):boolean {
  if(stop.vy>.1||Math.abs(stop.speed)>4)return false;
  if(target.rooftop){
    return stop.kind!=='person'&&stop.supportId?.startsWith('roof:')===true&&
      Math.abs(stop.y-target.y!)<=.05&&Math.hypot(stop.x-target.x,stop.z-target.z)<=6;
  }
  if(stop.supportId!=='ground'||Math.abs(stop.x-target.x)>9||Math.abs(stop.z-target.z)>9)return false;
  const targetHeight=terrainHeight(target.x,target.z);
  return targetHeight!==null&&Math.hypot(stop.x-target.x,stop.y-targetHeight,stop.z-target.z)<=9;
}
export function matchesDeliveryStop(order:Order,stop:DeliveryPose):boolean {return matchesTarget(stop,orderTarget(order));}

// Delivery evidence is sampled on every simulation tick. Index target centers
// once so a large venue catalog only checks stops within the marker radius.
const DELIVERY_CELL = 24;
function targetIndex(targets:readonly {x:number;z:number}[]):Map<string,number[]> {
  const cells=new Map<string,number[]>();
  targets.forEach((target,index)=>{
    const key=`${Math.floor(target.x/DELIVERY_CELL)},${Math.floor(target.z/DELIVERY_CELL)}`;
    const cell=cells.get(key);if(cell)cell.push(index);else cells.set(key,[index]);
  });
  return cells;
}
const restaurantCells=targetIndex(RESTAURANTS),customerCells=targetIndex(CUSTOMERS);
function nearbyTargets(cells:Map<string,number[]>,stop:DeliveryPose):number[] {
  const matches:number[]=[];
  for(let x=Math.floor((stop.x-9)/DELIVERY_CELL);x<=Math.floor((stop.x+9)/DELIVERY_CELL);x++)
    for(let z=Math.floor((stop.z-9)/DELIVERY_CELL);z<=Math.floor((stop.z+9)/DELIVERY_CELL);z++)
      matches.push(...(cells.get(`${x},${z}`)??[]));
  // Preserve the original catalog ordering: the signature is also a stop key.
  return matches.sort((a,b)=>a-b);
}
/** Qualifying targets are independent of the currently projected order. */
export function deliveryStopSignature(stop:DeliveryPose):string {
  if(stop.vy>.1||Math.abs(stop.speed)>4)return '';
  const matches:string[]=[];
  for(const i of nearbyTargets(restaurantCells,stop))if(matchesTarget(stop,RESTAURANTS[i]))matches.push(`r${i}`);
  for(const i of nearbyTargets(customerCells,stop))if(matchesTarget(stop,CUSTOMERS[i]))matches.push(`c${i}`);
  return matches.join(',');
}

let chooseDelivery:ReturnType<typeof createDeliveryScheduler>|undefined;
function quotedOrder(restaurant:number,customer:number,origin:{x:number;z:number},level:Level):Order {
  const pickup=RESTAURANTS[restaurant];
  const distance = Math.hypot(CUSTOMERS[customer].x - pickup.x, CUSTOMERS[customer].z - pickup.z);
  const pickupDistance = Math.hypot(origin.x - pickup.x, origin.z - pickup.z);
  const distanceFactor=Math.max(.5,Math.min(2,distance/700));
  return { restaurant, customer, stage: 'pickup', elapsed: 0, pickupEstimate: Math.max(20, Math.round(pickupDistance / 8 + 15)), estimate: Math.max(30, Math.round(distance / 8 + 18)), base: Math.round(BASE_FARES[level]*distanceFactor) };
}
function orderFor(index:number,origin:{x:number;z:number;supportId?:Entity['supportId']},level:Level,canFly=false,previous?:Order):Order|null {
  chooseDelivery??=createDeliveryScheduler(RESTAURANTS,CUSTOMERS,requiredLevelAt);
  const choice=chooseDelivery(index,origin,level,canFly,previous);
  return choice?quotedOrder(choice.restaurant,choice.customer,origin,level):null;
}
export function initialDelivery(origin: { x: number; z: number }): DeliveryState {
  // Stable, road-connected first job. Profile reconstruction also calls this
  // factory before replacing its order, so do not route-plan in the factory.
  return { cash: 2_500, lifetimeIncome:0, ota:initialOta(), earned:0, level:0, lastBlocked:null, activeSeconds: 0, activeUntil: 0, completed: 0, order: quotedOrder(0,2,origin,0), lastPayout: null, lastReroute:null, lastReward: null, lastTicket: null, tickets: 0, ticketGraceUntil: 0, flight: { seconds:0, peakHeight:0, lastAirborneAt:0 } };
}
export function updateLevel(delivery:DeliveryState):void { delivery.level=levelForCash(delivery.cash); }
export function orderTarget(order: Order): {x:number; z:number; y:number; name:string; rooftop:boolean} {
  return order.stage === 'pickup' ? {...RESTAURANTS[order.restaurant], y:0, rooftop:false} : CUSTOMERS[order.customer];
}
export function isOrderAccessible(order:Order,level:Level):boolean {
  const pickup=RESTAURANTS[order.restaurant],customer=CUSTOMERS[order.customer];
  return (order.stage!=='pickup'||requiredLevelAt(pickup.x,pickup.z)<=level) && requiredLevelAt(customer.x,customer.z)<=level;
}
/** Move an active job back into regions available at the new balance.
 * Returns true if the order or its availability notice changed. */
export function rerouteInaccessibleOrder(delivery:DeliveryState,origin:{x:number;z:number;supportId?:Entity['supportId']},canFly=false):boolean {
  const old=delivery.order;
  if(isOrderAccessible(old,delivery.level))return false;
  const next=orderFor(delivery.completed,origin,delivery.level,canFly,old);
  if(!next){
    if(delivery.lastReroute?.reason==='unavailable')return false;
    delivery.lastReroute={id:(delivery.lastReroute?.id??0)+1,reason:'unavailable'};
    return true;
  }
  // A collected order stays collected; never grant a second pickup bonus.
  if(old.stage==='dropoff'){next.stage='dropoff';next.elapsed=old.elapsed;next.base=Math.min(old.base,next.base);}
  delivery.order=next;delivery.lastReroute={id:(delivery.lastReroute?.id??0)+1,
    ...(isRocketIsland(origin.x,origin.z)||origin.supportId==='ferry'?{reason:'ferry' as const}:{})};
  return true;
}
export function pickupBonusFor(order: Order): number {
  return Math.round(order.base * .4 * Math.max(0, 1 - order.elapsed / order.pickupEstimate));
}
export function payoutFor(order: Order): number {
  const difference = order.estimate - order.elapsed;
  const bonus = difference > 0 ? Math.round(order.base * .75 * Math.min(1, difference / order.estimate)) : 0;
  const latePenalty = difference < 0 ? Math.round(order.base * Math.min(1, -difference / (order.estimate * 1.5))) : 0;
  return Math.max(0, order.base + bonus - latePenalty);
}
export function updateDelivery(world: World, player: Player, entity: Entity, input: Input, dt: number, stuntInput = false, orderPaused = false, resolvePayout?:DeliveryPayoutResolver): ResolvedDeliveryPayout[] | null | undefined {
  const delivery = player.delivery;
  const elapsedBefore=delivery.order.elapsed;
  const activeInput = !!(input.throttle || input.steer || input.roll || input.brake || input.hover || input.boost || stuntInput);
  if (activeInput || (entity.autopilot && Math.abs(entity.speed) > .5)) delivery.activeUntil = world.time + 3;
  const active = world.time <= delivery.activeUntil;
  const unavailable=delivery.lastReroute?.reason==='unavailable'&&!isOrderAccessible(delivery.order,delivery.level);
  if (active) {
    delivery.activeSeconds += dt;
    if(!orderPaused&&!entity.inDome&&!unavailable)delivery.order.elapsed += dt;
  }
  if(orderPaused||entity.inDome||unavailable)return;
  const payouts=applyDeliveryStop(delivery,entity,resolvePayout);
  if(payouts===null)delivery.order.elapsed=elapsedBefore;
  return payouts;
}

/** Apply a physical stop to the current order, which may differ from the observed draft. */
export function applyDeliveryStop(delivery:DeliveryState,stop:DeliveryStop|Entity,resolvePayout?:DeliveryPayoutResolver):ResolvedDeliveryPayout[]|null|undefined {
  if(!matchesDeliveryStop(delivery.order,stop))return;
  if (delivery.order.stage === 'pickup') {
    const component=pickupPayout(delivery.completed+1,pickupBonusFor(delivery.order));
    const bonus=resolveDeliveryPayout(component,resolvePayout);
    if(bonus===null)return null;
    if (bonus > 0) reward(delivery, 'pickup', bonus);
    delivery.order.stage = 'dropoff';
    delivery.order.elapsed = 0;
    delivery.lastPayout = null;
    return [{component,amount:bonus}];
  } else {
    const components=dropoffPayouts(delivery.completed+1,payoutFor(delivery.order));
    const fare=resolveDeliveryPayout(components[0],resolvePayout);
    if(fare===null)return null;
    const parts:ResolvedDeliveryPayout[]=[{component:components[0],amount:fare}];
    if(components[1])parts.push({component:components[1],amount:components[1].amount});
    const payout=parts[0].amount,checkpoint=parts[1]?.amount??0;
    if (payout > 0) reward(delivery, 'delivery', payout);
    if(checkpoint){
      delivery.cash+=checkpoint;delivery.lifetimeIncome+=checkpoint;
      const previous=delivery.lastReward;
      delivery.lastReward={id:payout>0?previous!.id:(previous?.id??0)+1,kind:'delivery-research',amount:payout+checkpoint};
    }
    delivery.lastPayout = payout;
    delivery.completed++;
    updateLevel(delivery);
    const previous=delivery.order;
    const next=orderFor(delivery.completed,stop,delivery.level,'canFly' in stop?stop.canFly:hasRockets(stop),previous);
    if(next)delivery.order=next;
    else {
      // The completed pair is known to be playable. Keep the driver earning
      // and explain the exceptional repeat instead of inventing an unsafe job.
      delivery.order=quotedOrder(previous.restaurant,previous.customer,stop,delivery.level);
      delivery.lastReroute={id:(delivery.lastReroute?.id??0)+1,reason:'repeat'};
    }
    return parts;
  }
}

function reward(delivery: DeliveryState, kind: 'pickup' | 'delivery', amount: number): void {
  delivery.cash += amount;
  delivery.lifetimeIncome += amount;
  delivery.earned += amount;
  updateLevel(delivery);
  delivery.lastReward = { id: (delivery.lastReward?.id ?? 0) + 1, kind, amount };
}
