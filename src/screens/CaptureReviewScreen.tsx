import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BaitSelector } from '../components/review/BaitSelector';
import { EditableStat } from '../components/review/EditableStat';
import { KeepDiscardBar } from '../components/review/KeepDiscardBar';
import { draftRevision, getDraft, patchDraft } from '../capture/draft';
import { discardDraft, keepCatch } from '../capture/persist';
import { speciesName } from '../data/species';
import {
  formatFishLength,
  formatFishLengthShort,
  formatFishWeight,
} from '../lib/fishUnits';
import { getCatchLocation } from '../lib/location';
import { estimateWeight } from '../lib/weight';
import type { RootStackParamList } from '../navigation/types';
import { getSettings } from '../stores/settingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'CaptureReview'>;

const M_PER_IN = 0.0254;
const M_PER_CM = 0.01;

export function CaptureReviewScreen({ route, navigation }: Props) {
  const { draftId } = route.params;
  useSyncExternalStore(draftRevision.subscribe, draftRevision.get);
  const draft = getDraft(draftId);
  const [saving, setSaving] = useState(false);

  // Fetch GPS once, in the background, if enabled.
  useEffect(() => {
    if (!draft) return;
    if (!getSettings().gpsEnabled) return;
    if (draft.lat != null) return;
    let cancelled = false;
    getCatchLocation().then((loc) => {
      if (!cancelled && loc) {
        patchDraft(draftId, { lat: loc.lat, lon: loc.lon, locAccuracyM: loc.accuracyM });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftId, draft]);

  // Auto-recompute weight from length/girth/species unless the user typed one.
  const weightInputs = draft
    ? `${draft.lengthCurvedM}|${draft.girthM}|${draft.speciesId}|${draft.weightEdited}`
    : '';
  useEffect(() => {
    if (!draft || draft.weightEdited) return;
    const est = estimateWeight({
      speciesId: draft.speciesId,
      lengthCurvedM: draft.lengthCurvedM,
      girthM: draft.girthM,
    });
    const nextKg = est?.kg ?? null;
    const nextFormula = est?.formula ?? null;
    if (nextKg !== draft.weightKg || nextFormula !== draft.weightFormula) {
      patchDraft(draftId, { weightKg: nextKg, weightFormula: nextFormula });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightInputs]);

  const onDiscard = useCallback(() => {
    if (draft) discardDraft(draft);
    navigation.goBack();
  }, [draft, navigation]);

  const onKeep = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const id = await keepCatch(draft);
      // Land on the fresh catch's detail (replaces the modal in the stack).
      navigation.replace('CatchDetail', { catchId: id });
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', String(e));
    }
  }, [draft, saving, navigation]);

  if (!draft) {
    // Draft was consumed (e.g. hot reload) — nothing to review.
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>This capture is no longer available.</Text>
      </View>
    );
  }

  const system = getSettings().unitsSystem;
  const lengthUnit = system === 'imperial' ? 'in' : 'cm';
  const lengthToM = system === 'imperial' ? M_PER_IN : M_PER_CM;
  const lengthDisplay =
    system === 'imperial'
      ? (draft.lengthCurvedM / M_PER_IN).toFixed(1)
      : (draft.lengthCurvedM * 100).toFixed(1);
  const girthDisplay =
    draft.girthM == null
      ? ''
      : system === 'imperial'
        ? (draft.girthM / M_PER_IN).toFixed(1)
        : (draft.girthM * 100).toFixed(1);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Image
          source={{
            uri: draft.photoAbsPath.startsWith('file://')
              ? draft.photoAbsPath
              : `file://${draft.photoAbsPath}`,
          }}
          style={styles.photo}
          resizeMode="cover"
        />

        <View style={styles.headline}>
          <Text style={styles.headlineValue}>{formatFishLength(draft.lengthCurvedM, system)}</Text>
          <Text style={styles.headlineSub}>
            {draft.measureMode === 'auto' ? 'Auto' : 'Manual'} · straight{' '}
            {formatFishLengthShort(draft.lengthChordM, system)}
            {draft.weightKg != null ? ` · ${formatFishWeight(draft.weightKg, system)}` : ''}
          </Text>
        </View>

        <View style={styles.section}>
          <Pressable
            style={styles.speciesButton}
            onPress={() => navigation.navigate('SpeciesPicker', { target: 'draft', draftId })}
          >
            <View>
              <Text style={styles.speciesLabel}>Species</Text>
              <Text style={styles.speciesValue}>
                {draft.speciesId ? speciesName(draft.speciesId) : 'Tap to choose'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Text style={styles.hint}>
            Automatic photo identification arrives with the cloud-ID update; you can set it by hand
            now, and the weight estimate updates with it.
          </Text>
        </View>

        <View style={styles.section}>
          <EditableStat
            label="Length (tip to tail)"
            value={lengthDisplay}
            unit={lengthUnit}
            editable
            onCommit={(v) =>
              patchDraft(draftId, { lengthCurvedM: v * lengthToM, lengthEdited: true })
            }
          />
          <EditableStat
            label="Girth (estimated)"
            value={girthDisplay}
            unit={lengthUnit}
            editable
            placeholder="—"
            onCommit={(v) => patchDraft(draftId, { girthM: v * lengthToM, girthEdited: true })}
          />
          <EditableStat
            label="Weight (estimated)"
            value={draft.weightKg != null ? formatFishWeight(draft.weightKg, system) : ''}
            unit=""
            placeholder={draft.girthM != null ? 'from girth' : 'set species'}
          />
          {draft.weightFormula ? (
            <Text style={styles.formulaTag}>{draft.weightFormula} · approximate</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bait</Text>
          <BaitSelector
            value={draft.bait}
            onChange={(bait) => patchDraft(draftId, { bait })}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notes}
            value={draft.notes}
            onChangeText={(notes) => patchDraft(draftId, { notes })}
            placeholder="Water, technique, conditions…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            multiline
          />
        </View>

        <Text style={styles.meta}>
          {draft.lat != null ? '📍 location tagged · ' : ''}
          photo {draft.photoWidth}×{draft.photoHeight} ({draft.photoSource})
          {draft.plyAbsPath ? ' · point cloud saved' : ''}
        </Text>
      </ScrollView>

      <KeepDiscardBar saving={saving} onDiscard={onDiscard} onKeep={onKeep} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#111',
  },
  headline: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headlineValue: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headlineSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  speciesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  speciesLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  speciesValue: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  chevron: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 26,
  },
  formulaTag: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    paddingTop: 8,
  },
  label: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12.5,
    marginTop: 6,
    lineHeight: 17,
  },
  notes: {
    color: '#fff',
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  meta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  empty: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
  },
});
