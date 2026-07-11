import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function UnsupportedDevice() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LiDAR not available</Text>
      <Text style={styles.body}>
        FishMeasure measures fish with the LiDAR sensor found on iPhone 12 Pro
        and later Pro models. This device has no LiDAR sensor, so measuring is
        not possible.
      </Text>
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
    gap: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  body: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
});
