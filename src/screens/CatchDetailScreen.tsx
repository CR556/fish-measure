import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShareSheet } from '../components/export/ShareSheet';
import { SpeciesSuggestions } from '../components/review/SpeciesSuggestions';
import { catchRevision, retryId } from '../capture/idQueue';
import { speciesName } from '../data/species';
import { deleteCatch, getCatch, updateCatch } from '../db/catchRepo';
import { isQueued } from '../db/idQueueRepo';
import { deleteCatchDir, resolveCatchUri } from '../lib/files';
import { estimateWeight } from '../lib/weight';
import { formatFishLength, formatFishLengthShort, formatFishWeight } from '../lib/fishUnits';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CatchDetail'>;

export function CatchDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { catchId } = route.params;
  const rev = useSyncExternalStore(catchRevision.subscribe, catchRevision.get);
  const [retrying, setRetrying] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Re-read whenever focus, the ID revision, or a retry changes.
  const item = React.useMemo(() => getCatch(catchId), [catchId, rev, isFocused, retrying]);
  const queued = React.useMemo(() => isQueued(catchId), [catchId, rev, isFocused, retrying]);

  const onDelete = useCallback(() => {
    Alert.alert('Delete catch', 'This removes the catch and its files.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCatch(catchId);
          deleteCatchDir(catchId);
          navigation.navigate('Tabs', { screen: 'Log' });
        },
      },
    ]);
  }, [catchId, navigation]);

  const acceptSpecies = useCallback(
    (speciesId: string) => {
      const current = getCatch(catchId);
      if (!current) return;
      const patch: Parameters<typeof updateCatch>[1] = {
        speciesId,
        speciesSource: 'user',
        userCorrected: true,
      };
      if (current.weightSource !== 'user') {
        const est = estimateWeight({
          speciesId,
          lengthCurvedM: current.lengthCurvedM,
          girthM: current.girthM,
        });
        if (est) {
          patch.weightKg = est.kg;
          patch.weightFormula = est.formula;
          patch.weightSource = 'auto';
        }
      }
      updateCatch(catchId, patch);
      catchRevision.set(catchRevision.get() + 1);
    },
    [catchId]
  );

  const onRetry = useCallback(async () => {
    setRetrying(true);
    await retryId(catchId);
    setRetrying(false);
    catchRevision.set(catchRevision.get() + 1);
  }, [catchId]);

  if (!item) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Catch not found.</Text>
      </View>
    );
  }

  const system = item.unitsAtCapture;
  const identifying = (queued || retrying) && item.speciesSource !== 'user';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <Image source={{ uri: resolveCatchUri(item.photoPath) }} style={styles.photo} resizeMode="cover" />
        <View style={styles.body}>
          <Text style={styles.length}>{formatFishLength(item.lengthCurvedM, system)}</Text>
          <Text style={styles.sub}>
            straight {formatFishLengthShort(item.lengthChordM, system)}
            {item.girthM != null ? ` · girth ${formatFishLengthShort(item.girthM, system)}` : ''}
            {item.weightKg != null ? ` · ${formatFishWeight(item.weightKg, system)}` : ''}
          </Text>
          {item.weightFormula ? <Text style={styles.formula}>{item.weightFormula} · approximate</Text> : null}

          <View style={styles.speciesRow}>
            <Text style={styles.species}>{speciesName(item.speciesId)}</Text>
            {identifying ? (
              <View style={styles.identifying}>
                <ActivityIndicator size="small" color="#0a84ff" />
                <Text style={styles.identifyingText}>identifying…</Text>
              </View>
            ) : null}
          </View>

          {item.aiSuggestions?.length ? (
            <SpeciesSuggestions
              suggestions={item.aiSuggestions}
              activeSpeciesId={item.speciesId}
              onPick={acceptSpecies}
            />
          ) : null}

          <Pressable
            style={styles.changeSpecies}
            onPress={() =>
              navigation.navigate('SpeciesPicker', {
                target: 'catch',
                catchId,
                suggestions: item.aiSuggestions?.map((s) => s.speciesId),
              })
            }
          >
            <Text style={styles.changeSpeciesText}>Change species</Text>
          </Pressable>

          {!queued && item.speciesSource !== 'user' && !item.aiSuggestions?.length ? (
            <Pressable style={styles.retry} onPress={onRetry} disabled={retrying}>
              <Text style={styles.retryText}>{retrying ? 'Identifying…' : 'Retry identification'}</Text>
            </Pressable>
          ) : null}

          {item.bait ? <Text style={styles.meta}>Bait: {item.bait}</Text> : null}
          {item.notes ? <Text style={styles.meta}>{item.notes}</Text> : null}
          <Text style={styles.meta}>
            {new Date(item.createdAt).toLocaleString()}
            {item.lat != null ? ' · 📍 tagged' : ''}
          </Text>

          <Pressable style={styles.share} onPress={() => setShareOpen(true)}>
            <Text style={styles.shareText}>Share / export image</Text>
          </Pressable>

          <Pressable style={styles.delete} onPress={onDelete}>
            <Text style={styles.deleteText}>Delete catch</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ShareSheet item={item} visible={shareOpen} onClose={() => setShareOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  photo: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#111' },
  body: { padding: 20, gap: 6 },
  length: { color: '#fff', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  formula: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  speciesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  species: { color: '#fff', fontSize: 18, fontWeight: '600' },
  identifying: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  identifyingText: { color: '#0a84ff', fontSize: 13 },
  changeSpecies: { paddingTop: 10 },
  changeSpeciesText: { color: '#0a84ff', fontSize: 15 },
  retry: { paddingTop: 6 },
  retryText: { color: '#0a84ff', fontSize: 15 },
  meta: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  delete: {
    marginTop: 28,
    borderColor: '#ff3b30',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: { color: '#ff3b30', fontSize: 15, fontWeight: '600' },
  share: {
    marginTop: 24,
    backgroundColor: '#0a84ff',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  shareText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
});
