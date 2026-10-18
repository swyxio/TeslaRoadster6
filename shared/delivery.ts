import type { Entity, Input, Player, World } from './game';
import { BUILDINGS, terrainHeight } from './map';
import { hasRockets } from './upgrades';
import { onRoof } from './achievements';

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
export type DeliveryState = { cash: number; activeSeconds: number; activeUntil: number; completed: number; order: Order; lastPayout: number | null; lastReward: { id: number; kind: 'pickup' | 'delivery'; amount: number } | null; lastTicket: Ticket | null; tickets: number; ticketGraceUntil: number; flight: { seconds:number; peakHeight:number; lastAirborneAt:number } };

function orderFor(index: number, origin: { x: number; z: number }, canFly = false): Order {
  const restaurant = index % RESTAURANTS.length;
  // Never choose a destination beside the pickup.
  const candidates = CUSTOMERS.map((customer, i) => ({ customer, i })).filter(({ customer }) => customer.rooftop === (canFly && index % 3 === 1) && Math.hypot(customer.x - RESTAURANTS[restaurant].x, customer.z - RESTAURANTS[restaurant].z) > 100);
  const customer = candidates[Math.floor(index / RESTAURANTS.length + index * 3) % candidates.length].i;
  const distance = Math.hypot(CUSTOMERS[customer].x - RESTAURANTS[restaurant].x, CUSTOMERS[customer].z - RESTAURANTS[restaurant].z);
  const pickupDistance = Math.hypot(origin.x - RESTAURANTS[restaurant].x, origin.z - RESTAURANTS[restaurant].z);
  return { restaurant, customer, stage: 'pickup', elapsed: 0, pickupEstimate: Math.max(20, Math.round(pickupDistance / 8 + 15)), estimate: Math.max(30, Math.round(distance / 8 + 18)), base: 20 + Math.round(distance / 15) };
}
export function initialDelivery(origin: { x: number; z: number }): DeliveryState {
  return { cash: 0, activeSeconds: 0, activeUntil: 0, completed: 0, order: orderFor(0, origin), lastPayout: null, lastReward: null, lastTicket: null, tickets: 0, ticketGraceUntil: 0, flight: { seconds:0, peakHeight:0, lastAirborneAt:0 } };
}
export function orderTarget(order: Order): {x:number; z:number; y:number; name:string; rooftop:boolean} {
  return order.stage === 'pickup' ? {...RESTAURANTS[order.restaurant], y:0, rooftop:false} : CUSTOMERS[order.customer];
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
export function updateDelivery(world: World, player: Player, entity: Entity, input: Input, dt: number, stuntInput = false): void {
  const delivery = player.delivery;
  const activeInput = !!(input.throttle || input.steer || input.roll || input.brake || input.hover || input.boost || stuntInput);
  if (activeInput || (entity.autopilot && Math.abs(entity.speed) > .5)) delivery.activeUntil = world.time + 3;
  const active = world.time <= delivery.activeUntil;
  if (active) {
    delivery.activeSeconds += dt;
    if(!entity.inDome)delivery.order.elapsed += dt;
  }
  if(entity.inDome)return;
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
    delivery.order = orderFor(delivery.completed, entity, hasRockets(entity));
  }
}

function reward(delivery: DeliveryState, kind: 'pickup' | 'delivery', amount: number): void {
  delivery.cash += amount;
  delivery.lastReward = { id: (delivery.lastReward?.id ?? 0) + 1, kind, amount };
}
