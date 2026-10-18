import type { Entity } from './game';
import { VEHICLES } from './vehicles';

// Fictional workshops beside streets and the compressed highway corridor; not real SpaceX sites.
export const SHOPS = [
  {id:'mission', name:'SF · Mission', x:-165, z:180},
  {id:'richmond', name:'SF · Richmond', x:-285, z:-120},
  {id:'oakland', name:'Oakland · Port', x:345, z:120},
  {id:'san-mateo', name:'San Mateo', x:-1237, z:2007},
  {id:'palo-alto', name:'Palo Alto', x:-792, z:4001},
  {id:'mountain-view', name:'Mountain View', x:-67, z:6008},
  {id:'san-jose', name:'San Jose', x:1526, z:8798},
  {id:'fremont', name:'Fremont', x:1606, z:5987},
  {id:'east-bay', name:'East Bay', x:1325, z:2990},
] as const;
export const SHOP_RADIUS=12;
export const UPGRADES = {
  rocket: {name:'Rocket kit', price:2_500, description:'Jump, hover, boost and flip in any vehicle.'},
  economy: {name:'Efficient nozzles', price:2_000, description:'Flight uses 25% less air.'},
  tank: {name:'Air tank', price:1_500, description:'Double capacity and refill. Five levels of arcade flight.'},
  motor: {name:'Sport motor', price:2_000, description:'25% quicker acceleration and 10% higher road speed.'},
  armor: {name:'Impact armor', price:1_500, description:'Halves crash and hard-landing damage.'},
  autonomyJump: {name:'Ludicrous Leap', price:6_000, description:'Self-driving can hop past stopped traffic. Requires rockets.'},
  autonomySky: {name:'Maximum Plaid', price:12_000, description:'Self-driving can fly and use helpful air currents. Requires Ludicrous Leap and rockets.'},
  service: {name:'Repair & refill', price:200, description:'Restore condition and fill your air tank.'},
} as const;
export type UpgradeId=keyof typeof UPGRADES;
export type VehicleUpgrades={rocket:boolean;economy:boolean;motor:boolean;armor:boolean;autonomyJump:boolean;autonomySky:boolean};
export function initialVehicleUpgrades():VehicleUpgrades{return {rocket:false,economy:false,motor:false,armor:false,autonomyJump:false,autonomySky:false};}
export function hasRockets(e:Entity):boolean{return e.kind!=='person'&&(VEHICLES[e.kind].airThrusters||e.upgrades.rocket);}
export function shopFor(e:Entity){
  if(e.kind==='person'||e.supportId!=='ground'||Math.abs(e.speed)>=1||Math.hypot(e.pushX,e.pushZ)>=1||Math.abs(e.vy)>=1)return undefined;
  return SHOPS.find(s=>Math.hypot(e.x-s.x,e.z-s.z)<SHOP_RADIUS);
}
