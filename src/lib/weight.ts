import { speciesById } from '../data/species';

const M_PER_IN = 0.0254;
const LB_PER_KG = 2.2046226;

/**
 * Girth-based estimator, the classic angler formula:
 *   W(lb) = L(in) · G(in)² / K
 * K = 800 is the widely published general constant for fusiform fish; it is
 * the default for every family here. Per-family K refinement is a future
 * calibration item (the girthFamily field is already carried in the species
 * data for it). This path only needs the LiDAR girth, so it works for any
 * species — including those without bundled Ws coefficients.
 */
const GIRTH_K = 800;

export type WeightEstimate = {
  kg: number;
  /** Human-readable formula tag shown as "formula used". */
  formula: string;
  /** True when the estimate rests on unverified/approximate constants. */
  approximate: boolean;
};

/**
 * Best weight estimate for a catch. Prefers the girth formula when a girth
 * measurement exists (auto mode), else the species standard-weight curve,
 * else null (manual capture of an unidentified fish with no girth).
 */
export function estimateWeight(params: {
  speciesId: string | null;
  lengthCurvedM: number;
  girthM: number | null;
}): WeightEstimate | null {
  const { speciesId, lengthCurvedM, girthM } = params;
  if (lengthCurvedM <= 0) return null;

  if (girthM != null && girthM > 0) {
    const lIn = lengthCurvedM / M_PER_IN;
    const gIn = girthM / M_PER_IN;
    const lb = (lIn * gIn * gIn) / GIRTH_K;
    return {
      kg: lb / LB_PER_KG,
      formula: 'Girth: L·G²/800',
      approximate: true,
    };
  }

  const species = speciesById(speciesId);
  if (species?.ws) {
    const tlMm = lengthCurvedM * 1000;
    const log10Ws = species.ws.a + species.ws.b * Math.log10(tlMm);
    const grams = Math.pow(10, log10Ws);
    if (Number.isFinite(grams) && grams > 0) {
      return {
        kg: grams / 1000,
        formula: `Standard weight (${species.common})`,
        approximate: !species.wsVerified,
      };
    }
  }

  return null;
}
