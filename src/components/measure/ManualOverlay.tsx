import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSyncExternalStore } from 'react';

import { projectedStore } from '../../stores/fishStores';

/** Manual-mode anchors + connecting segment, fed by onProjectedPoints. */
export function ManualOverlay() {
  const projected = useSyncExternalStore(projectedStore.subscribe, projectedStore.get);
  const visible = (projected?.points ?? []).filter((p) => p.visible);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {visible.length >= 2 ? (
        <Line
          p1={vec(visible[0].x, visible[0].y)}
          p2={vec(visible[1].x, visible[1].y)}
          color="rgba(255,255,255,0.9)"
          strokeWidth={2.5}
        />
      ) : null}
      {visible.map((p) => (
        <React.Fragment key={p.id}>
          <Circle cx={p.x} cy={p.y} r={8} color="rgba(48,209,88,0.35)" />
          <Circle cx={p.x} cy={p.y} r={4.5} color="#30d158" />
        </React.Fragment>
      ))}
    </Canvas>
  );
}
