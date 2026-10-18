import { STATIONS } from './stations';

export type Input = { throttle: number; steer: number; boost: boolean; lift: boolean; roll: number; brake: boolean };
export type Entity = { id: string; kind: 'roadster' | 'coupe' | 'truck' | 'person'; x: number; y: number; z: number; yaw: number; roll: number; speed: number; health: number; air: number; driver: string | null; vy: number };
export type Player = { id: string; name: string; entityId: string };
export type Pickup = { id: string; x: number; z: number; kind: 'repair' | 'air'; active: boolean; readyAt?: number };
export type World = { entities: Entity[]; players: Player[]; pickups: Pickup[]; time: number };
export const WORLD_LIMIT = 240;
export const NEUTRAL: Input = { throttle: 0, steer: 0, boost: false, lift: false, roll: 0, brake: false };
export const BUILDINGS: { x: number; z: number; w: number; d: number; h: number }[] = [];
for (let x = -180; x < 180; x += 60) for (let z = -180; z < 180; z += 60) {
  BUILDINGS.push({ x: x + 30, z: z + 30, w: 24, d: 24, h: 9 + ((x + z + 360) / 60 % 5) * 7 });
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const radius = (e: Entity) => e.kind === 'person' ? 0.65 : e.kind === 'truck' ? 2.4 : 1.8;
const makeEntity = (id: string, kind: Entity['kind'], x: number, z: number, driver: string | null = null): Entity => ({ id, kind, x, y: 0, z, yaw: 0, roll: 0, speed: 0, health: 100, air: 100, driver, vy: 0 });

export function createWorld(): World {
  const entities: Entity[] = [];
  for (let i = 0; i < 14; i++) entities.push(makeEntity(`parked-${i}`, i % 3 === 0 ? 'roadster' : i % 3 === 1 ? 'coupe' : 'truck', -180 + (i % 7) * 60 + 6, i < 7 ? -85 : 85));
  return { entities, players: [], time: 0, pickups: Array.from({ length: 12 }, (_, i) => ({ id: `pickup-${i}`, x: -150 + (i % 6) * 60, z: i < 6 ? -60 : 60, kind: i % 2 ? 'air' : 'repair', active: true })) };
}

function spawnPosition(world: World): { x: number; z: number } {
  for (let i = 0; i < 196; i++) {
    const x = -6 + (i % 2) * 12 + Math.floor(i / 28) * 60;
    const wrappedX = x > 220 ? x - 420 : x;
    const z = 24 - Math.floor(i / 2) % 14 * 12;
    if (!world.entities.some(e => Math.hypot(e.x - wrappedX, e.z - z) < 5 && e.y < 3)) return { x: wrappedX, z };
  }
  return { x: 0, z: 220 };
}
export function addPlayer(world: World, id: string, name: string): Player {
  const existing = world.players.find(p => p.id === id);
  if (existing) return existing;
  const spawn = spawnPosition(world);
  const car = makeEntity(`roadster-${id}`, 'roadster', spawn.x, spawn.z, id);
  const player = { id, name: name.slice(0, 24), entityId: car.id };
  world.entities.push(car); world.players.push(player);
  return player;
}
export function removePlayer(world: World, id: string): void {
  world.players = world.players.filter(p => p.id !== id);
  for (const entity of world.entities) if (entity.driver === id) { entity.driver = null; entity.speed = 0; }
  // A borrowed personal car stays until its current driver disconnects or exits.
  world.entities = world.entities.filter(e => e.kind !== 'person' || e.id !== `person-${id}`);
  cleanupCars(world);
}
function cleanupCars(world: World) {
  world.entities = world.entities.filter(e => !e.id.startsWith('roadster-') || e.driver !== null || world.players.some(p => e.id === `roadster-${p.id}`));
}
function solidAt(x: number, z: number, r: number, y = 0): boolean {
  return Math.abs(x) > WORLD_LIMIT - r || Math.abs(z) > WORLD_LIMIT - r || BUILDINGS.some(b => y < b.h && Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r);
}
export function interact(world: World, playerId: string): void {
  const player = world.players.find(p => p.id === playerId);
  const entity = world.entities.find(e => e.id === player?.entityId);
  if (!player || !entity || entity.y > 0.5 || Math.abs(entity.speed) > 5) return;
  if (entity.kind === 'person') {
    const car = world.entities.filter(e => e.kind !== 'person' && !e.driver && e.y < 0.5 && Math.hypot(e.x - entity.x, e.z - entity.z) < 7).sort((a, b) => Math.hypot(a.x - entity.x, a.z - entity.z) - Math.hypot(b.x - entity.x, b.z - entity.z))[0];
    if (!car) return;
    car.driver = playerId; player.entityId = car.id;
    world.entities = world.entities.filter(e => e.id !== entity.id);
  } else {
    const exits = [Math.PI / 2, -Math.PI / 2, Math.PI, 0].map(angle => ({ x: entity.x - Math.sin(entity.yaw + angle) * 4, z: entity.z - Math.cos(entity.yaw + angle) * 4 }));
    const exit = exits.find(p => !solidAt(p.x, p.z, 0.65) && !world.entities.some(e => e !== entity && e.y < 2 && Math.hypot(e.x - p.x, e.z - p.z) < radius(e) + 0.65));
    if (!exit) return;
    const person = makeEntity(`person-${playerId}`, 'person', exit.x, exit.z, playerId);
    entity.driver = null; entity.speed = 0; player.entityId = person.id; world.entities.push(person);
    cleanupCars(world);
  }
}
export function resetPlayer(world: World, id: string): void {
  const player = world.players.find(p => p.id === id);
  const entity = world.entities.find(e => e.id === player?.entityId);
  if (!entity) return;
  const spawn = spawnPosition(world);
  // Recovery repositions only; stations and pickups remain necessary resources.
  Object.assign(entity, spawn, { y: 0, vy: 0, yaw: 0, roll: 0, speed: 0 });
}

export function step(world: World, inputs: Map<string, Input>, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05); world.time += dt;
  for (const e of world.entities) {
    const input = e.driver ? inputs.get(e.driver) ?? NEUTRAL : NEUTRAL;
    const person = e.kind === 'person';
    const oldX = e.x, oldZ = e.z, oldY = e.y;
    const boosting = e.kind === 'roadster' && input.boost && e.air > 0;
    const lifting = e.kind === 'roadster' && input.lift && e.air > 0;
    const top = person ? 8 : e.kind === 'truck' ? 25 : e.kind === 'coupe' ? 38 : boosting ? 72 : 48;
    e.speed += input.throttle * (person ? 28 : boosting ? 45 : 22) * dt;
    e.speed *= Math.exp(-(input.brake ? 6 : input.throttle === 0 ? 1.2 : 0.28) * dt);
    e.speed = clamp(e.speed, -top * 0.4, top) * (e.health < 20 ? 0.99 : 1);
    e.yaw += input.steer * (person ? 2.7 : 1.6 * Math.min(1, Math.abs(e.speed) / 6)) * dt * (e.speed < -0.1 ? -1 : 1);
    e.x -= Math.sin(e.yaw) * e.speed * dt; e.z -= Math.cos(e.yaw) * e.speed * dt;
    if (lifting) e.vy = Math.min(20, e.vy + 30 * dt);
    if (e.y > 0 || lifting) { e.vy -= 12 * dt; e.y += e.vy * dt; }
    if (e.y > 0) e.roll += input.roll * 3.6 * dt;
    if (e.y <= 0) { e.y = 0; e.vy = 0; e.roll = 0; }
    if (e.y >= 100) { e.y = 100; e.vy = Math.min(e.vy, 0); }
    e.air = clamp(e.air - (boosting ? 14 : 0) * dt - (lifting ? 22 : 0) * dt, 0, 100);
    // Support rooftop landings before testing horizontal solid volume.
    for (const b of BUILDINGS) if (e.vy <= 0 && Math.abs(e.x - b.x) < b.w / 2 + radius(e) && Math.abs(e.z - b.z) < b.d / 2 + radius(e) && e.y <= b.h && oldY >= b.h) { e.y = b.h; e.vy = 0; e.roll = 0; }
    if (solidAt(e.x, e.z, radius(e), e.y)) {
      e.x = oldX; e.z = oldZ; e.health = Math.max(5, e.health - Math.max(0, Math.abs(e.speed) - 8) * 0.25); e.speed *= -0.25;
    }
    if (!person && e.y < 1 && Math.abs(e.speed) < 1 && STATIONS.some(s => Math.hypot(e.x - s.x, e.z - s.z) < 9)) e.air = Math.min(100, e.air + 28 * dt);
  }
  for (let i = 0; i < world.entities.length; i++) for (let j = i + 1; j < world.entities.length; j++) {
    const a = world.entities[i], b = world.entities[j];
    if (Math.abs(a.y - b.y) > 2.5) continue;
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz), separation = radius(a) + radius(b);
    if (distance >= separation) continue;
    const nx = distance > 0.001 ? dx / distance : 1, nz = distance > 0.001 ? dz / distance : 0;
    const push = (separation - distance) / 2 + 0.01;
    if (!solidAt(a.x - nx * push, a.z - nz * push, radius(a), a.y)) { a.x -= nx * push; a.z -= nz * push; }
    if (!solidAt(b.x + nx * push, b.z + nz * push, radius(b), b.y)) { b.x += nx * push; b.z += nz * push; }
    const damage = Math.max(0, Math.abs(a.speed - b.speed) - 6) * 0.15;
    a.health = Math.max(5, a.health - damage); b.health = Math.max(5, b.health - damage);
    const speed = a.speed; a.speed = b.speed * 0.6; b.speed = speed * 0.6;
  }
  for (const pickup of world.pickups) {
    if (!pickup.active && world.time >= (pickup.readyAt ?? Infinity)) pickup.active = true;
    if (!pickup.active) continue;
    const car = world.entities.find(e => e.driver && e.kind !== 'person' && e.y < 2 && Math.hypot(e.x - pickup.x, e.z - pickup.z) < 4);
    if (!car) continue;
    if (pickup.kind === 'repair') car.health = 100; else car.air = 100;
    pickup.active = false; pickup.readyAt = world.time + 20;
  }
}
