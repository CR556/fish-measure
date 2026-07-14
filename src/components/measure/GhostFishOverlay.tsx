import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useReducer, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useSyncExternalStore } from 'react';

import { bestRotationOffset } from '../../lib/ghostPath';
import { measurementStore, subjectStore } from '../../stores/fishStores';

const MORPH_MS = 350;

function easeOutCubic(p: number) {
  const q = 1 - p;
  return 1 - q * q * q;
}

function pathFromFlat(flat: number[], close: boolean) {
  const path = Skia.Path.Make();
  if (flat.length < 6) return path;
  path.moveTo(flat[0], flat[1]);
  for (let i = 2; i + 1 < flat.length; i += 2) {
    path.lineTo(flat[i], flat[i + 1]);
  }
  if (close) path.close();
  return path;
}

type Props = {
  /** Precomputed ghost outline for this view size (flat view points). */
  ghostFlat: number[];
};

/**
 * The signature interaction: a ghost fish floats on screen; when the pipeline
 * finds a real fish, the ghost morphs onto its live contour (per-vertex lerp —
 * ghost and contour share point count and arc-length parameterization).
 * Subscribes to the external stores directly so only this canvas re-renders
 * at native cadence.
 */
export function GhostFishOverlay({ ghostFlat }: Props) {
  const subject = useSyncExternalStore(subjectStore.subscribe, subjectStore.get);
  const measurement = useSyncExternalStore(measurementStore.subscribe, measurementStore.get);
  const [, tick] = useReducer((x: number) => x + 1, 0);

  const morphStart = useRef(0);
  const rotation = useRef(0);
  const prevHadFish = useRef(false);

  const state = subject?.state ?? 'none';
  const live = subject?.contour;
  // Morph only with some fish evidence: a rock/shoe candidate keeps the
  // ghost instead of getting a misleading yellow outline.
  const fishEvidence = state === 'locked' || (subject?.fishScore ?? 0) >= 0.06;
  const hasFish =
    state !== 'none' &&
    fishEvidence &&
    !!live &&
    live.length >= 6 &&
    live.length === ghostFlat.length;

  if (hasFish && !prevHadFish.current) {
    morphStart.current = Date.now();
    rotation.current = bestRotationOffset(ghostFlat, live!);
  }
  prevHadFish.current = hasFish;

  const progress = hasFish
    ? easeOutCubic(Math.min(1, (Date.now() - morphStart.current) / MORPH_MS))
    : 0;

  // Keep RAF ticking only while the morph animates.
  const morphing = hasFish && progress < 1;
  useEffect(() => {
    if (!morphing) return;
    const id = requestAnimationFrame(() => tick());
    return () => cancelAnimationFrame(id);
  });

  let outline;
  if (!hasFish) {
    outline = (
      <Path path={pathFromFlat(ghostFlat, true)} style="stroke" strokeWidth={2.5} color="rgba(255,255,255,0.75)">
        <DashPathEffect intervals={[10, 7]} />
      </Path>
    );
  } else {
    const n = ghostFlat.length / 2;
    const flat = new Array<number>(ghostFlat.length);
    for (let i = 0; i < n; i++) {
      const j = (i + rotation.current / 2) % n;
      const gx = ghostFlat[i * 2];
      const gy = ghostFlat[i * 2 + 1];
      const lx = live![j * 2];
      const ly = live![j * 2 + 1];
      flat[i * 2] = gx + (lx - gx) * progress;
      flat[i * 2 + 1] = gy + (ly - gy) * progress;
    }
    const color = state === 'locked' ? '#30d158' : '#ffd60a';
    const path = pathFromFlat(flat, true);
    outline = (
      <>
        <Path path={path} style="fill" color={state === 'locked' ? 'rgba(48,209,88,0.12)' : 'rgba(255,214,10,0.08)'} />
        <Path path={path} style="stroke" strokeWidth={3} color={color} />
      </>
    );
  }

  const spine =
    hasFish && state === 'locked' && measurement?.valid && measurement.centerline
      ? pathFromFlat(measurement.centerline, false)
      : null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {outline}
      {spine ? (
        <Path path={spine} style="stroke" strokeWidth={2} color="rgba(100,210,255,0.9)">
          <DashPathEffect intervals={[6, 5]} />
        </Path>
      ) : null}
    </Canvas>
  );
}
