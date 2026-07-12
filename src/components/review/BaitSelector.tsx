import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BaitKind } from '../../db/types';

const OPTIONS: { id: BaitKind | null; label: string }[] = [
  { id: null, label: 'None' },
  { id: 'fly', label: 'Fly' },
  { id: 'grub', label: 'Grub' },
  { id: 'worm', label: 'Worm' },
  { id: 'lure', label: 'Lure' },
  { id: 'live', label: 'Live' },
  { id: 'other', label: 'Other' },
];

type Props = {
  value: BaitKind | null;
  onChange: (bait: BaitKind | null) => void;
};

/** Wrapping chip row for the bait on the line. */
export function BaitSelector({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.label}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(opt.id)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chipActive: {
    backgroundColor: '#0a84ff',
  },
  chipText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
  },
});
