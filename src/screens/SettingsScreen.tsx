import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder — full settings (units, auto-capture, GPS, save-to-Photos,
 * cloud ID key) land in M3/M5. Units can already be cycled by tapping the
 * readout pill on the Measure tab.
 */
export function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.body}>Units, auto-capture, location, and fish-ID setup will live here.</Text>
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
