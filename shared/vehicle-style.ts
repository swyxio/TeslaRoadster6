/** A finish is paid for each time it is applied. Level uses cash before payment. */
export const PAINTS = {
  stock: { name: 'Original paint', price: 0, level: 0, color: null },
  ember: { name: 'Ember red', price: 750, level: 0, color: 0xe23e46 },
  mint: { name: 'Electric mint', price: 1_000, level: 0, color: 0x32d5ae },
  violet: { name: 'Violet night', price: 1_750, level: 0, color: 0x9b6cfa },
  sunset: { name: 'Sunset orange', price: 3_000, level: 1, color: 0xf28b39 },
  ocean: { name: 'Bay blue', price: 4_500, level: 1, color: 0x267ac6 },
  glacier: { name: 'Glacier pearl', price: 7_000, level: 2, color: 0xc8eaf1 },
  midnight: { name: 'Midnight blue', price: 12_000, level: 2, color: 0x172b59 },
  gold: { name: 'Golden hour', price: 30_000, level: 3, color: 0xe6b549 },
  copper: { name: 'Copper canyon', price: 50_000, level: 4, color: 0xb96345 },
  aurora: { name: 'Aurora green', price: 100_000, level: 5, color: 0x18ae82 },
  obsidian: { name: 'Obsidian', price: 200_000, level: 6, color: 0x252631 },
  rose: { name: 'Rose quartz', price: 300_000, level: 7, color: 0xe497bb },
  platinum: { name: 'Platinum', price: 500_000, level: 8, color: 0xc8cfd1 },
} as const;
export const DECALS = {
  none: { name: 'No decal', price: 0, level: 0 },
  stripe: { name: 'Speed stripe', price: 450, level: 0 },
  checker: { name: 'Checkerboard', price: 900, level: 0 },
  double: { name: 'Twin stripes', price: 2_500, level: 1 },
  chevron: { name: 'Chevron', price: 6_000, level: 2 },
  circuit: { name: 'Circuit', price: 15_000, level: 3 },
  lightning: { name: 'Lightning', price: 30_000, level: 4 },
  stars: { name: 'Constellation', price: 75_000, level: 5 },
  crown: { name: 'Crown', price: 150_000, level: 6 },
  wings: { name: 'Wings', price: 300_000, level: 7 },
  solar: { name: 'Solar flare', price: 500_000, level: 8 },
} as const;
export type PaintId = keyof typeof PAINTS;
export type DecalId = keyof typeof DECALS;
export type VehicleStyle = { paint: PaintId; decal: DecalId };
export type StyleChoice = { category: 'paint'; choice: PaintId } | { category: 'decal'; choice: DecalId };
export const initialVehicleStyle = (): VehicleStyle => ({ paint: 'stock', decal: 'none' });
export function isStyleChoice(category: unknown, choice: unknown): boolean {
  return typeof choice === 'string' && ((category === 'paint' && Object.hasOwn(PAINTS, choice)) || (category === 'decal' && Object.hasOwn(DECALS, choice)));
}
