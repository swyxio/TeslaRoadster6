import type { Entity, Input, Player, World } from './game';
import { BUILDINGS, FERRY_DOCKS, LANDMARKS, isRocketIsland, terrainHeight } from './map';
import { PARKING_LOTS } from './parking-lots';
import { hasRockets } from './upgrades';
import { onRoof } from './achievements';
import { initialOta, type OtaSubscription } from './ota';

// Current spendable cash determines level; ownership and awards survive a drop.
export const LEVELS = [
  {level:0,name:'San Francisco',cash:0},
  {level:1,name:'Oakland & Berkeley',cash:10_000},
  {level:2,name:'Peninsula & East Bay',cash:50_000},
  {level:3,name:'San Jose',cash:250_000},
  {level:4,name:'Professional',cash:500_000},
  {level:5,name:'Level 5',cash:1_000_000},
  {level:6,name:'Level 6',cash:2_000_000},
  {level:7,name:'Level 7',cash:4_000_000},
  {level:8,name:'Level 8',cash:8_000_000},
] as const;
export type Level = typeof LEVELS[number]['level'];
export function levelForCash(cash:number):Level {
  let level:Level=0;
  for(const milestone of LEVELS)if(cash>=milestone.cash)level=milestone.level;
  return level;
}
const BASE_FARES=[3_000,4_000,6_000,9_500,11_000,13_000,15_000,20_000,26_000] as const;
// Vertical gates also apply to flyers; the northern island approach remains open.
const SF_PARKING = PARKING_LOTS.find(l=>l.id==='sf-playground')!;
export const ACCESS_BOUNDARIES = { oaklandX:110, islandNorthZ:-650, islandMaxX:430, bayMaxZ:300, sanJoseMinZ:7600 } as const;
export function requiredLevelAt(x:number,z:number):Level {
  // The island and its approach, and the China Basin Dome, are open from the start.
  if(isRocketIsland(x,z))return 0;
  if(z>ACCESS_BOUNDARIES.sanJoseMinZ)return 3;
  if(z>ACCESS_BOUNDARIES.bayMaxZ){
    // Connect the SF playground to the city without opening a route onward.
    const area=SF_PARKING.area;
    if(Math.abs(x-area.x)<=area.width/2&&z<=area.z+area.length/2)return 0;
    return 2;
  }
  // The island and adjacent air remain open; the narrower northern corridor
  // still prevents flying south into locked Oakland.
  if(z<=FERRY_DOCKS.island.z)return 0;
  const islandApproach=z<ACCESS_BOUNDARIES.islandNorthZ&&x<ACCESS_BOUNDARIES.islandMaxX;
  return x>ACCESS_BOUNDARIES.oaklandX&&!islandApproach?1:0;
}

// Real business identities; game positions are artistic, not surveyed locations.
export const RESTAURANTS = [
  { id: 'tartine', name: 'Tartine Bakery', address: '600 Guerrero St, San Francisco', x: -180, z: 120, source: 'https://tartinebakery.com/san-francisco/bakery' },
  { id: 'tonys', name: 'Tony’s Pizza Napoletana', address: '1570 Stockton St, San Francisco', x: -60, z: -180, source: 'https://tonyspizzanapoletana.com/location/' },
  { id: 'burma', name: 'Burma Superstar', address: '309 Clement St, San Francisco', x: -300, z: -120, source: 'https://www.burmasuperstar.com/' },
  { id: 'nanking', name: 'House of Nanking', address: '919 Kearny St, San Francisco', x: 0, z: -120, source: 'https://houseofnanking.net/' },
  { id: 'homeroom', name: 'Homeroom To Go', address: '4007 Webster St, Oakland', x: 390, z: -120, source: 'https://www.homeroom510.com/locations' },
  { id: 'comal', name: 'Comal Next Door', address: '550 Grand Ave, Oakland', x: 510, z: 120, source: 'https://www.comalnextdoor.com/location/comal-next-door-oakland/' },
] as const;

// Customer addresses are fictional and placed on streets in the compressed world.
type Customer = { id:string; name:string; x:number; z:number; y:number; rooftop:boolean };
export const CUSTOMERS: Customer[] = [
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
  CUSTOMERS.push({ id:`landmark-${landmark.id}`, name:`${landmark.name} · Delivery`, ...landmark.arrival, y:0, rooftop:false });
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
  CUSTOMERS.push({ id:`roof-${district}-${x}-${z}`, name, x:building.x, z:building.z, y:building.h, rooftop:true });
}
export type Order = { restaurant: number; customer: number; stage: 'pickup' | 'dropoff'; elapsed: number; pickupEstimate: number; estimate: number; base: number };
export type Ticket = { amount:number; offense:number; flightSeconds:number; peakHeight:number; durationFine:number; heightFine:number; repeatFine:number };
export type DeliveryState = { cash: number; lifetimeIncome:number; ota: OtaSubscription; earned: number; level: Level; lastBlocked: {level:Level; at:number} | null; activeSeconds: number; activeUntil: number; completed: number; order: Order; lastPayout: number | null; lastReroute: {id:number} | null; lastReward: { id: number; kind: 'pickup' | 'delivery' | 'pickup-research' | 'delivery-research' | 'supply-repair' | 'supply-air' | 'research'; amount: number } | null; lastTicket: Ticket | null; tickets: number; ticketGraceUntil: number; flight: { seconds:number; peakHeight:number; lastAirborneAt:number } };

function orderFor(index: number, origin: { x: number; z: number }, level:Level, canFly = false): Order {
  const restaurants = RESTAURANTS.map((place,i)=>({place,i})).filter(({place})=>requiredLevelAt(place.x,place.z)<=level);
  const restaurant = restaurants[index % restaurants.length].i;
  const pickup = RESTAURANTS[restaurant];
  // Every other later order explores the newest unlocked region; intervening
  // local and rooftop jobs keep long highway trips from becoming mandatory.
  const explore = level>0 && index%2===0;
  const rooftop = canFly && level>0 && !explore && index%3===1;
  const available = CUSTOMERS.map((customer,i)=>({customer,i})).filter(({customer})=>
    customer.rooftop===rooftop && requiredLevelAt(customer.x,customer.z)<=level &&
    Math.hypot(customer.x-pickup.x,customer.z-pickup.z)>100);
  // Keep returning to Peninsula/East Bay landmarks after San Jose opens.
  const exploreLevel:Level = level>=3 && index%4===2 ? 2 : Math.min(3,level) as Level;
  const newest = explore ? available.filter(({customer})=>requiredLevelAt(customer.x,customer.z)===exploreLevel) : [];
  const candidates = newest.length ? newest : available;
  const choice = newest.length ? Math.floor(index/2)+1 : Math.floor(index/restaurants.length+index*3);
  const customer = candidates[choice % candidates.length].i;
  const distance = Math.hypot(CUSTOMERS[customer].x - pickup.x, CUSTOMERS[customer].z - pickup.z);
  const pickupDistance = Math.hypot(origin.x - pickup.x, origin.z - pickup.z);
  const jobLevel=level;
  const distanceFactor=Math.max(.5,Math.min(2,distance/700));
  return { restaurant, customer, stage: 'pickup', elapsed: 0, pickupEstimate: Math.max(20, Math.round(pickupDistance / 8 + 15)), estimate: Math.max(30, Math.round(distance / 8 + 18)), base: Math.round(BASE_FARES[jobLevel]*distanceFactor) };
}
export function initialDelivery(origin: { x: number; z: number }): DeliveryState {
  return { cash: 2_500, lifetimeIncome:0, ota:initialOta(), earned:0, level:0, lastBlocked:null, activeSeconds: 0, activeUntil: 0, completed: 0, order: orderFor(0, origin, 0), lastPayout: null, lastReroute:null, lastReward: null, lastTicket: null, tickets: 0, ticketGraceUntil: 0, flight: { seconds:0, peakHeight:0, lastAirborneAt:0 } };
}
export function updateLevel(delivery:DeliveryState):void { delivery.level=levelForCash(delivery.cash); }
export function orderTarget(order: Order): {x:number; z:number; y:number; name:string; rooftop:boolean} {
  return order.stage === 'pickup' ? {...RESTAURANTS[order.restaurant], y:0, rooftop:false} : CUSTOMERS[order.customer];
}
/** Move an active job back into regions available at the new balance. */
export function rerouteInaccessibleOrder(delivery:DeliveryState,origin:{x:number;z:number},canFly=false):boolean {
  const old=delivery.order;
  const pickup=RESTAURANTS[old.restaurant],customer=CUSTOMERS[old.customer];
  if((old.stage!=='pickup'||requiredLevelAt(pickup.x,pickup.z)<=delivery.level) && requiredLevelAt(customer.x,customer.z)<=delivery.level)return false;
  const next=orderFor(delivery.completed,origin,delivery.level,canFly);
  // A collected order stays collected; never grant a second pickup bonus.
  if(old.stage==='dropoff'){next.stage='dropoff';next.elapsed=old.elapsed;next.base=Math.min(old.base,next.base);}
  delivery.order=next;delivery.lastReroute={id:(delivery.lastReroute?.id??0)+1};
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
export function updateDelivery(world: World, player: Player, entity: Entity, input: Input, dt: number, stuntInput = false, orderPaused = false): void {
  const delivery = player.delivery;
  const activeInput = !!(input.throttle || input.steer || input.roll || input.brake || input.hover || input.boost || stuntInput);
  if (activeInput || (entity.autopilot && Math.abs(entity.speed) > .5)) delivery.activeUntil = world.time + 3;
  const active = world.time <= delivery.activeUntil;
  if (active) {
    delivery.activeSeconds += dt;
    if(!orderPaused&&!entity.inDome)delivery.order.elapsed += dt;
  }
  if(orderPaused||entity.inDome)return;
  const target = orderTarget(delivery.order);
  if(entity.vy>.1||Math.abs(entity.speed)>4)return;
  if(target.rooftop){
    if(!entity.supportId?.startsWith('roof:')||!onRoof(entity)||Math.abs(entity.y-target.y)>.05||Math.hypot(entity.x-target.x,entity.z-target.z)>6)return;
  }else{
    const targetHeight=terrainHeight(target.x,target.z);
    if(entity.supportId!=='ground'||targetHeight===null||Math.hypot(entity.x-target.x,entity.y-targetHeight,entity.z-target.z)>9)return;
  }
  if (delivery.order.stage === 'pickup') {
    const bonus = pickupBonusFor(delivery.order);
    if (bonus > 0) reward(delivery, 'pickup', bonus);
    delivery.order.stage = 'dropoff';
    delivery.order.elapsed = 0;
    delivery.lastPayout = null;
  } else {
    const payout = payoutFor(delivery.order);
    if (payout > 0) reward(delivery, 'delivery', payout);
    delivery.lastPayout = payout;
    delivery.completed++;
    updateLevel(delivery);
    delivery.order = orderFor(delivery.completed, entity, delivery.level, hasRockets(entity));
  }
}

function reward(delivery: DeliveryState, kind: 'pickup' | 'delivery', amount: number): void {
  delivery.cash += amount;
  delivery.lifetimeIncome += amount;
  delivery.earned += amount;
  updateLevel(delivery);
  delivery.lastReward = { id: (delivery.lastReward?.id ?? 0) + 1, kind, amount };
}
