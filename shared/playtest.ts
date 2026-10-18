import type { Entity, Player, World } from './game';
import { levelForCash } from './delivery';
import { MAX_TANK_LEVEL } from './air-tank';

export type PlaytestMode = 'sandbox' | 'practice' | null;
/** Reserved public room namespaces. Only the room URL selects the server mode. */
export function playtestMode(room: string): PlaytestMode {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(room)) return null;
  for (const mode of ['sandbox', 'practice'] as const)
    if (room === mode || room.startsWith(`${mode}-`)) return mode;
  return null;
}
export const isSandboxRoom = (room: string) => playtestMode(room) === 'sandbox';
// Finite on the wire. Sandbox spending is replenished and never enters a ledger.
export const SANDBOX_CASH = 1_000_000_000_000;
export function sandboxWallet(player: Player, time: number): void {
  player.delivery.cash = SANDBOX_CASH;
  player.delivery.level = levelForCash(SANDBOX_CASH);
  Object.assign(player.delivery.ota, { enabled: true, active: true, renewAt: time + 3600, needsRenewalConsent: false });
}
export function sandboxVehicle(entity: Entity): void {
  if (entity.kind === 'person') return;
  entity.tankLevel = MAX_TANK_LEVEL;
  for (const key of Object.keys(entity.upgrades) as (keyof Entity['upgrades'])[]) entity.upgrades[key] = true;
  entity.air = 100;
}
export function prepareSandboxDriver(world: World, id: string): void {
  const player = world.players.find(p => p.id === id);
  const entity = world.entities.find(e => e.id === player?.entityId);
  if (player) sandboxWallet(player, world.time);
  if (entity) sandboxVehicle(entity);
}
