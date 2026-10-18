import type { Entity, Input, Player, World } from './game';

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
export const CUSTOMERS = [
  { id: 'poly', name: '88 Poly Ave · SF', x: -120, z: 60 },
  { id: 'fog', name: '12 Foggy Lane · SF', x: -240, z: 180 },
  { id: 'cable', name: '45 Cable Court · SF', x: 0, z: -180 },
  { id: 'coast', name: '19 Sunset Steps · SF', x: -300, z: 0 },
  { id: 'oak', name: '77 Oak Walk · Oakland', x: 450, z: 0 },
  { id: 'lake', name: '34 Lake Lane · Oakland', x: 510, z: -180 },
  { id: 'port', name: '8 Port Place · Oakland', x: 330, z: 120 },
] as const;
export type Order = { restaurant: number; customer: number; stage: 'pickup' | 'dropoff'; elapsed: number; estimate: number; base: number };
export type DeliveryState = { cash: number; activeSeconds: number; activeUntil: number; completed: number; order: Order; lastPayout: number | null; lastTicket: number | null; tickets: number; ticketGraceUntil: number };

function orderFor(index: number): Order {
  const restaurant = index % RESTAURANTS.length;
  // Never choose a destination beside the pickup.
  const candidates = CUSTOMERS.map((customer, i) => ({ customer, i })).filter(({ customer }) => Math.hypot(customer.x - RESTAURANTS[restaurant].x, customer.z - RESTAURANTS[restaurant].z) > 100);
  const customer = candidates[Math.floor(index / RESTAURANTS.length + index * 3) % candidates.length].i;
  const distance = Math.hypot(CUSTOMERS[customer].x - RESTAURANTS[restaurant].x, CUSTOMERS[customer].z - RESTAURANTS[restaurant].z);
  return { restaurant, customer, stage: 'pickup', elapsed: 0, estimate: Math.max(30, Math.round(distance / 8 + 18)), base: 20 + Math.round(distance / 15) };
}
export function initialDelivery(): DeliveryState {
  return { cash: 0, activeSeconds: 0, activeUntil: 0, completed: 0, order: orderFor(0), lastPayout: null, lastTicket: null, tickets: 0, ticketGraceUntil: 0 };
}
export function orderTarget(order: Order) { return order.stage === 'pickup' ? RESTAURANTS[order.restaurant] : CUSTOMERS[order.customer]; }
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
    if (delivery.order.stage === 'dropoff') delivery.order.elapsed += dt;
  }
  const target = orderTarget(delivery.order);
  if (entity.y > 1 || Math.abs(entity.speed) > 4 || Math.hypot(entity.x - target.x, entity.z - target.z) > 9) return;
  if (delivery.order.stage === 'pickup') {
    delivery.order.stage = 'dropoff';
    delivery.order.elapsed = 0;
    delivery.lastPayout = null;
  } else {
    const payout = payoutFor(delivery.order);
    delivery.cash += payout;
    delivery.lastPayout = payout;
    delivery.completed++;
    delivery.order = orderFor(delivery.completed);
  }
}
