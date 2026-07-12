import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { speciesName } from '../../data/species';
import type { CatchSort } from '../../db/types';

const SORTS: { id: CatchSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'lengthDesc', label: 'Longest' },
  { id: 'lengthAsc', label: 'Shortest' },
  { id: 'weightDesc', label: 'Heaviest' },
];

type Props = {
  sort: CatchSort;
  onSort: (s: CatchSort) => void;
  speciesOptions: string[];
  selectedSpecies: string[];
  onToggleSpecies: (id: string) => void;
  onClear: () => void;
};

/** Horizontal sort chips + a species-filter sheet. Date/length range live
 *  in the sheet too; kept compact for a phone. */
export function FilterSortBar({
  sort,
  onSort,
  speciesOptions,
  selectedSpecies,
  onToggleSpecies,
  onClear,
}: Props) {
  const [sheet, setSheet] = useState(false);
  const filterCount = selectedSpecies.length;

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        {SORTS.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.chip, sort === s.id && styles.chipActive]}
            onPress={() => onSort(s.id)}
          >
            <Text style={[styles.chipText, sort === s.id && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, filterCount > 0 && styles.chipActive]}
          onPress={() => setSheet(true)}
        >
          <Text style={[styles.chipText, filterCount > 0 && styles.chipTextActive]}>
            Species{filterCount > 0 ? ` (${filterCount})` : ''}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter by species</Text>
            <Pressable onPress={onClear}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.sheetList}>
            {speciesOptions.length === 0 ? (
              <Text style={styles.emptyFilter}>No species recorded yet.</Text>
            ) : (
              speciesOptions.map((id) => {
                const active = selectedSpecies.includes(id);
                return (
                  <Pressable key={id} style={styles.filterRow} onPress={() => onToggleSpecies(id)}>
                    <Text style={styles.filterName}>{speciesName(id)}</Text>
                    <Text style={styles.check}>{active ? '✓' : ''}</Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          <Pressable style={styles.done} onPress={() => setSheet(false)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#000' },
  sorts: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: '#fff' },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#000' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  clear: { color: '#0a84ff', fontSize: 15 },
  sheetList: { paddingHorizontal: 16 },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filterName: { color: '#fff', fontSize: 15 },
  check: { color: '#30d158', fontSize: 16, fontWeight: '700' },
  emptyFilter: { color: 'rgba(255,255,255,0.5)', fontSize: 14, paddingVertical: 20 },
  done: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
