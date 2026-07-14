import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { measurementStore } from '../../stores/fishStores';
import { useThrottledStore } from '../../hooks/useThrottledStore';

const RING = 84;
const STABLE_TARGET_MS = 900;

type Props = {
  mode: 'auto' | 'manual';
  manualPointCount: number;
  onCapture: () => void;
  onToggleMode: () => void;
  onClear: () => void;
};

/**
 * Shutter (always available, per spec) with a stability ring that fills as
 * the measurement stays steady — when it completes, auto-capture fires (if
 * enabled in settings).
 */
export function CaptureControls({ mode, manualPointCount, onCapture, onToggleMode, onClear }: Props) {
  const m = useThrottledStore(measurementStore, 100);
  const progress =
    mode === 'auto' && m?.valid ? Math.min(1, (m.stable ? m.stableForMs : 0) / STABLE_TARGET_MS) : 0;

  const ring = Skia.Path.Make();
  ring.addArc(
    { x: 5, y: 5, width: RING - 10, height: RING - 10 },
    -90,
    360 * progress
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.side} onPress={onToggleMode}>
        <Text style={styles.sideText}>{mode === 'auto' ? 'Manual' : 'Auto'}</Text>
      </Pressable>

      <View style={styles.shutterWrap}>
        <Canvas style={{ width: RING, height: RING, position: 'absolute' }} pointerEvents="none">
          <Path
            path={ring}
            style="stroke"
            strokeWidth={4}
            strokeCap="round"
            color="#30d158"
          />
        </Canvas>
        <Pressable style={styles.shutter} onPress={onCapture}>
          <View style={styles.shutterInner} />
        </Pressable>
        {mode === 'manual' ? (
          <Text style={styles.pointLabel}>
            {manualPointCount >= 2 ? 'Save catch' : `Point ${manualPointCount + 1} of 2`}
          </Text>
        ) : null}
      </View>

      <Pressable style={styles.side} onPress={onClear}>
        <Text style={styles.sideText}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  shutterWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: RING - 16,
    height: RING - 16,
    borderRadius: (RING - 16) / 2,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutterInner: {
    width: RING - 34,
    height: RING - 34,
    borderRadius: (RING - 34) / 2,
    backgroundColor: '#fff',
  },
  pointLabel: {
    position: 'absolute',
    bottom: -18,
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  side: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 76,
    alignItems: 'center',
  },
  sideText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
