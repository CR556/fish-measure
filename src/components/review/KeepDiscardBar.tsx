import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  saving: boolean;
  onDiscard: () => void;
  onKeep: () => void;
};

/** Red Back (discard, restart capture) + green Keep (store the catch). */
export function KeepDiscardBar({ saving, onDiscard, onKeep }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
      <Pressable style={[styles.button, styles.discard]} onPress={onDiscard} disabled={saving}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.keep]} onPress={onKeep} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Keep</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  button: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discard: {
    backgroundColor: '#ff3b30',
  },
  keep: {
    backgroundColor: '#30d158',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
