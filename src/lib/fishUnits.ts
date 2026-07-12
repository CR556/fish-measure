export type UnitsSystem = 'imperial' | 'metric';

/** Headline fish length: `18.6 in` / `47.2 cm`. */
export function formatFishLength(meters: number, system: UnitsSystem): string {
  if (system === 'imperial') {
    return `${(meters * 39.3701).toFixed(1)} in`;
  }
  return `${(meters * 100).toFixed(1)} cm`;
}

/** Secondary stat variant without the unit spelled out twice. */
export function formatFishLengthShort(meters: number, system: UnitsSystem): string {
  return system === 'imperial' ? `${(meters * 39.3701).toFixed(1)}"` : `${(meters * 100).toFixed(1)}cm`;
}

/** Weight: `2 lb 4 oz` / `1.02 kg` (used from M4 on). */
export function formatFishWeight(kg: number, system: UnitsSystem): string {
  if (system === 'imperial') {
    const totalOz = kg * 35.27396;
    const lb = Math.floor(totalOz / 16);
    const oz = Math.round(totalOz - lb * 16);
    return lb > 0 ? `${lb} lb ${oz} oz` : `${oz} oz`;
  }
  return kg >= 1 ? `${kg.toFixed(2)} kg` : `${Math.round(kg * 1000)} g`;
}
