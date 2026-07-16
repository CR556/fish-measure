import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiKeySection } from '../components/settings/ApiKeySection';
import { FishModelSection } from '../components/settings/FishModelSection';
import { useSettings } from '../stores/settingsStore';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [settings, update] = useSettings();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 60 }}
    >
      <Text style={styles.title}>Settings</Text>

      <Row label="Units">
        <View style={styles.segment}>
          {(['imperial', 'metric'] as const).map((system) => (
            <Pressable
              key={system}
              style={[styles.segmentItem, settings.unitsSystem === system && styles.segmentActive]}
              onPress={() => update({ unitsSystem: system })}
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.unitsSystem === system && styles.segmentTextActive,
                ]}
              >
                {system === 'imperial' ? 'in / lb' : 'cm / kg'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Row>

      <Row
        label="Auto capture"
        hint="Take the picture automatically once the measurement holds steady. The capture button always works either way."
      >
        <Switch
          value={settings.autoCapture}
          onValueChange={(v) => update({ autoCapture: v })}
          trackColor={{ true: '#30d158' }}
        />
      </Row>

      <Row
        label="Location on catches"
        hint="Tags each kept catch with GPS so it shows on the map. Stays on this phone."
      >
        <Switch
          value={settings.gpsEnabled}
          onValueChange={(v) => update({ gpsEnabled: v })}
          trackColor={{ true: '#30d158' }}
        />
      </Row>

      <Row
        label="Save photo to Photos on Keep"
        hint="Also add the catch photo to your photo library when you keep a catch."
      >
        <Switch
          value={settings.saveToPhotosOnKeep}
          onValueChange={(v) => update({ saveToPhotosOnKeep: v })}
          trackColor={{ true: '#30d158' }}
        />
      </Row>

      <View style={styles.divider} />
      <FishModelSection />
      <View style={styles.divider} />
      <ApiKeySection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 20,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12.5,
    marginTop: 3,
    lineHeight: 17,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 9,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#000',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 16,
  },
});
