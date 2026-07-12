import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  label: string;
  /** Displayed value in the user's units (already formatted number). */
  value: string;
  unit: string;
  editable?: boolean;
  onCommit?: (parsed: number) => void;
  placeholder?: string;
};

/** One labelled stat row; taps into an inline numeric editor when editable. */
export function EditableStat({ label, value, unit, editable, onCommit, placeholder }: Props) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrap}>
        {editable ? (
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.35)"
            selectTextOnFocus
            onEndEditing={() => {
              const parsed = parseFloat(text.replace(',', '.'));
              if (!Number.isNaN(parsed) && onCommit) onCommit(parsed);
              else setText(value);
            }}
          />
        ) : (
          <Text style={styles.value}>{value || placeholder || '—'}</Text>
        )}
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  valueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  input: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 64,
    textAlign: 'right',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.4)',
  },
  unit: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    minWidth: 26,
  },
});
