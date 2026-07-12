import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { speciesName } from '../data/species';
import type { Catch } from '../db/types';

const M_PER_IN = 0.0254;
const LB_PER_KG = 2.2046226;

function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'id', 'date_iso', 'mode', 'species', 'species_scientific_id', 'species_source', 'ai_corrected',
  'length_curved_cm', 'length_curved_in', 'length_chord_cm', 'girth_cm',
  'weight_kg', 'weight_lb', 'weight_formula',
  'bait', 'confidence', 'distance_m', 'lat', 'lon', 'notes',
];

/** Serializes catches to CSV recording both unit systems. */
export function catchesToCsv(rows: Catch[]): string {
  const lines = [HEADERS.join(',')];
  for (const c of rows) {
    lines.push(
      [
        c.id,
        new Date(c.createdAt).toISOString(),
        c.measureMode,
        speciesName(c.speciesId),
        c.speciesId ?? '',
        c.speciesSource,
        c.userCorrected ? 'yes' : 'no',
        (c.lengthCurvedM * 100).toFixed(1),
        (c.lengthCurvedM / M_PER_IN).toFixed(2),
        (c.lengthChordM * 100).toFixed(1),
        c.girthM != null ? (c.girthM * 100).toFixed(1) : '',
        c.weightKg != null ? c.weightKg.toFixed(3) : '',
        c.weightKg != null ? (c.weightKg * LB_PER_KG).toFixed(2) : '',
        c.weightFormula ?? '',
        c.measureConfidence != null ? c.measureConfidence.toFixed(2) : '',
        c.distanceM != null ? c.distanceM.toFixed(2) : '',
        c.lat != null ? c.lat.toFixed(6) : '',
        c.lon != null ? c.lon.toFixed(6) : '',
        c.notes,
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n');
}

/** Writes the CSV to a temp file and opens the share sheet. */
export async function exportCatchesCsv(rows: Catch[]): Promise<void> {
  const csv = catchesToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `fishmeasure-catches-${stamp}.csv`);
  if (file.exists) file.delete();
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  }
}
