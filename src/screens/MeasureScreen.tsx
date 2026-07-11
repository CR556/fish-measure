import { useIsFocused } from '@react-navigation/native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Paths } from 'expo-file-system';
import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  FishMeasureViewRef,
  SubjectEvent,
  FishMeasurementEvent,
  TrackingStateEvent,
} from '../../modules/fish-measure';
import { FishMeasureView } from '../../modules/fish-measure';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { measurementStore, subjectStore } from '../stores/fishStores';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import { useUnits } from '../hooks/useUnits';

/**
 * M1 verification harness (replaced by the real UX in M2): draws the live
 * contour + spine, streams the classifier top-5 for acceptLabels tuning,
 * exercises tap-to-hint, auto capture, and the manual two-point flow.
 */

function flatToPath(flat: number[] | undefined, close: boolean) {
  if (!flat || flat.length < 6) return null;
  const path = Skia.Path.Make();
  path.moveTo(flat[0], flat[1]);
  for (let i = 2; i + 1 < flat.length; i += 2) {
    path.lineTo(flat[i], flat[i + 1]);
  }
  if (close) path.close();
  return path;
}

/** Contour + spine, re-rendered from the store at native cadence. */
function FishOverlay() {
  const subject = useSyncExternalStore(subjectStore.subscribe, subjectStore.get);
  const measurement = useSyncExternalStore(measurementStore.subscribe, measurementStore.get);
  const contour = flatToPath(subject?.contour, true);
  const spine = flatToPath(measurement?.centerline, false);
  const locked = subject?.state === 'locked';
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {contour ? (
        <Path
          path={contour}
          style="stroke"
          strokeWidth={3}
          color={locked ? '#30d158' : '#ffd60a'}
        />
      ) : null}
      {spine ? <Path path={spine} style="stroke" strokeWidth={2} color="#64d2ff" /> : null}
    </Canvas>
  );
}

function inches(m: number) {
  return (m * 39.3701).toFixed(1);
}

/** Numbers + classifier labels, ~10 Hz re-render of small text only. */
function DebugHud() {
  const subject = useSyncExternalStore(subjectStore.subscribe, subjectStore.get);
  const m = useSyncExternalStore(measurementStore.subscribe, measurementStore.get);
  return (
    <View style={styles.hud} pointerEvents="none">
      <Text style={styles.hudTitle}>
        {m?.valid
          ? `${(m.curvedM * 100).toFixed(1)} cm / ${inches(m.curvedM)} in  ${m.stable ? '● stable' : '○'}`
          : subject
            ? `state: ${subject.state}`
            : 'searching…'}
      </Text>
      {m?.valid ? (
        <Text style={styles.hudLine}>
          chord {(m.chordM * 100).toFixed(1)}cm · girth{' '}
          {m.girthM ? `${(m.girthM * 100).toFixed(1)}cm (${m.girthMethod})` : '—'} · cov{' '}
          {(m.depthCoverage * 100).toFixed(0)}% · {m.distanceM.toFixed(2)}m
        </Text>
      ) : null}
      {subject ? (
        <Text style={styles.hudLine}>
          inst {subject.instanceCount} · by {subject.selectedBy ?? '—'} · elong{' '}
          {subject.aspectRatio.toFixed(1)} · fish {subject.fishScore.toFixed(2)}
        </Text>
      ) : null}
      {subject?.classifierTop.map((c) => (
        <Text key={c.label} style={styles.hudLabel}>
          {c.label} {(c.confidence * 100).toFixed(0)}%
        </Text>
      ))}
    </View>
  );
}

export function MeasureScreen() {
  const isFocused = useIsFocused();
  const viewRef = useRef<FishMeasureViewRef>(null);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [status, setStatus] = useState('');
  const [anchorIds, setAnchorIds] = useState<string[]>([]);
  const { unit, cycleUnit } = useUnits();
  const { event: distanceEvent, stale, onDistance } = useDistanceFeed();
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });

  const onSubject = useCallback((e: { nativeEvent: SubjectEvent }) => {
    subjectStore.set(e.nativeEvent);
  }, []);
  const onFishMeasurement = useCallback((e: { nativeEvent: FishMeasurementEvent }) => {
    measurementStore.set(e.nativeEvent);
  }, []);
  const onTrackingState = useCallback(
    (e: { nativeEvent: TrackingStateEvent }) => setTracking(e.nativeEvent),
    []
  );

  const spikeDir = `${Paths.document.uri.replace(/^file:\/\//, '')}/spike/${Date.now()}`;

  const handleTap = useCallback((x: number, y: number) => {
    viewRef.current?.setTapHint(x, y).catch(() => {});
  }, []);

  const captureAuto = useCallback(async () => {
    try {
      const payload = await viewRef.current?.captureAutoCatch({ outputDir: spikeDir });
      if (!payload) {
        setStatus('capture: no valid measurement');
        return;
      }
      console.log('AUTO CAPTURE', JSON.stringify(payload).slice(0, 2000));
      setStatus(
        `captured ${(payload.curvedM * 100).toFixed(1)}cm (${payload.photoSource} ${payload.photoWidth}px)` +
          `${payload.plyPath ? ' +ply' : ''}${payload.maskPngPath ? ' +mask' : ''}`
      );
    } catch (e) {
      setStatus(`capture failed: ${String(e)}`);
    }
  }, [spikeDir]);

  const captureManualPoint = useCallback(async () => {
    const result = await viewRef.current?.measureAtPoint(190, 400); // near screen center; refined in M2
    if (!result) {
      setStatus('manual: no surface hit');
      return;
    }
    const ids = [...anchorIds, result.anchorId];
    setAnchorIds(ids);
    setStatus(`point ${ids.length} @ ${result.meters.toFixed(2)}m (${result.method})`);
    if (ids.length === 2) {
      const path = await viewRef.current?.measureManualPath(ids[0], ids[1], 64);
      if (path) {
        setStatus(
          `manual ${(path.curvedM * 100).toFixed(1)}cm curved / ${(path.chordM * 100).toFixed(1)}cm chord · valid ${(path.validFraction * 100).toFixed(0)}%`
        );
        const payload = await viewRef.current?.captureManualCatch(ids[0], ids[1], {
          outputDir: spikeDir,
          includePly: false,
          includeMaskPng: false,
        });
        if (payload) {
          console.log('MANUAL CAPTURE', JSON.stringify(payload).slice(0, 2000));
        }
      }
      await viewRef.current?.clearAnchors();
      setAnchorIds([]);
    }
  }, [anchorIds, spikeDir]);

  return (
    <View style={styles.container}>
      {isFocused ? (
        <FishMeasureView
          ref={viewRef}
          style={StyleSheet.absoluteFill}
          mode={mode}
          updateHz={30}
          debugMode
          onSubject={onSubject}
          onFishMeasurement={onFishMeasurement}
          onDistance={onDistance}
          onTrackingState={onTrackingState}
          onError={(e) => setStatus(`error: ${e.nativeEvent.code}`)}
        />
      ) : null}

      {mode === 'auto' ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => handleTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
          />
          <FishOverlay />
          <DebugHud />
        </>
      ) : (
        <>
          <CrosshairOverlay />
          <DistanceReadout
            meters={distanceEvent?.meters ?? null}
            confidence={distanceEvent?.confidence ?? null}
            stale={stale}
            unit={unit}
            tracking={tracking}
            onPress={cycleUnit}
          />
        </>
      )}

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.controls}>
        <Pressable
          style={styles.button}
          onPress={() => {
            setMode((m) => (m === 'auto' ? 'manual' : 'auto'));
            setAnchorIds([]);
            viewRef.current?.clearAnchors().catch(() => {});
          }}
        >
          <Text style={styles.buttonText}>{mode === 'auto' ? 'Manual' : 'Auto'}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.capture]}
          onPress={mode === 'auto' ? captureAuto : captureManualPoint}
        >
          <Text style={styles.buttonText}>{mode === 'auto' ? 'Capture' : `Point ${anchorIds.length + 1}`}</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => {
            viewRef.current?.clearSubject().catch(() => {});
            viewRef.current?.clearAnchors().catch(() => {});
            setAnchorIds([]);
            setStatus('');
          }}
        >
          <Text style={styles.buttonText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  hud: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    padding: 10,
  },
  hudTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hudLine: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  hudLabel: {
    color: '#ffd60a',
    fontSize: 12,
  },
  status: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
  },
  controls: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  capture: {
    backgroundColor: 'rgba(48,209,88,0.85)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
