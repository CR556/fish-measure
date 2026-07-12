/**
 * The "ghost" fish outline shown while searching. Generated parametrically at
 * the same point count and arc-length parameterization the native contour
 * uses (contourMaxPoints), so the ghost→fish morph is a per-vertex lerp.
 */

export type Point = { x: number; y: number };

/** Closed fish silhouette in unit space: x 0(nose)→1(tail tip), y centered on 0. */
function unitFish(): Point[] {
  const top: Point[] = [];
  const bottom: Point[] = [];
  const BODY_END = 0.78; // where the peduncle meets the tail fin
  const STEPS = 44;

  for (let i = 0; i <= STEPS; i++) {
    const x = (i / STEPS) * BODY_END;
    const t = x / BODY_END;
    // Deep-bodied profile, fuller forward of center, tapering to the peduncle.
    const half = 0.19 * Math.pow(Math.sin(Math.PI * Math.min(0.94, 0.08 + t * 0.86)), 0.75) + 0.015;
    top.push({ x, y: -half });
    bottom.push({ x, y: half });
  }

  // Forked tail: peduncle → upper lobe tip → notch → lower lobe tip → peduncle.
  const tail: Point[] = [
    { x: BODY_END, y: -0.045 },
    { x: 0.92, y: -0.1 },
    { x: 1.0, y: -0.155 },
    { x: 0.93, y: 0 },
    { x: 1.0, y: 0.155 },
    { x: 0.92, y: 0.1 },
    { x: BODY_END, y: 0.045 },
  ];

  return [...top, ...tail, ...bottom.reverse()];
}

/** Uniform arc-length resampling of a closed polygon (mirror of the Swift side). */
export function resampleClosed(points: Point[], count: number): Point[] {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(total);
  }
  if (total <= 1e-9) return points.slice(0, count);

  const out: Point[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / count;
    while (seg < points.length - 1 && lengths[seg + 1] < target) seg++;
    const a = points[seg];
    const b = points[(seg + 1) % points.length];
    const segLen = lengths[seg + 1] - lengths[seg];
    const t = segLen > 1e-9 ? (target - lengths[seg]) / segLen : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

export type GhostLayout = {
  /** Flat [x0,y0,…] view points, exactly `pointCount` vertices. */
  flat: number[];
  /** Normalized view rect for the native priorityRegion prop. */
  regionNorm: { x: number; y: number; w: number; h: number };
};

/**
 * Ghost outline laid out for a view: horizontal fish, 72% of the view width,
 * centered slightly above middle (controls live at the bottom).
 */
export function ghostForView(viewWidth: number, viewHeight: number, pointCount: number): GhostLayout {
  const unit = resampleClosed(unitFish(), pointCount);
  const fishWidth = viewWidth * 0.72;
  const scale = fishWidth; // unit fish is 1 long
  const cx = viewWidth / 2;
  const cy = viewHeight * 0.44;

  const flat: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of unit) {
    const x = cx + (p.x - 0.5) * scale;
    const y = cy + p.y * scale;
    flat.push(x, y);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const pad = 30;
  return {
    flat,
    regionNorm: {
      x: Math.max(0, (minX - pad) / viewWidth),
      y: Math.max(0, (minY - pad) / viewHeight),
      w: Math.min(1, (maxX - minX + 2 * pad) / viewWidth),
      h: Math.min(1, (maxY - minY + 2 * pad) / viewHeight),
    },
  };
}

/**
 * Rotates `live` (flat closed polygon) so its vertices best correspond to
 * `ghost` before morphing — the native contour's start vertex is arbitrary.
 * Coarse search is plenty: this only affects morph aesthetics.
 */
export function bestRotationOffset(ghost: number[], live: number[]): number {
  const n = Math.min(ghost.length, live.length) / 2;
  if (n < 8) return 0;
  let bestOffset = 0;
  let bestCost = Infinity;
  for (let offset = 0; offset < n; offset += 2) {
    let cost = 0;
    for (let i = 0; i < n; i += 6) {
      const j = (i + offset) % n;
      const dx = ghost[i * 2] - live[j * 2];
      const dy = ghost[i * 2 + 1] - live[j * 2 + 1];
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = offset;
    }
  }
  return bestOffset;
}
