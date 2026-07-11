import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TrackingStateEvent } from '../../modules/fish-measure';
import { FishMeasureView } from '../../modules/fish-measure';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import { useUnits } from '../hooks/useUnits';

/**
 * M0 harness: proves the renamed native module end-to-end (session start,
 * crosshair distance events, tracking states) inside the tab shell. The fish
 * pipeline UI (ghost outline, morph, length pill, capture) replaces this in
 * M1/M2. The AR view mounts only while this tab is focused — that unmount is
 * what stops the ARSession, so battery survives time spent in the Log/Map.
 */
export function MeasureScreen() {
  const isFocused = useIsFocused();
  const { unit, cycleUnit } = useUnits();
  const { event, stale, onDistance } = useDistanceFeed();
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });

  const onTrackingState = useCallback(
    (e: { nativeEvent: TrackingStateEvent }) => setTracking(e.nativeEvent),
    []
  );

  return (
    <View style={styles.container}>
      {isFocused ? (
        <FishMeasureView
          style={StyleSheet.absoluteFill}
          mode="rearCrosshair"
          updateHz={30}
          showNativeMarkers={false}
          onDistance={onDistance}
          onTrackingState={onTrackingState}
        />
      ) : null}
      <CrosshairOverlay />
      <DistanceReadout
        meters={event?.meters ?? null}
        confidence={event?.confidence ?? null}
        stale={stale}
        unit={unit}
        tracking={tracking}
        onPress={cycleUnit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
