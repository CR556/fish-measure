import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { debugStore, measurementStore, subjectStore } from '../../stores/fishStores';
import { useThrottledStore } from '../../hooks/useThrottledStore';

/**
 * Field-tuning HUD (long-press the length pill to toggle). This is the M1
 * classifier label spike: the raw top-5 stream drives acceptLabels tuning.
 * Also the only visibility into native timings without an Xcode console.
 */
export function DebugHud() {
  const subject = useThrottledStore(subjectStore, 150);
  const m = useThrottledStore(measurementStore, 150);
  const d = useThrottledStore(debugStore, 300);

  return (
    <View style={styles.panel} pointerEvents="none">
      {subject ? (
        <Text style={styles.line}>
          state {subject.state} · inst {subject.instanceCount} · by {subject.selectedBy ?? '—'} ·
          area {(subject.areaFraction * 100).toFixed(1)}% · elong {subject.aspectRatio.toFixed(1)}
        </Text>
      ) : (
        <Text style={styles.line}>no subject</Text>
      )}
      {m?.valid ? (
        <Text style={styles.line}>
          raw {(m.rawCurvedM * 100).toFixed(1)}cm · cov {(m.depthCoverage * 100).toFixed(0)}% ·
          conf {m.confidence.toFixed(2)} · {m.distanceM.toFixed(2)}m · girth{' '}
          {m.girthM ? `${(m.girthM * 100).toFixed(1)}cm/${m.girthMethod}` : '—'}
        </Text>
      ) : null}
      <Text style={styles.line}>
        fishScore {subject ? subject.fishScore.toFixed(2) : '—'} · top5:
      </Text>
      {subject?.classifierTop.map((c) => (
        <Text key={c.label} style={styles.label}>
          {'  '}{c.label} {(c.confidence * 100).toFixed(0)}%
        </Text>
      ))}
      {d ? (
        <Text style={styles.line}>
          seg {d.segMs.toFixed(0)}ms · cl {d.centerlineMs.toFixed(0)}ms · lift{' '}
          {d.depthLiftMs.toFixed(0)}ms · vn {d.classifyMs.toFixed(0)}ms · drop {d.droppedFrames} ·{' '}
          {d.thermalState}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 120,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 8,
  },
  line: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: '#ffd60a',
    fontSize: 11,
  },
});
