import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Placeholder — the catch log list (filters, sorts, thumbnails) lands in M6. */
export function LogScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Catch Log</Text>
      <Text style={styles.body}>Your kept catches will show up here, newest first.</Text>
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
