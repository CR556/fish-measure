import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteCatch, getCatch } from '../db/catchRepo';
import { deleteCatchDir } from '../lib/files';
import { formatFishLength, formatFishLengthShort, formatFishWeight } from '../lib/fishUnits';
import { resolveCatchUri } from '../lib/files';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CatchDetail'>;

/** Minimal detail view (M6 adds exports, edit, map link). */
export function CatchDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { catchId } = route.params;
  const item = useMemo(() => getCatch(catchId), [catchId]);

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

  if (!item) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Catch not found.</Text>
      </View>
    );
  }

  const system = item.unitsAtCapture;

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
          <Text style={styles.species}>{item.speciesId ?? 'Unknown species'}</Text>
          {item.bait ? <Text style={styles.meta}>Bait: {item.bait}</Text> : null}
          {item.notes ? <Text style={styles.meta}>{item.notes}</Text> : null}
          <Text style={styles.meta}>
            {new Date(item.createdAt).toLocaleString()}
            {item.lat != null ? ' · 📍 tagged' : ''}
          </Text>

          <TouchableOpacity style={styles.delete} onPress={onDelete}>
            <Text style={styles.deleteText}>Delete catch</Text>
          </TouchableOpacity>
          <Text style={styles.footer}>Image exports & CSV arrive with the export update.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  photo: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#111' },
  body: { padding: 20, gap: 6 },
  length: { color: '#fff', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  species: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 10 },
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
  footer: { color: 'rgba(255,255,255,0.4)', fontSize: 12.5, marginTop: 16 },
  empty: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
});
