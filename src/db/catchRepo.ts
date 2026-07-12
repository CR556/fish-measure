import { getDb } from './database';
import type { AiSuggestion, Catch, CatchFilter, CatchSort } from './types';

type Row = {
  id: string;
  created_at: number;
  updated_at: number;
  measure_mode: string;
  length_curved_m: number;
  length_chord_m: number;
  length_source: string;
  girth_m: number | null;
  girth_source: string | null;
  weight_kg: number | null;
  weight_source: string | null;
  weight_formula: string | null;
  measure_confidence: number | null;
  distance_m: number | null;
  depth_coverage: number | null;
  species_id: string | null;
  species_confidence: number | null;
  species_source: string;
  ai_suggestions: string | null;
  user_corrected: number;
  bait: string | null;
  bait_source: string | null;
  lat: number | null;
  lon: number | null;
  loc_accuracy_m: number | null;
  photo_path: string;
  thumb_path: string;
  ply_path: string | null;
  mask_path: string | null;
  contour_json_path: string | null;
  notes: string;
  units_at_capture: string;
  schema_version: number;
};

function toModel(r: Row): Catch {
  let suggestions: AiSuggestion[] | null = null;
  if (r.ai_suggestions) {
    try {
      suggestions = JSON.parse(r.ai_suggestions);
    } catch {
      suggestions = null;
    }
  }
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    measureMode: r.measure_mode as Catch['measureMode'],
    lengthCurvedM: r.length_curved_m,
    lengthChordM: r.length_chord_m,
    lengthSource: r.length_source as Catch['lengthSource'],
    girthM: r.girth_m,
    girthSource: r.girth_source as Catch['girthSource'],
    weightKg: r.weight_kg,
    weightSource: r.weight_source as Catch['weightSource'],
    weightFormula: r.weight_formula,
    measureConfidence: r.measure_confidence,
    distanceM: r.distance_m,
    depthCoverage: r.depth_coverage,
    speciesId: r.species_id,
    speciesConfidence: r.species_confidence,
    speciesSource: r.species_source as Catch['speciesSource'],
    aiSuggestions: suggestions,
    userCorrected: r.user_corrected === 1,
    bait: r.bait as Catch['bait'],
    baitSource: r.bait_source as Catch['baitSource'],
    lat: r.lat,
    lon: r.lon,
    locAccuracyM: r.loc_accuracy_m,
    photoPath: r.photo_path,
    thumbPath: r.thumb_path,
    plyPath: r.ply_path,
    maskPath: r.mask_path,
    contourJsonPath: r.contour_json_path,
    notes: r.notes,
    unitsAtCapture: r.units_at_capture as Catch['unitsAtCapture'],
    schemaVersion: r.schema_version,
  };
}

export function insertCatch(c: Catch): void {
  getDb().runSync(
    `INSERT INTO catches (
      id, created_at, updated_at, measure_mode,
      length_curved_m, length_chord_m, length_source,
      girth_m, girth_source, weight_kg, weight_source, weight_formula,
      measure_confidence, distance_m, depth_coverage,
      species_id, species_confidence, species_source, ai_suggestions, user_corrected,
      bait, bait_source, lat, lon, loc_accuracy_m,
      photo_path, thumb_path, ply_path, mask_path, contour_json_path,
      notes, units_at_capture, schema_version
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )`,
    [
      c.id, c.createdAt, c.updatedAt, c.measureMode,
      c.lengthCurvedM, c.lengthChordM, c.lengthSource,
      c.girthM, c.girthSource, c.weightKg, c.weightSource, c.weightFormula,
      c.measureConfidence, c.distanceM, c.depthCoverage,
      c.speciesId, c.speciesConfidence, c.speciesSource,
      c.aiSuggestions ? JSON.stringify(c.aiSuggestions) : null, c.userCorrected ? 1 : 0,
      c.bait, c.baitSource, c.lat, c.lon, c.locAccuracyM,
      c.photoPath, c.thumbPath, c.plyPath, c.maskPath, c.contourJsonPath,
      c.notes, c.unitsAtCapture, c.schemaVersion,
    ]
  );
}

/** Partial update; always bumps updated_at. */
export function updateCatch(id: string, patch: Partial<Catch>): void {
  const map: Record<string, string> = {
    lengthCurvedM: 'length_curved_m', lengthSource: 'length_source',
    girthM: 'girth_m', girthSource: 'girth_source',
    weightKg: 'weight_kg', weightSource: 'weight_source', weightFormula: 'weight_formula',
    speciesId: 'species_id', speciesConfidence: 'species_confidence',
    speciesSource: 'species_source', userCorrected: 'user_corrected',
    bait: 'bait', baitSource: 'bait_source',
    lat: 'lat', lon: 'lon', locAccuracyM: 'loc_accuracy_m',
    notes: 'notes',
  };
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, col] of Object.entries(map)) {
    if (key in patch) {
      const v = (patch as Record<string, unknown>)[key];
      if (key === 'aiSuggestions') {
        values.push(v ? JSON.stringify(v) : null);
      } else if (typeof v === 'boolean') {
        values.push(v ? 1 : 0);
      } else {
        values.push(v as string | number | null);
      }
      sets.push(`${col} = ?`);
    }
  }
  if ('aiSuggestions' in patch) {
    sets.push('ai_suggestions = ?');
    values.push(patch.aiSuggestions ? JSON.stringify(patch.aiSuggestions) : null);
  }
  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);
  getDb().runSync(`UPDATE catches SET ${sets.join(', ')} WHERE id = ?`, values);
}

export function getCatch(id: string): Catch | null {
  const row = getDb().getFirstSync<Row>('SELECT * FROM catches WHERE id = ?', [id]);
  return row ? toModel(row) : null;
}

export function deleteCatch(id: string): void {
  getDb().runSync('DELETE FROM catches WHERE id = ?', [id]);
}

const SORT_SQL: Record<CatchSort, string> = {
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  lengthDesc: 'length_curved_m DESC',
  lengthAsc: 'length_curved_m ASC',
  weightDesc: 'weight_kg DESC NULLS LAST',
};

export function listCatches(filter: CatchFilter = {}, sort: CatchSort = 'newest'): Catch[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.speciesIds?.length) {
    where.push(`species_id IN (${filter.speciesIds.map(() => '?').join(',')})`);
    params.push(...filter.speciesIds);
  }
  if (filter.fromDate != null) {
    where.push('created_at >= ?');
    params.push(filter.fromDate);
  }
  if (filter.toDate != null) {
    where.push('created_at <= ?');
    params.push(filter.toDate);
  }
  if (filter.minLengthM != null) {
    where.push('length_curved_m >= ?');
    params.push(filter.minLengthM);
  }
  if (filter.maxLengthM != null) {
    where.push('length_curved_m <= ?');
    params.push(filter.maxLengthM);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDb().getAllSync<Row>(
    `SELECT * FROM catches ${whereSql} ORDER BY ${SORT_SQL[sort]}`,
    params
  );
  return rows.map(toModel);
}

/** Catches with a GPS fix, for the map. */
export function listLocatedCatches(): Catch[] {
  const rows = getDb().getAllSync<Row>(
    'SELECT * FROM catches WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY created_at DESC'
  );
  return rows.map(toModel);
}

/** Distinct species ids present in the log (for the filter chips). */
export function distinctSpeciesIds(): string[] {
  const rows = getDb().getAllSync<{ species_id: string | null }>(
    'SELECT DISTINCT species_id FROM catches'
  );
  return rows.map((r) => r.species_id).filter((s): s is string => !!s);
}
