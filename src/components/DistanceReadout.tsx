import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Confidence, TrackingStateEvent } from '../../modules/fish-measure';
import { formatDistance, Unit } from '../lib/units';

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: '#34c759',
  medium: '#ffcc00',
  low: '#ff3b30',
};

type Props = {
  meters: number | null;
  confidence: Confidence | null;
  stale: boolean;
  unit: Unit;
  tracking: TrackingStateEvent;
  onPress: () => void;
  onLongPress?: () => void;
  /** When set, replaces the camera-distance value (e.g. perimeter Â· area). */
  overrideText?: string | null;
};

function placeholderText(tracking: TrackingStateEvent): string {
  switch (tracking.state) {
    case 'initializing':
      return 'Move the phone to scanâ€¦';
    case 'limited':
      return tracking.reason === 'excessiveMotion'
        ? 'Hold the phone steadierâ€¦'
        : 'Scanning surroundingsâ€¦';
    case 'notAvailable':
      return 'Camera unavailable';
    default:
      return 'Aim at a surfaceâ€¦';
  }
}

export function DistanceReadout({
  meters,
  confidence,
  stale,
  unit,
  tracking,
  onPress,
  onLongPress,
  overrideText,
}: Props) {
  const insets = useSafeAreaInsets();
  const showValue = meters !== null && !stale;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.pill}>
        {overrideText != null ? (
          <Text style={styles.override}>{overrideText}</Text>
        ) : showValue ? (
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                { backgroundColor: CONFIDENCE_COLORS[confidence ?? 'low'] },
              ]}
            />
            <Text style={styles.value}>{formatDistance(meters, unit)}</Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>{placeholderText(tracking)}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  value: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 17,
  },
  override: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
