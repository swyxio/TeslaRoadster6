import { VEHICLES, type VehicleId } from '../shared/vehicles';
import type { Input } from '../shared/game';
import { luxuryVehicle, type LuxuryVehicleId } from '../shared/luxury';
import type { EdgeBaseline } from '../shared/tick-input';
import { normalizeName } from './global-chat-core';
import { UPGRADES, type UpgradeId } from '../shared/upgrades';
import { isStyleChoice, type PaintId, type StyleChoice } from '../shared/vehicle-style';
import type { MarketRequest } from '../shared/market-protocol';
import { isDriveMode, type DriveMode } from '../shared/drive-mode';
export type ActionFence = {actionSeq:number;edgeBaseline:EdgeBaseline};
export type ClientMessage = ({type:'teleport';x:number;z:number;requestId:number} & ActionFence) | MarketRequest | {type:'starship';action:'status';requestId:number} | {type:'starship';action:'name';name:string|null;requestId:number} | {type:'identity';code:string|null;requestId:number} | {type:'cab';action:'buy';requestId:number} | {type:'cab';action:'paint';assetId:string;paint:PaintId;requestId:number} | {type:'luxury';action:'buy';vehicle:LuxuryVehicleId;requestId:number} | ({type:'luxury';action:'collect';vehicle:LuxuryVehicleId;requestId:number} & ActionFence) | ({type:'vehicleStyle';requestId:number} & StyleChoice) | { type: 'input'; seq:number; targetTick:number; roomEpoch:string; controlRevision:number; actionSeq:number; input: Input } | {type:'sync';token:number} | ({ type: 'interact' | 'reset' | 'autopilot' | 'dome' } & ActionFence) | { type: 'name'; name: string } | ({type:'selectVehicle';kind:VehicleId} & ActionFence) | {type:'parking';action:'park'|'queue'|'start'|'leave'} | ({type:'race';action:'join';courseId:'short'|'oval'} & ActionFence) | {type:'race';action:'start'|'leave';courseId:'short'|'oval'} | ({type:'minigame';game:'park'|'queue'|'short'|'oval'} & ActionFence) | ({type:'destination';x:number;z:number;mode:DriveMode;requestId:number} & ActionFence) | ({type:'deliveryDestination'|'chargerDestination';mode:DriveMode;requestId:number} & ActionFence) | {type:'upgrade';upgrade:UpgradeId;requestId:number} | {type:'ota';enabled:boolean;requestId:number} | {type:'mars';action:'board';requestId:number} | {type:'mars';action:'contribute';amount:number;requestId:number};
export function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > 1024) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const fence=():ActionFence|null=>{
    if(!Number.isSafeInteger(value.actionSeq)||(value.actionSeq as number)<1||!value.edgeBaseline||typeof value.edgeBaseline!=='object')return null;
    const baseline=value.edgeBaseline as Record<string,unknown>;
    for(const kind of ['jump','flip'])if(!Number.isSafeInteger(baseline[kind])||(baseline[kind] as number)<0||(baseline[kind] as number)>2147483647)return null;
    return {actionSeq:value.actionSeq as number,edgeBaseline:{jump:baseline.jump as number,flip:baseline.flip as number}};
  };
  if(value.type==='teleport'){
    const action=fence();
    if(!action||!Number.isSafeInteger(value.requestId)||(value.requestId as number)<1||typeof value.x!=='number'||typeof value.z!=='number'||!Number.isFinite(value.x)||!Number.isFinite(value.z)||Math.abs(value.x)>10000||Math.abs(value.z)>10000)return null;
    return {type:'teleport',x:value.x,z:value.z,requestId:value.requestId as number,...action};
  }
  if (value.type === 'input') {
    if(!Number.isSafeInteger(value.seq)||(value.seq as number)<1)return null;
    if(!Number.isSafeInteger(value.targetTick)||(value.targetTick as number)<1||!Number.isSafeInteger(value.controlRevision)||(value.controlRevision as number)<0||!Number.isSafeInteger(value.actionSeq)||(value.actionSeq as number)<0)return null;
    if(typeof value.roomEpoch!=='string'||value.roomEpoch.length!==36)return null;
    if (!value.input || typeof value.input !== 'object') return null;
    const input = value.input as Record<string, unknown>;
    for (const key of ['throttle', 'steer', 'roll']) if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || Math.abs(input[key] as number) > 1) return null;
    for (const key of ['boost', 'hover', 'brake', 'cockpit']) if (typeof input[key] !== 'boolean') return null;
    for (const key of ['jump', 'flip']) if (!Number.isSafeInteger(input[key]) || (input[key] as number)<0 || (input[key] as number)>2147483647) return null;
    return { type: 'input', seq:value.seq as number, targetTick:value.targetTick as number, roomEpoch:value.roomEpoch, controlRevision:value.controlRevision as number, actionSeq:value.actionSeq as number, input: { throttle: input.throttle as number, steer: input.steer as number, roll: input.roll as number, boost: input.boost as boolean, hover: input.hover as boolean, brake: input.brake as boolean, jump: input.jump as number, flip: input.flip as number, cockpit: input.cockpit as boolean } };
  }
  if(value.type==='identity' && (value.code===null || (typeof value.code==='string' && value.code.length<=160)) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'identity',code:value.code as string|null,requestId:value.requestId as number};
  if(value.type==='cab' && value.action==='buy' && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'cab',action:'buy',requestId:value.requestId as number};
  if(value.type==='cab' && value.action==='paint' && typeof value.assetId==='string' && /^[-a-zA-Z0-9]{1,128}$/.test(value.assetId) && isStyleChoice('paint',value.paint) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'cab',action:'paint',assetId:value.assetId,paint:value.paint as PaintId,requestId:value.requestId as number};
  if(value.type==='market'){
    const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
    const whole=(v:unknown,min:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
    if(!whole(value.requestId,1))return null;
    const base={type:'market' as const,requestId:value.requestId};
    if(value.action==='browse'){
      if((value.cursor!==undefined&&!uuid(value.cursor))||(value.ownedCursor!==undefined&&!uuid(value.ownedCursor)))return null;
      return {...base,action:'browse',...(value.cursor?{cursor:value.cursor as string}:{}),...(value.ownedCursor?{ownedCursor:value.ownedCursor as string}:{})};
    }
    if(!uuid(value.operationId))return null;
    const operation={...base,operationId:value.operationId};
    if(value.action==='status')return {...operation,action:'status'};
    if(value.action==='acquire'&&typeof value.catalogId==='string'&&/^[a-z0-9-]{1,64}$/.test(value.catalogId))return {...operation,action:'acquire',catalogId:value.catalogId};
    if(!uuid(value.assetId))return null;
    if(value.action==='equip'||value.action==='unequip')return {...operation,action:value.action,assetId:value.assetId};
    if(value.action==='list'&&whole(value.price,0))return {...operation,action:'list',assetId:value.assetId,price:value.price};
    if(!uuid(value.listingId)||!whole(value.expectedRevision,1))return null;
    const listing={...operation,assetId:value.assetId,listingId:value.listingId,expectedRevision:value.expectedRevision};
    if(value.action==='reprice'&&whole(value.price,0))return {...listing,action:'reprice',price:value.price};
    if(value.action==='cancel'||value.action==='buy')return {...listing,action:value.action};
    return null;
  }
  if(value.type==='starship'){
    if(value.action==='status'&&Number.isSafeInteger(value.requestId)&&(value.requestId as number)>0)return {type:'starship',action:'status',requestId:value.requestId as number};
    if(value.action==='name'&&(value.name===null||(typeof value.name==='string'&&value.name.length<=256))&&Number.isSafeInteger(value.requestId)&&(value.requestId as number)>0)
      return {type:'starship',action:'name',name:value.name as string|null,requestId:value.requestId as number};
    return null;
  }
  if(value.type==='luxury' && (value.action==='buy'||value.action==='collect') && typeof value.vehicle==='string' && luxuryVehicle(value.vehicle) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0){
    const item={type:'luxury' as const,vehicle:value.vehicle as LuxuryVehicleId,requestId:value.requestId as number};
    if(value.action==='buy')return {...item,action:'buy'};
    const f=fence();return f?{...item,action:'collect',...f}:null;
  }
  if(value.type==='sync'&&Number.isSafeInteger(value.token)&&(value.token as number)>0)return {type:'sync',token:value.token as number};
  if(value.type==='selectVehicle' && typeof value.kind==='string' && Object.hasOwn(VEHICLES,value.kind)){const f=fence();return f?{type:'selectVehicle',kind:value.kind as VehicleId,...f}:null;}
  if(value.type==='parking'&&(value.action==='park'||value.action==='queue'||value.action==='start'||value.action==='leave'))return {type:'parking',action:value.action};
  if(value.type==='race'&&(value.action==='join'||value.action==='start'||value.action==='leave')&&(value.courseId==='short'||value.courseId==='oval')){if(value.action!=='join')return {type:'race',action:value.action,courseId:value.courseId};const f=fence();return f?{type:'race',action:'join',courseId:value.courseId,...f}:null;}
  if(value.type==='minigame'&&(value.game==='park'||value.game==='queue'||value.game==='short'||value.game==='oval')){const f=fence();return f?{type:'minigame',game:value.game,...f}:null;}
  if(value.type==='destination'&&isDriveMode(value.mode)&&typeof value.x==='number'&&Number.isFinite(value.x)&&Math.abs(value.x)<=10000&&typeof value.z==='number'&&Number.isFinite(value.z)&&Math.abs(value.z)<=10000&&Number.isSafeInteger(value.requestId)&&(value.requestId as number)>0){const f=fence();return f?{type:'destination',x:value.x,z:value.z,mode:value.mode,requestId:value.requestId as number,...f}:null;}
  if((value.type==='deliveryDestination'||value.type==='chargerDestination')&&isDriveMode(value.mode)&&Number.isSafeInteger(value.requestId)&&(value.requestId as number)>0){const f=fence();return f?{type:value.type,mode:value.mode,requestId:value.requestId as number,...f}:null;}
  if(value.type==='upgrade' && typeof value.upgrade==='string' && Object.hasOwn(UPGRADES,value.upgrade) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'upgrade',upgrade:value.upgrade as UpgradeId,requestId:value.requestId as number};
  if(value.type==='vehicleStyle' && isStyleChoice(value.category,value.choice) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'vehicleStyle',category:value.category,choice:value.choice,requestId:value.requestId} as ClientMessage;
  if(value.type==='ota' && typeof value.enabled==='boolean' && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'ota',enabled:value.enabled,requestId:value.requestId as number};
  if(value.type==='mars' && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0){
    if(value.action==='board')return {type:'mars',action:'board',requestId:value.requestId as number};
    if(value.action==='contribute'&&Number.isSafeInteger(value.amount)&&(value.amount as number)>0&&(value.amount as number)<=1_000_000_000)return {type:'mars',action:'contribute',amount:value.amount as number,requestId:value.requestId as number};
  }
  if (value.type === 'interact' || value.type === 'reset' || value.type === 'autopilot' || value.type === 'dome') {const f=fence();return f?{type:value.type,...f}:null;}
  if (value.type === 'name' && typeof value.name === 'string') {
    return { type: 'name', name: normalizeName(value.name) };
  }
  return null;
}
export function roomCapacity(value?: string): number {
  const requested = Number(value ?? 64);
  return Number.isFinite(requested) ? Math.max(2, Math.min(128, Math.floor(requested))) : 64;
}
export function roomSlug(path: string): string | null {
  return /^\/api\/room\/([a-z0-9][a-z0-9-]{0,31})$/.exec(path)?.[1] ?? null;
}
