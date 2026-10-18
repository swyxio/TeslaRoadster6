import { VEHICLES, type VehicleId } from '../shared/vehicles';
import type { Input } from '../shared/game';
import { normalizeName } from './global-chat-core';
import { UPGRADES, type UpgradeId } from '../shared/upgrades';
export type ClientMessage = { type: 'input'; seq:number; input: Input } | {type:'sync';token:number} | { type: 'interact' | 'reset' | 'autopilot' | 'dome' } | { type: 'name'; name: string } | {type:'selectVehicle';kind:VehicleId} | {type:'parking';action:'park'|'queue'|'start'|'leave'} | {type:'race';action:'join'|'start'|'leave';courseId:'short'|'oval'} | {type:'minigame';game:'park'|'queue'|'short'|'oval'} | {type:'destination';x:number;z:number;requestId:number} | {type:'upgrade';upgrade:UpgradeId;requestId:number} | {type:'ota';enabled:boolean;requestId:number} | {type:'mars';action:'contribute';amount:number;requestId:number} | {type:'mars';action:'board';requestId:number};
export function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > 1024) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (value.type === 'input') {
    if(!Number.isSafeInteger(value.seq)||(value.seq as number)<1)return null;
    if (!value.input || typeof value.input !== 'object') return null;
    const input = value.input as Record<string, unknown>;
    for (const key of ['throttle', 'steer', 'roll']) if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || Math.abs(input[key] as number) > 1) return null;
    for (const key of ['boost', 'hover', 'brake', 'cockpit']) if (typeof input[key] !== 'boolean') return null;
    for (const key of ['jump', 'flip']) if (!Number.isSafeInteger(input[key]) || (input[key] as number)<0 || (input[key] as number)>2147483647) return null;
    return { type: 'input', seq:value.seq as number, input: { throttle: input.throttle as number, steer: input.steer as number, roll: input.roll as number, boost: input.boost as boolean, hover: input.hover as boolean, brake: input.brake as boolean, jump: input.jump as number, flip: input.flip as number, cockpit: input.cockpit as boolean } };
  }
  if(value.type==='sync'&&Number.isSafeInteger(value.token)&&(value.token as number)>0)return {type:'sync',token:value.token as number};
  if(value.type==='selectVehicle' && typeof value.kind==='string' && Object.hasOwn(VEHICLES,value.kind))return {type:'selectVehicle',kind:value.kind as VehicleId};
  if(value.type==='parking'&&(value.action==='park'||value.action==='queue'||value.action==='start'||value.action==='leave'))return {type:'parking',action:value.action};
  if(value.type==='race'&&(value.action==='join'||value.action==='start'||value.action==='leave')&&(value.courseId==='short'||value.courseId==='oval'))return {type:'race',action:value.action,courseId:value.courseId};
  if(value.type==='minigame'&&(value.game==='park'||value.game==='queue'||value.game==='short'||value.game==='oval'))return {type:'minigame',game:value.game};
  if(value.type==='destination'&&typeof value.x==='number'&&Number.isFinite(value.x)&&Math.abs(value.x)<=10000&&typeof value.z==='number'&&Number.isFinite(value.z)&&Math.abs(value.z)<=10000&&Number.isSafeInteger(value.requestId)&&(value.requestId as number)>0)return {type:'destination',x:value.x,z:value.z,requestId:value.requestId as number};
  if(value.type==='upgrade' && typeof value.upgrade==='string' && Object.hasOwn(UPGRADES,value.upgrade) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'upgrade',upgrade:value.upgrade as UpgradeId,requestId:value.requestId as number};
  if(value.type==='ota' && typeof value.enabled==='boolean' && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'ota',enabled:value.enabled,requestId:value.requestId as number};
  if(value.type==='mars' && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0){
    if(value.action==='board')return {type:'mars',action:'board',requestId:value.requestId as number};
    if(value.action==='contribute' && Number.isSafeInteger(value.amount) && (value.amount as number)>0 && (value.amount as number)<=1_000_000_000)return {type:'mars',action:'contribute',amount:value.amount as number,requestId:value.requestId as number};
  }
  if (value.type === 'interact' || value.type === 'reset' || value.type === 'autopilot' || value.type === 'dome') return { type: value.type };
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
