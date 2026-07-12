import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { patchDraft } from '../capture/draft';
import { updateCatch } from '../db/catchRepo';
import { searchSpecies, SPECIES, speciesById } from '../data/species';
import type { SpeciesDef } from '../data/species';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SpeciesPicker'>;

type Section = { title: string; data: SpeciesDef[] };

export function SpeciesPickerScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const suggestions = route.params.suggestions ?? [];

  const sections = useMemo<Section[]>(() => {
    const results = searchSpecies(query);
    if (query.trim()) {
      return [{ title: 'Results', data: results }];
    }
    const out: Section[] = [];
    const suggested = suggestions
      .map((id) => speciesById(id))
      .filter((s): s is SpeciesDef => !!s);
    if (suggested.length) out.push({ title: 'Suggested', data: suggested });
    out.push({
      title: 'All species',
      data: SPECIES.filter((s) => s.id !== 'other'),
    });
    const other = speciesById('other');
    if (other) out.push({ title: '', data: [other] });
    return out;
  }, [query, suggestions]);

  const choose = (id: string | null) => {
    if (route.params.target === 'draft') {
      patchDraft(route.params.draftId, { speciesId: id });
    } else {
      updateCatch(route.params.catchId, {
        speciesId: id,
        speciesSource: 'user',
        userCorrected: true,
      });
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search fish…"
          placeholderTextColor="rgba(255,255,255,0.4)"
          autoFocus
          autoCorrect={false}
        />
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => choose(item.id === 'other' ? null : item.id)}>
            <View>
              <Text style={styles.common}>{item.common}</Text>
              {item.scientific ? <Text style={styles.scientific}>{item.scientific}</Text> : null}
            </View>
          </Pressable>
        )}
        ListFooterComponent={<View style={{ height: insets.bottom + 20 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  search: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
  },
  cancel: { color: '#0a84ff', fontSize: 16 },
  sectionHeader: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  common: { color: '#fff', fontSize: 16 },
  scientific: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontStyle: 'italic', marginTop: 1 },
});
