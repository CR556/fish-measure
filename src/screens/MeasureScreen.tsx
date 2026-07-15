import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  DebugInfoEvent,
  FishMeasurementEvent,
  FishMeasureViewRef,
  ProjectedPointsEvent,
  SubjectEvent,
  TrackingStateEvent,
} from '../../modules/fish-measure';
import { FishMeasureView } from '../../modules/fish-measure';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { CaptureControls } from '../components/measure/CaptureControls';
import { DebugHud } from '../components/measure/DebugHud';
import { GhostFishOverlay } from '../components/measure/GhostFishOverlay';
import { ManualOverlay } from '../components/measure/ManualOverlay';
import { MeasurePill } from '../components/measure/MeasurePill';
import { draftFromPayload, putDraft } from '../capture/draft';
import { catchOutputDir } from '../lib/files';
import { formatFishLength, formatFishLengthShort } from '../lib/fishUnits';
import { ghostForView } from '../lib/ghostPath';
import type { RootStackParamList } from '../navigation/types';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import {
  debugStore,
  measurementStore,
  projectedStore,
  subjectStore,
} from '../stores/fishStores';
import { getSettings, useSettings } from '../stores/settingsStore';

/** Must match the native overlay.contourMaxPoints so the morph is 1:1. */
const CONTOUR_POINTS = 120;
/** Ring fills over this much continuous stability, then auto-capture fires. */
const STABLE_FIRE_MS = 900;
const AUTO_CAPTURE_COOLDOWN_MS = 3500;

export function MeasureScreen() {
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const viewRef = useRef<FishMeasureViewRef>(null);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [viewSize, setViewSize] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [anchorIds, setAnchorIds] = useState<string[]>([]);
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });
  const [settings, updateSettings] = useSettings();
  const { event: distanceEvent, stale: distanceStale, onDistance } = useDistanceFeed();
  const lastAutoCaptureAt = useRef(0);
  const capturing = useRef(false);

  const ghost = useMemo(
    () => (viewSize ? ghostForView(viewSize.w, viewSize.h, CONTOUR_POINTS) : null),
    [viewSize]
  );

  // Binary-surface diagnostic: the M0 baseline IPA has none of the fish
  // methods; the Round 1 IPA has all of them. Logged to Metro on mount.
  useEffect(() => {
    if (!isFocused) return;
    const t = setTimeout(() => {
      const ref = viewRef.current as Record<string, unknown> | null;
      console.log('[diag] native surface:', {
        hasSetTapHint: typeof ref?.setTapHint === 'function',
        hasCaptureAutoCatch: typeof ref?.captureAutoCatch === 'function',
        hasMeasureAtPoint: typeof ref?.measureAtPoint === 'function',
        refKeys: ref ? Object.keys(ref).slice(0, 20) : null,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [isFocused, viewSize]);

  // Native events → external stores (never React state).
  const onSubject = useCallback((e: { nativeEvent: SubjectEvent }) => {
    subjectStore.set(e.nativeEvent);
  }, []);
  const onFishMeasurement = useCallback((e: { nativeEvent: FishMeasurementEvent }) => {
    measurementStore.set(e.nativeEvent);
  }, []);
  const onProjectedPoints = useCallback((e: { nativeEvent: ProjectedPointsEvent }) => {
    projectedStore.set(e.nativeEvent);
  }, []);
  const onDebugInfo = useCallback((e: { nativeEvent: DebugInfoEvent }) => {
    debugStore.set(e.nativeEvent);
  }, []);
  const onTrackingState = useCallback(
    (e: { nativeEvent: TrackingStateEvent }) => setTracking(e.nativeEvent),
    []
  );

  const openReview = useCallback(
    (
      id: string,
      payload: Parameters<typeof draftFromPayload>[1]
    ) => {
      const draft = draftFromPayload(id, payload, getSettings().unitsSystem);
      putDraft(draft);
      navigation.navigate('CaptureReview', { draftId: id });
    },
    [navigation]
  );

  const doAutoCapture = useCallback(async () => {
    if (capturing.current) return;
    capturing.current = true;
    try {
      const id = Crypto.randomUUID();
      const payload = await viewRef.current?.captureAutoCatch({ outputDir: catchOutputDir(id) });
      if (!payload) {
        setStatus('No solid measurement yet — get the outline to lock first');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      openReview(id, payload);
    } catch (e) {
      setStatus(`Capture failed: ${String(e)}`);
    } finally {
      capturing.current = false;
    }
  }, [openReview]);

  // Auto-capture: edge-detect the stability gate outside React renders.
  useEffect(() => {
    if (mode !== 'auto' || !isFocused) return;
    return measurementStore.subscribe(() => {
      const m = measurementStore.get();
      if (!m?.stable || m.stableForMs < STABLE_FIRE_MS) return;
      if (!getSettings().autoCapture) return;
      if (subjectStore.get()?.state !== 'locked') return;
      const now = Date.now();
      if (now - lastAutoCaptureAt.current < AUTO_CAPTURE_COOLDOWN_MS) return;
      lastAutoCaptureAt.current = now;
      void doAutoCapture();
    });
  }, [mode, isFocused, doAutoCapture]);

  // Manual flow: drop nose point, drop tail point (measures immediately),
  // then the user RE-FRAMES so the whole fish is in the picture and presses
  // Save — the anchors are pinned in world space, so the measurement holds
  // while the camera moves.
  const handleManualPoint = useCallback(async () => {
    if (!viewSize) return;

    if (anchorIds.length >= 2) {
      // Save: capture with the current (re-framed) camera view.
      if (capturing.current) return;
      capturing.current = true;
      try {
        const id = Crypto.randomUUID();
        const payload = await viewRef.current?.captureManualCatch(anchorIds[0], anchorIds[1], {
          outputDir: catchOutputDir(id),
          includePly: false,
          includeMaskPng: false,
        });
        await viewRef.current?.clearAnchors().catch(() => {});
        setAnchorIds([]);
        if (payload) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          openReview(id, payload);
        } else {
          setStatus('Could not capture — are both points still in front of you?');
        }
      } finally {
        capturing.current = false;
      }
      return;
    }

    const result = await viewRef.current?.measureAtPoint(viewSize.w / 2, viewSize.h / 2);
    if (!result) {
      setStatus('No surface under the crosshair — move a little');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const ids = [...anchorIds, result.anchorId];
    setAnchorIds(ids);
    if (ids.length < 2) {
      setStatus('Point 1 set — line up the tail tip');
      return;
    }
    const path = await viewRef.current?.measureManualPath(ids[0], ids[1], 64);
    const system = getSettings().unitsSystem;
    if (path) {
      setStatus(
        `${formatFishLength(path.curvedM, system)} · ${formatFishLengthShort(path.chordM, system)} straight — frame the whole fish, then Save`
      );
    } else {
      setStatus('Points set — frame the whole fish, then Save');
    }
  }, [anchorIds, viewSize, openReview]);

  const handleClear = useCallback(() => {
    viewRef.current?.clearSubject().catch(() => {});
    viewRef.current?.clearAnchors().catch(() => {});
    // Stale store values would leak between modes (the pill would show the
    // last auto measurement while in manual).
    subjectStore.set(null);
    measurementStore.set(null);
    projectedStore.set(null);
    setAnchorIds([]);
    setStatus('');
  }, []);

  const handleToggleMode = useCallback(() => {
    handleClear();
    setMode((m) => (m === 'auto' ? 'manual' : 'auto'));
  }, [handleClear]);

  // hz 7: subject-lift on-device runs ~80+ ms; at 10 Hz the vision queue
  // saturates and the overlay lags behind the camera. 7 Hz keeps headroom.
  const segmentationProp = useMemo(
    () => (ghost ? { hz: 7, priorityRegion: ghost.regionNorm } : { hz: 7 }),
    [ghost]
  );

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setViewSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {isFocused && viewSize ? (
        <FishMeasureView
          ref={viewRef}
          style={StyleSheet.absoluteFill}
          mode={mode}
          updateHz={30}
          showNativeMarkers={false}
          // Scene meshing only serves manual-mode raycast fallbacks (manual
          // anchors are depth-map-first now); off in auto = real perf headroom.
          enableSceneReconstruction={mode === 'manual'}
          segmentation={segmentationProp}
          overlay={{ contourMaxPoints: CONTOUR_POINTS, emitCenterline: true }}
          debugMode={showDebug}
          debugDepthOverlay={false}
          onSubject={onSubject}
          onFishMeasurement={onFishMeasurement}
          onProjectedPoints={onProjectedPoints}
          onDebugInfo={onDebugInfo}
          onDistance={onDistance}
          onTrackingState={onTrackingState}
          onError={(e) => {
            console.log('[diag] native error:', e.nativeEvent.code, e.nativeEvent.message);
            setStatus(`${e.nativeEvent.code}: ${e.nativeEvent.message}`);
          }}
        />
      ) : null}

      {mode === 'auto' ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => {
              viewRef.current
                ?.setTapHint(e.nativeEvent.locationX, e.nativeEvent.locationY)
                .catch(() => {});
            }}
          />
          {ghost ? <GhostFishOverlay ghostFlat={ghost.flat} /> : null}
        </>
      ) : (
        <>
          <CrosshairOverlay />
          <ManualOverlay />
        </>
      )}

      {mode === 'auto' ? (
        <MeasurePill
          unitsSystem={settings.unitsSystem}
          onPress={() =>
            updateSettings({
              unitsSystem: settings.unitsSystem === 'imperial' ? 'metric' : 'imperial',
            })
          }
          onLongPress={() => setShowDebug((v) => !v)}
        />
      ) : (
        <DistanceReadout
          meters={distanceEvent?.meters ?? null}
          confidence={distanceEvent?.confidence ?? null}
          stale={distanceStale}
          unit={settings.unitsSystem === 'imperial' ? 'ft' : 'm'}
          tracking={tracking}
          onPress={() =>
            updateSettings({
              unitsSystem: settings.unitsSystem === 'imperial' ? 'metric' : 'imperial',
            })
          }
          onLongPress={() => setShowDebug((v) => !v)}
        />
      )}

      {tracking.state !== 'normal' && tracking.state !== 'initializing' ? (
        <Text style={styles.trackingBanner}>
          {tracking.reason === 'excessiveMotion' ? 'Hold the phone steadier…' : 'Scanning…'}
        </Text>
      ) : null}

      {showDebug ? <DebugHud /> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <CaptureControls
        mode={mode}
        manualPointCount={anchorIds.length}
        onCapture={mode === 'auto' ? doAutoCapture : handleManualPoint}
        onToggleMode={handleToggleMode}
        onClear={handleClear}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  trackingBanner: {
    position: 'absolute',
    top: 96,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontSize: 13,
  },
  status: {
    position: 'absolute',
    bottom: 118,
    alignSelf: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    maxWidth: '86%',
    textAlign: 'center',
  },
});
