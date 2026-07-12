import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { speciesName } from '../../data/species';
import type { Catch } from '../../db/types';
import { resolveCatchUri } from '../../lib/files';
import { formatFishLength, formatFishLengthShort, formatFishWeight } from '../../lib/fishUnits';

export type ExportVariant = 'length' | 'lengthWeight' | 'card';

/** Logical width the card renders at off-screen; view-shot scales by pixel
 *  ratio, so this yields a ~2–3× resolution export. */
export const EXPORT_WIDTH = 480;

type Props = {
  item: Catch;
  variant: ExportVariant;
};

/**
 * Off-screen composition for image exports. The three rendered variants:
 * length pill, length+weight pill, and the full share card (fish-centered
 * crop on top, all info below). The plain-photo export shares the file
 * directly and doesn't use this.
 */
export function ExportCard({ item, variant }: Props) {
  const uri = resolveCatchUri(item.photoPath);
  const system = item.unitsAtCapture;

  if (variant === 'card') {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.cardSpecies}>{speciesName(item.speciesId)}</Text>
          <Text style={styles.cardLength}>{formatFishLength(item.lengthCurvedM, system)}</Text>
          <Text style={styles.cardStat}>
            straight {formatFishLengthShort(item.lengthChordM, system)}
            {item.girthM != null ? ` · girth ${formatFishLengthShort(item.girthM, system)}` : ''}
          </Text>
          {item.weightKg != null ? (
            <Text style={styles.cardStat}>
              {formatFishWeight(item.weightKg, system)}
              {item.weightFormula ? `  ·  ${item.weightFormula}` : ''}
            </Text>
          ) : null}
          <Text style={styles.cardMeta}>
            {new Date(item.createdAt).toLocaleDateString()}
            {item.bait ? ` · ${item.bait}` : ''}
          </Text>
          {item.notes ? (
            <Text style={styles.cardNotes} numberOfLines={2}>
              {item.notes}
            </Text>
          ) : null}
          <Text style={styles.watermark}>FishMeasure</Text>
        </View>
      </View>
    );
  }

  // Photo with an overlaid pill (length, or length + weight/species).
  return (
    <View style={[styles.photoWrap, styles.photoAspect]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.pill}>
        <Text style={styles.pillLength}>{formatFishLength(item.lengthCurvedM, system)}</Text>
        {variant === 'lengthWeight' ? (
          <Text style={styles.pillSub}>
            {speciesName(item.speciesId)}
            {item.weightKg != null ? ` · ${formatFishWeight(item.weightKg, system)}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrap: {
    width: EXPORT_WIDTH,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
  },
  photoAspect: { aspectRatio: 3 / 4 },
  pill: {
    margin: 16,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  pillLength: { color: '#fff', fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pillSub: { color: 'rgba(255,255,255,0.9)', fontSize: 15, marginTop: 2 },
  card: {
    width: EXPORT_WIDTH,
    height: (EXPORT_WIDTH * 16) / 9,
    backgroundColor: '#0b0b0c',
  },
  cardTop: { height: '55%', backgroundColor: '#111' },
  cardBottom: { flex: 1, padding: 22, gap: 4 },
  cardSpecies: { color: '#fff', fontSize: 24, fontWeight: '700' },
  cardLength: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  cardStat: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontVariant: ['tabular-nums'] },
  cardMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 6 },
  cardNotes: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 },
  watermark: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '700',
    position: 'absolute',
    right: 22,
    bottom: 18,
  },
});
