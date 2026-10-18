/** The Vault is a fictional showroom in the compressed Palo Alto map. */
export const LUXURY_SHOWROOM = {
  building: { x:-828.5561764090639, z:4003.441528459504, w:24, d:22, h:9 },
  arrival: { x:-829, z:4030 },
  radius: 10,
} as const;

export const LUXURY_CATALOG = [
  { id:'ducati-panigale-v4', brand:'Ducati', name:'Panigale V4', price:1_500_000, achievement:'luxury-panigale', reward:20_000, description:'A light, nimble superbike for quick changes of direction.' },
  { id:'kawasaki-ninja-h2-carbon', brand:'Kawasaki', name:'Ninja H2 Carbon', price:2_000_000, achievement:'luxury-ninja', reward:25_000, description:'A carbon-clad superbike with strong straight-line acceleration.' },
  { id:'lamborghini-temerario', brand:'Lamborghini', name:'Temerario', price:3_000_000, achievement:'luxury-temerario', reward:40_000, description:'A low wedge with precise cornering and strong brakes.' },
  { id:'lamborghini-revuelto', brand:'Lamborghini', name:'Revuelto', price:4_500_000, achievement:'luxury-revuelto', reward:60_000, description:'A sharp, planted supercar with hard acceleration.' },
  { id:'bugatti-chiron', brand:'Bugatti', name:'Chiron', price:7_000_000, achievement:'luxury-chiron', reward:100_000, description:'A fast, durable long-distance cruiser.' },
  { id:'bugatti-tourbillon', brand:'Bugatti', name:'Tourbillon', price:12_000_000, achievement:'luxury-tourbillon', reward:150_000, description:'A flagship hypercar with composed high-speed handling.' },
] as const;

export type LuxuryVehicleId = typeof LUXURY_CATALOG[number]['id'];
export type LuxuryAchievementId = typeof LUXURY_CATALOG[number]['achievement']|'luxury-visit'|'luxury-first'|'luxury-collection-2'|'luxury-collection-4'|'luxury-collection-6';
export function luxuryVehicle(id:string) { return LUXURY_CATALOG.find(vehicle=>vehicle.id===id); }
export const LUXURY_DISCOVERY = { id:'luxury-visit', reward:1_000 } as const;

/** Calculate the one-off awards to commit with a first purchase. */
export function luxuryPurchaseAwards(id:LuxuryVehicleId,previousOwned:readonly string[],unlocked:readonly string[]) {
  const vehicle=luxuryVehicle(id);
  if(!vehicle||previousOwned.includes(id))return [];
  const owned=new Set(previousOwned.filter(candidate=>luxuryVehicle(candidate)));
  const first=owned.size===0;owned.add(id);
  const candidates:{id:LuxuryAchievementId;reward:number}[]=[{id:vehicle.achievement,reward:vehicle.reward}];
  if(first)candidates.unshift({id:'luxury-first',reward:25_000});
  for(const milestone of [{count:2,id:'luxury-collection-2',reward:50_000},{count:4,id:'luxury-collection-4',reward:100_000},{count:6,id:'luxury-collection-6',reward:250_000}] as const)
    if(owned.size>=milestone.count)candidates.push({id:milestone.id,reward:milestone.reward});
  return candidates.filter(award=>!unlocked.includes(award.id));
}

/** Use on both client and authority; the authority always checks its own pose. */
export function atLuxuryShowroom(entity:{x:number;y:number;z:number;speed:number;vy:number;pushX:number;pushZ:number;supportId:string|null;inDome:boolean}):boolean {
  const { arrival, radius } = LUXURY_SHOWROOM;
  return !entity.inDome && entity.supportId==='ground' && Math.abs(entity.speed)<=2 &&
    Math.abs(entity.vy)<1 && Math.hypot(entity.pushX,entity.pushZ)<1 && Math.abs(entity.y)<2 &&
    Math.hypot(entity.x-arrival.x,entity.z-arrival.z)<=radius;
}
