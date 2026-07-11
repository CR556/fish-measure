import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Placeholder — the catch map (react-native-maps pins → detail) lands in M6. */
export function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Catch Map</Text>
      <Text style={styles.body}>A map of where every catch was caught.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '600' },
  body: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center' },
});
