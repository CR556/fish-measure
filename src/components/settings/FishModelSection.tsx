import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { downloadFishModel, fishModelStore, removeFishModel } from '../../lib/fishModel';
import { useSettings } from '../../stores/settingsStore';

/** Download/manage the custom fish segmentation model (no rebuild needed). */
export function FishModelSection() {
  const state = useSyncExternalStore(fishModelStore.subscribe, fishModelStore.get);
  const [settings, update] = useSettings();

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Fish detection model</Text>
      <Text style={styles.hint}>
        A fish-trained detector that replaces Apple's generic one — better at held fish and busy
        backgrounds. Downloads once (~10–20 MB) and runs fully on-device.
      </Text>

      {state.status === 'ready' ? (
        <>
          <View style={styles.row}>
            <Text style={styles.ok}>
              ✓ Downloaded ({(state.bytes / 1024 / 1024).toFixed(1)} MB)
            </Text>
            <Pressable onPress={removeFishModel}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Use it for detection</Text>
            <Switch
              value={settings.customModelEnabled}
              onValueChange={(v) => update({ customModelEnabled: v })}
              trackColor={{ true: '#30d158' }}
            />
          </View>
        </>
      ) : state.status === 'downloading' ? (
        <View style={styles.row}>
          <ActivityIndicator color="#0a84ff" />
          <Text style={styles.label}>Downloading…</Text>
        </View>
      ) : (
        <>
          {state.status === 'error' ? (
            <Text style={styles.error}>Download failed: {state.message}</Text>
          ) : null}
          <Pressable style={styles.download} onPress={() => void downloadFishModel()}>
            <Text style={styles.downloadText}>Download model</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 6, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  ok: { color: '#30d158', fontSize: 15 },
  remove: { color: '#ff453a', fontSize: 15 },
  error: { color: '#ff453a', fontSize: 13, marginTop: 10 },
  download: {
    marginTop: 14,
    backgroundColor: '#0a84ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  downloadText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
