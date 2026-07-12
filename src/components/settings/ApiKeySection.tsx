import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { aiKeyPresence, clearApiKey, getApiKey, setApiKey } from '../../lib/aiKey';
import { testApiKey } from '../../lib/claudeId';
import { useSettings } from '../../stores/settingsStore';

type TestState = 'idle' | 'testing' | 'ok' | 'bad';

/** API key entry (secure-store) + validity test + model choice. */
export function ApiKeySection() {
  const hasKey = useSyncExternalStore(aiKeyPresence.subscribe, aiKeyPresence.get);
  const [settings, update] = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [test, setTest] = useState<TestState>('idle');

  useEffect(() => {
    if (!hasKey) setEditing(true);
  }, [hasKey]);

  const onSave = async () => {
    setTest('testing');
    const ok = await testApiKey(draft.trim(), settings.aiModel).catch(() => false);
    if (ok) {
      await setApiKey(draft.trim());
      setDraft('');
      setEditing(false);
      setTest('ok');
    } else {
      setTest('bad');
    }
  };

  const onTestExisting = async () => {
    setTest('testing');
    const key = await getApiKey();
    if (!key) {
      setTest('bad');
      return;
    }
    const ok = await testApiKey(key, settings.aiModel).catch(() => false);
    setTest(ok ? 'ok' : 'bad');
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Fish identification (cloud)</Text>
      <Text style={styles.hint}>
        Uses your Anthropic API key to name the species and bait from the catch photo. Photos are
        sent only when you keep a catch; without a key, catches just save as Unknown and you pick the
        species by hand.
      </Text>

      {hasKey && !editing ? (
        <View style={styles.keyRow}>
          <Text style={styles.keySet}>🔑 Key saved</Text>
          <View style={styles.keyActions}>
            <Pressable onPress={onTestExisting}>
              <Text style={styles.link}>Test</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.link}>Replace</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await clearApiKey();
                setTest('idle');
              }}
            >
              <Text style={[styles.link, styles.danger]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="sk-ant-…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable
            style={[styles.saveButton, !draft.trim() && styles.saveDisabled]}
            onPress={onSave}
            disabled={!draft.trim() || test === 'testing'}
          >
            {test === 'testing' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Test & save</Text>
            )}
          </Pressable>
        </View>
      )}

      {test === 'ok' ? <Text style={styles.ok}>Key works.</Text> : null}
      {test === 'bad' ? <Text style={styles.bad}>That key didn’t work.</Text> : null}

      <View style={styles.modelRow}>
        <Text style={styles.modelLabel}>Model</Text>
        <View style={styles.segment}>
          {(['haiku', 'sonnet'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.segmentItem, settings.aiModel === m && styles.segmentActive]}
              onPress={() => update({ aiModel: m })}
            >
              <Text style={[styles.segmentText, settings.aiModel === m && styles.segmentTextActive]}>
                {m === 'haiku' ? 'Fast' : 'Higher accuracy'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12.5,
    marginTop: 6,
    lineHeight: 17,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  keySet: { color: '#30d158', fontSize: 15 },
  keyActions: { flexDirection: 'row', gap: 16 },
  link: { color: '#0a84ff', fontSize: 15 },
  danger: { color: '#ff453a' },
  input: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 15,
  },
  saveButton: {
    marginTop: 10,
    backgroundColor: '#0a84ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ok: { color: '#30d158', fontSize: 13, marginTop: 8 },
  bad: { color: '#ff453a', fontSize: 13, marginTop: 8 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  modelLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 9,
    padding: 2,
  },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: '#000' },
});
