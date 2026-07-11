import {
  Canvas,
  Circle,
  Line,
  matchFont,
  Path,
  Skia,
  Text as SkiaText,
  vec,
} from '@shopify/react-native-skia';
import React, { useSyncExternalStore } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { dist3, formatArea, polygonArea, Vec3 } from '../lib/geometry';
import { shapeColor } from '../lib/colors';
import { projectionStore } from '../lib/projectionStore';
import { formatDistance, Unit } from '../lib/units';

export type ChainPoint = { id: string; world: Vec3 };
export type Chain = { points: ChainPoint[]; closed: boolean };

type Props = {
  /** Completed shapes plus the in-progress chain (closed: false) last. */
  chains: Chain[];
  unit: Unit;
  /** Highlight the first point of the active chain as a snap target. */
  snapHint: boolean;
};

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const segmentFont = matchFont({ fontFamily, fontSize: 13, fontWeight: '500' });
const pointFont = matchFont({ fontFamily, fontSize: 10, fontWeight: '500' });
const areaFont = matchFont({ fontFamily, fontSize: 16, fontWeight: '700' });
type SkFont = ReturnType<typeof matchFont>;

/** Centered white text with a dark halo, as two Skia draw commands. */
function pushHaloText(
  out: React.ReactNode[],
  key: string,
  font: SkFont,
  cx: number,
  y: number,
  text: string
) {
  const x = cx - font.measureText(text).width / 2;
  out.push(
    <SkiaText
      key={`${key}-halo`}
      x={x}
      y={y}
      text={text}
      font={font}
      color="rgba(0,0,0,0.85)"
      style="stroke"
      strokeWidth={3}
    />,
    <SkiaText key={key} x={x} y={y} text={text} font={font} color="#fff" />
  );
}

/**
 * Single Skia canvas: every line/fill/marker/label is a GPU draw command, not
 * a native view — this is what keeps 30 Hz updates cheap regardless of point
 * count (the react-native-svg version died at ~15 points).
 *
 * Subscribes directly to the 30 Hz projection store so per-frame updates
 * re-render only this canvas — never the parent screen.
 */
export function ShapesOverlay({ chains, unit, snapHint }: Props) {
  const projections = useSyncExternalStore(projectionStore.subscribe, projectionStore.get);

  const nodes: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];

  chains.forEach((chain, chainIndex) => {
    const projected = chain.points.map((p) => projections[p.id]);
    const isActive = chainIndex === chains.length - 1 && !chain.closed;
    const color = shapeColor(chainIndex);

    // Fill under everything else for this chain.
    if (chain.closed && chain.points.length >= 3) {
      const allVisible = projected.every((p) => p?.visible);
      if (allVisible) {
        const path = Skia.Path.Make();
        path.moveTo(projected[0].x, projected[0].y);
        for (let i = 1; i < projected.length; i++) {
          path.lineTo(projected[i].x, projected[i].y);
        }
        path.close();
        nodes.push(<Path key={`f-${chainIndex}`} path={path} color={color.fill} style="fill" />);

        const cx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
        const cy = projected.reduce((s, p) => s + p.y, 0) / projected.length;
        const area = polygonArea(chain.points.map((p) => p.world));
        pushHaloText(labels, `al-${chainIndex}`, areaFont, cx, cy + 5, formatArea(area, unit));
      }
    }

    // Segment lines + length labels.
    const segmentCount = chain.closed ? chain.points.length : chain.points.length - 1;
    for (let i = 0; i < segmentCount; i++) {
      const j = (i + 1) % chain.points.length;
      const a = projected[i];
      const b = projected[j];
      if (!a?.visible || !b?.visible) continue;
      nodes.push(
        <Line
          key={`l-${chainIndex}-${i}`}
          p1={vec(a.x, a.y)}
          p2={vec(b.x, b.y)}
          color={color.line}
          strokeWidth={2}
        />
      );
      const meters = dist3(chain.points[i].world, chain.points[j].world);
      pushHaloText(
        labels,
        `sl-${chainIndex}-${i}`,
        segmentFont,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2 - 8,
        formatDistance(meters, unit)
      );
    }

    // Point markers + per-point live camera distance.
    chain.points.forEach((point, i) => {
      const p = projected[i];
      if (!p?.visible) return;
      const isSnapTarget = isActive && i === 0 && snapHint;
      nodes.push(
        <Circle
          key={`m-${chainIndex}-${i}`}
          cx={p.x}
          cy={p.y}
          r={isSnapTarget ? 9 : 5}
          color={isSnapTarget ? color.fill : '#fff'}
        />,
        <Circle
          key={`mr-${chainIndex}-${i}`}
          cx={p.x}
          cy={p.y}
          r={isSnapTarget ? 9 : 5}
          color={isSnapTarget ? color.line : 'rgba(0,0,0,0.7)'}
          style="stroke"
          strokeWidth={2}
        />
      );
      pushHaloText(
        labels,
        `pl-${chainIndex}-${i}`,
        pointFont,
        p.x,
        p.y - 14,
        formatDistance(p.cameraMeters, unit)
      );
    });
  });

  return (
    <Canvas style={styles.overlay} pointerEvents="none">
      {nodes}
      {labels}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
