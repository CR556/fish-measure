import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterSortBar } from '../components/log/FilterSortBar';
import { catchRevision } from '../capture/idQueue';
import { speciesName } from '../data/species';
import { distinctSpeciesIds, listCatches } from '../db/catchRepo';
import type { CatchSort } from '../db/types';
import { exportCatchesCsv } from '../lib/csv';
import { resolveCatchUri } from '../lib/files';
import { formatFishLength, formatFishWeight } from '../lib/fishUnits';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../stores/settingsStore';

/** Newest-first catch list with sort + species filter; taps open detail. */
export function LogScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [settings] = useSettings();
  const rev = useSyncExternalStore(catchRevision.subscribe, catchRevision.get);

  const [sort, setSort] = useState<CatchSort>('newest');
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);

  const speciesOptions = useMemo(
    () => distinctSpeciesIds(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isFocused, rev]
  );

  const rows = useMemo(
    () =>
      listCatches(
        selectedSpecies.length ? { speciesIds: selectedSpecies } : {},
        sort
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isFocused, rev, sort, selectedSpecies]
  );

  const toggleSpecies = (id: string) =>
    setSelectedSpecies((cur) => (cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Catches</Text>
        {rows.length > 0 ? (
          <Pressable onPress={() => exportCatchesCsv(rows)} hitSlop={10}>
            <Text style={styles.export}>Export CSV</Text>
          </Pressable>
        ) : null}
      </View>
      <FilterSortBar
        sort={sort}
        onSort={setSort}
        speciesOptions={speciesOptions}
        selectedSpecies={selectedSpecies}
        onToggleSpecies={toggleSpecies}
        onClear={() => setSelectedSpecies([])}
      />
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {selectedSpecies.length ? 'No matches' : 'No catches yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {selectedSpecies.length
              ? 'Try clearing the species filter.'
              : 'Kept catches land here, newest first.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('CatchDetail', { catchId: item.id })}
            >
              <Image source={{ uri: resolveCatchUri(item.thumbPath) }} style={styles.thumb} />
              <View style={styles.rowBody}>
                <Text style={styles.species}>{speciesName(item.speciesId)}</Text>
                <Text style={styles.stats}>
                  {formatFishLength(item.lengthCurvedM, settings.unitsSystem)}
                  {item.weightKg != null
                    ? ` · ${formatFishWeight(item.weightKg, settings.unitsSystem)}`
                    : ''}
                </Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  export: { color: '#0a84ff', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#111' },
  rowBody: { flex: 1, justifyContent: 'center', gap: 2 },
  species: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stats: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontVariant: ['tabular-nums'] },
  date: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600' },
  emptyBody: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },
});
