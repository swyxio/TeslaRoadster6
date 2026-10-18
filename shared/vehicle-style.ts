/** Workshop finishes use the same session cash as other upgrades. */
export const PAINTS = {
  stock: { name: 'Original paint', price: 0, color: null },
  ember: { name: 'Ember red', price: 18, color: 0xe23e46 },
  mint: { name: 'Electric mint', price: 18, color: 0x32d5ae },
  violet: { name: 'Violet night', price: 18, color: 0x9b6cfa },
} as const;
export const DECALS = {
  none: { name: 'No decal', price: 0 },
  stripe: { name: 'Speed stripe', price: 12 },
  checker: { name: 'Checkerboard', price: 18 },
} as const;
export type PaintId = keyof typeof PAINTS;
export type DecalId = keyof typeof DECALS;
export type VehicleStyle = { paint: PaintId; decal: DecalId };
export type StyleChoice = { category: 'paint'; choice: PaintId } | { category: 'decal'; choice: DecalId };
export const initialVehicleStyle = (): VehicleStyle => ({ paint: 'stock', decal: 'none' });
export function isStyleChoice(category: unknown, choice: unknown): boolean {
  return typeof choice === 'string' && ((category === 'paint' && Object.hasOwn(PAINTS, choice)) || (category === 'decal' && Object.hasOwn(DECALS, choice)));
}
