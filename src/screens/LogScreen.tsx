import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listCatches } from '../db/catchRepo';
import type { Catch } from '../db/types';
import { resolveCatchUri } from '../lib/files';
import { formatFishLength, formatFishWeight } from '../lib/fishUnits';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../stores/settingsStore';

/**
 * Newest-first catch list. M6 adds filters (species/date/length), sorts, and
 * the map tab; this version is the persistence-verification surface.
 */
export function LogScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [settings] = useSettings();
  const [rows, setRows] = useState<Catch[]>([]);

  useEffect(() => {
    if (isFocused) {
      setRows(listCatches());
    }
  }, [isFocused]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No catches yet</Text>
        <Text style={styles.emptyBody}>Kept catches land here, newest first.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('CatchDetail', { catchId: item.id })}
        >
          <Image source={{ uri: resolveCatchUri(item.thumbPath) }} style={styles.thumb} />
          <View style={styles.rowBody}>
            <Text style={styles.species}>{item.speciesId ?? 'Unknown species'}</Text>
            <Text style={styles.stats}>
              {formatFishLength(item.lengthCurvedM, settings.unitsSystem)}
              {item.weightKg != null
                ? ` · ${formatFishWeight(item.weightKg, settings.unitsSystem)}`
                : ''}
            </Text>
            <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#000',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  species: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stats: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  date: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  empty: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
});
