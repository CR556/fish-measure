import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiSuggestion } from '../../db/types';
import { speciesName } from '../../data/species';

type Props = {
  suggestions: AiSuggestion[];
  activeSpeciesId: string | null;
  onPick: (speciesId: string) => void;
};

/** AI top-3 species chips with confidence; tap to accept. */
export function SpeciesSuggestions({ suggestions, activeSpeciesId, onPick }: Props) {
  if (!suggestions.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Suggested</Text>
      <View style={styles.chips}>
        {suggestions.map((s) => {
          const active = s.speciesId === activeSpeciesId;
          return (
            <Pressable
              key={s.speciesId}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onPick(s.speciesId)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {speciesName(s.speciesId)}
              </Text>
              <Text style={[styles.conf, active && styles.chipTextActive]}>
                {Math.round(s.confidence * 100)}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6 },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: { backgroundColor: '#30d158' },
  chipText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: '#003a12' },
  conf: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontVariant: ['tabular-nums'] },
});
