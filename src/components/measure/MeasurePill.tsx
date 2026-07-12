import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatFishLength, formatFishLengthShort, UnitsSystem } from '../../lib/fishUnits';
import { measurementStore, subjectStore } from '../../stores/fishStores';
import { useThrottledStore } from '../../hooks/useThrottledStore';

type Props = {
  unitsSystem: UnitsSystem;
  onPress: () => void;
  onLongPress: () => void;
};

/** Pinned top pill: the headline curve-corrected length + state coaching. */
export function MeasurePill({ unitsSystem, onPress, onLongPress }: Props) {
  const insets = useSafeAreaInsets();
  const subject = useThrottledStore(subjectStore, 120);
  const m = useThrottledStore(measurementStore, 120);

  const state = subject?.state ?? 'none';
  const showLength = state !== 'none' && !!m?.valid;

  let hint: string;
  if (state === 'none') {
    hint = 'Line the outline up on the fish';
  } else if (!m?.valid) {
    hint = 'Fish found — reading depth…';
  } else if (m.stable) {
    hint = 'Steady — measurement locked';
  } else {
    hint = 'Hold steady…';
  }

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable onPress={onPress} onLongPress={onLongPress} style={styles.pill}>
        {showLength ? (
          <View style={styles.column}>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: m!.stable ? '#30d158' : '#ffd60a' }]} />
              <Text style={styles.value}>{formatFishLength(m!.curvedM, unitsSystem)}</Text>
            </View>
            <Text style={styles.sub}>
              straight {formatFishLengthShort(m!.chordM, unitsSystem)}
              {m!.girthM ? ` · girth ${formatFishLengthShort(m!.girthM, unitsSystem)}` : ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>{hint}</Text>
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
    paddingVertical: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  column: {
    alignItems: 'center',
    gap: 2,
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
  sub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    paddingVertical: 6,
  },
});
