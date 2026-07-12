import { saveImageToPhotos } from '../../modules/fish-measure';
import { insertCatch } from '../db/catchRepo';
import type { Catch } from '../db/types';
import { speciesName } from '../data/species';
import { deleteCatchDir, makeThumbnail, toRelative, writeContourJson } from '../lib/files';
import { formatFishLength, formatFishWeight } from '../lib/fishUnits';
import { getSettings } from '../stores/settingsStore';
import type { CaptureDraft } from './draft';
import { removeDraft } from './draft';
import { requestId } from './idQueue';

/** Optional: also drop the catch photo into the camera roll with metadata. */
async function maybeSaveToPhotos(record: Catch, photoAbsPath: string): Promise<void> {
  if (!getSettings().saveToPhotosOnKeep) return;
  const system = record.unitsAtCapture;
  const human =
    `${speciesName(record.speciesId)} — ${formatFishLength(record.lengthCurvedM, system)}` +
    (record.weightKg != null ? ` · ${formatFishWeight(record.weightKg, system)}` : '');
  const json = JSON.stringify({
    lengthCurvedM: record.lengthCurvedM,
    lengthChordM: record.lengthChordM,
    girthM: record.girthM,
    weightKg: record.weightKg,
    speciesId: record.speciesId,
    measureMode: record.measureMode,
  });
  const gps =
    record.lat != null && record.lon != null ? { lat: record.lat, lon: record.lon } : undefined;
  try {
    await saveImageToPhotos(photoAbsPath, json, human, gps);
  } catch {
    // Permission denied or save failed — the catch is still stored locally.
  }
}

/**
 * Persists a reviewed draft: thumbnail + contour.json + DB row. Files already
 * live under catches/<id>/, so this only records relative paths. Returns the
 * stored catch id.
 */
export async function keepCatch(draft: CaptureDraft): Promise<string> {
  const thumbRel = await makeThumbnail(draft.id, draft.photoAbsPath);
  const contourRel =
    draft.contour.length >= 6
      ? writeContourJson(draft.id, {
          contour: draft.contour,
          noseNorm: draft.noseNorm,
          tailNorm: draft.tailNorm,
        })
      : null;

  const now = Date.now();
  const record: Catch = {
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: now,
    measureMode: draft.measureMode,
    lengthCurvedM: draft.lengthCurvedM,
    lengthChordM: draft.lengthChordM,
    lengthSource: draft.lengthEdited ? 'user' : 'auto',
    girthM: draft.girthM,
    girthSource: draft.girthM == null ? null : draft.girthEdited ? 'user' : 'auto',
    weightKg: draft.weightKg,
    weightSource: draft.weightKg == null ? null : draft.weightEdited ? 'user' : 'auto',
    weightFormula: draft.weightFormula,
    measureConfidence: draft.measureConfidence,
    distanceM: draft.distanceM,
    depthCoverage: draft.depthCoverage,
    speciesId: draft.speciesId,
    speciesConfidence: null,
    speciesSource: draft.speciesId ? 'user' : 'none',
    aiSuggestions: null,
    userCorrected: false,
    bait: draft.bait,
    baitSource: draft.bait ? 'user' : null,
    lat: draft.lat,
    lon: draft.lon,
    locAccuracyM: draft.locAccuracyM,
    photoPath: toRelative(draft.photoAbsPath),
    thumbPath: thumbRel,
    plyPath: draft.plyAbsPath ? toRelative(draft.plyAbsPath) : null,
    maskPath: draft.maskAbsPath ? toRelative(draft.maskAbsPath) : null,
    contourJsonPath: contourRel,
    notes: draft.notes,
    unitsAtCapture: draft.unitsAtCapture,
    schemaVersion: 1,
  };

  insertCatch(record);
  removeDraft(draft.id);
  void maybeSaveToPhotos(record, draft.photoAbsPath);
  // Fire species/bait ID in the background (queues if offline / no key).
  // Never blocks Keep; the detail screen reflects the result when it lands.
  if (record.speciesSource !== 'user') {
    void requestId(record.id);
  }
  return record.id;
}

/** Discards a draft: deletes its on-disk files and drops it from the store. */
export function discardDraft(draft: CaptureDraft): void {
  deleteCatchDir(draft.id);
  removeDraft(draft.id);
}
