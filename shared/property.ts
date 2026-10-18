/** An existing shared, collision-backed San Francisco house. */
export const PROPERTY_HOME_SITE = {x:-78,z:90} as const;

/**
 * Candidate arrivals near the house. The room must still check each pose for
 * live traffic and players before spawning; fall back to its normal safe spawn
 * if none is available.
 */
export const PROPERTY_HOME_SPAWNS = [0,-8,8,-16,16].map(dz=>({x:-60,z:90+dz,yaw:0}));

/** Public room presentation only. Ownership authorization belongs to the registry. */
export type PropertyView = {assetId:string;ownerName:string};

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const PROPERTY_ROOM_PREFIX = 'p-';

/** Address the asset, never its current owner; the address is not a credential. */
export function propertyRoom(assetId:unknown):string|null {
  if(typeof assetId!=='string'||!UUID_V4.test(assetId))return null;
  return PROPERTY_ROOM_PREFIX+BigInt(`0x${assetId.replaceAll('-','')}`).toString(36);
}

/** Decode only canonical room addresses for server-minted UUIDv4 assets. */
export function propertyRoomAssetId(room:unknown):string|null {
  if(typeof room!=='string')return null;
  const match=/^p-([0-9a-z]{1,25})$/.exec(room);
  if(!match)return null;
  let value=0n;
  for(const char of match[1])value=value*36n+BigInt(parseInt(char,36));
  const hex=value.toString(16).padStart(32,'0');
  if(hex.length!==32)return null;
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return UUID_V4.test(id)&&propertyRoom(id)===room?id:null;
}
