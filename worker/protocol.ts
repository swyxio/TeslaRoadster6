import { VEHICLES, type VehicleId } from '../shared/vehicles';
import type { Input } from '../shared/game';
import { UPGRADES, type UpgradeId } from '../shared/upgrades';
export type ClientMessage = { type: 'input'; input: Input } | { type: 'interact' | 'reset' | 'autopilot' | 'dome' } | { type: 'name'; name: string } | {type:'selectVehicle';kind:VehicleId} | {type:'upgrade';upgrade:UpgradeId;requestId:number};
export function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > 1024) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (value.type === 'input') {
    if (!value.input || typeof value.input !== 'object') return null;
    const input = value.input as Record<string, unknown>;
    for (const key of ['throttle', 'steer', 'roll']) if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || Math.abs(input[key] as number) > 1) return null;
    for (const key of ['boost', 'hover', 'brake', 'cockpit']) if (typeof input[key] !== 'boolean') return null;
    for (const key of ['jump', 'flip']) if (!Number.isSafeInteger(input[key]) || (input[key] as number)<0 || (input[key] as number)>2147483647) return null;
    return { type: 'input', input: { throttle: input.throttle as number, steer: input.steer as number, roll: input.roll as number, boost: input.boost as boolean, hover: input.hover as boolean, brake: input.brake as boolean, jump: input.jump as number, flip: input.flip as number, cockpit: input.cockpit as boolean } };
  }
  if(value.type==='selectVehicle' && typeof value.kind==='string' && Object.hasOwn(VEHICLES,value.kind))return {type:'selectVehicle',kind:value.kind as VehicleId};
  if(value.type==='upgrade' && typeof value.upgrade==='string' && Object.hasOwn(UPGRADES,value.upgrade) && Number.isSafeInteger(value.requestId) && (value.requestId as number)>0)return {type:'upgrade',upgrade:value.upgrade as UpgradeId,requestId:value.requestId as number};
  if (value.type === 'interact' || value.type === 'reset' || value.type === 'autopilot' || value.type === 'dome') return { type: value.type };
  if (value.type === 'name' && typeof value.name === 'string') {
    const name = value.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
    return name ? { type: 'name', name } : null;
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
