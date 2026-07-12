import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { catchRevision } from '../capture/idQueue';
import { speciesName } from '../data/species';
import { listLocatedCatches } from '../db/catchRepo';
import { formatFishLength } from '../lib/fishUnits';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../stores/settingsStore';

function regionFor(points: { lat: number; lon: number }[]): Region | undefined {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.02, (maxLon - minLon) * 1.5),
  };
}

/** Apple Maps with a pin per located catch; tap a callout to open detail. */
export function MapScreen() {
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [settings] = useSettings();
  const rev = useSyncExternalStore(catchRevision.subscribe, catchRevision.get);
  const mapRef = useRef<MapView>(null);

  const located = useMemo(
    () => listLocatedCatches().filter((c) => c.lat != null && c.lon != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isFocused, rev]
  );

  const region = useMemo(
    () => regionFor(located.map((c) => ({ lat: c.lat as number, lon: c.lon as number }))),
    [located]
  );

  useEffect(() => {
    if (region && mapRef.current) {
      mapRef.current.animateToRegion(region, 350);
    }
  }, [region]);

  if (located.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No tagged catches</Text>
        <Text style={styles.emptyBody}>
          Catches kept with location on will appear here on the map.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={region}>
        {located.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.lat as number, longitude: c.lon as number }}
            title={speciesName(c.speciesId)}
            description={formatFishLength(c.lengthCurvedM, settings.unitsSystem)}
            onCalloutPress={() => navigation.navigate('CatchDetail', { catchId: c.id })}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  empty: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  emptyBody: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },
});
