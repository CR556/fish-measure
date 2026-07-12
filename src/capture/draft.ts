import type { AutoCapturePayload, ManualCapturePayload } from '../../modules/fish-measure';
import type { BaitKind, MeasureMode } from '../db/types';
import type { UnitsSystem } from '../lib/fishUnits';
import { createStore } from '../stores/fishStores';

/**
 * A capture in the review pop-up, before Keep. Holds absolute file paths (the
 * files already exist on disk under catches/<id>/) and the working values the
 * user can edit. Kept in a module store keyed by id so navigation only passes
 * the id — no serializing big arrays through route params.
 */
export type CaptureDraft = {
  id: string;
  createdAt: number;
  measureMode: MeasureMode;

  // Measured (editable length/girth).
  lengthCurvedM: number;
  lengthChordM: number;
  girthM: number | null;
  girthMethod: string | null;
  measureConfidence: number | null;
  distanceM: number | null;
  depthCoverage: number | null;

  // Files (absolute; converted to relative at Keep).
  photoAbsPath: string;
  photoWidth: number;
  photoHeight: number;
  photoSource: string;
  plyAbsPath: string | null;
  maskAbsPath: string | null;

  // Geometry for contour.json + share-card crop (normalized upright photo).
  contour: number[];
  noseNorm: [number, number];
  tailNorm: [number, number];

  // Location (filled asynchronously when GPS is enabled).
  lat: number | null;
  lon: number | null;
  locAccuracyM: number | null;

  // Working edit fields.
  speciesId: string | null;
  bait: BaitKind | null;
  notes: string;
  weightKg: number | null;
  weightFormula: string | null;
  lengthEdited: boolean;
  girthEdited: boolean;
  weightEdited: boolean;

  unitsAtCapture: UnitsSystem;
};

const drafts = new Map<string, CaptureDraft>();

/** Bumps when any draft's fields change, so the review screen re-renders. */
export const draftRevision = createStore(0);

export function putDraft(draft: CaptureDraft): void {
  drafts.set(draft.id, draft);
  draftRevision.set(draftRevision.get() + 1);
}

export function getDraft(id: string): CaptureDraft | undefined {
  return drafts.get(id);
}

export function patchDraft(id: string, patch: Partial<CaptureDraft>): void {
  const current = drafts.get(id);
  if (!current) return;
  drafts.set(id, { ...current, ...patch });
  draftRevision.set(draftRevision.get() + 1);
}

export function removeDraft(id: string): void {
  drafts.delete(id);
}

function toPair(arr: number[] | [number, number] | null | undefined): [number, number] {
  if (arr && arr.length >= 2) return [arr[0], arr[1]];
  return [0, 0];
}

/** Auto/manual capture payload → a review draft. */
export function draftFromPayload(
  id: string,
  payload: AutoCapturePayload | ManualCapturePayload,
  unitsAtCapture: UnitsSystem
): CaptureDraft {
  const isAuto = payload.measureMode === 'auto';
  const auto = isAuto ? (payload as AutoCapturePayload) : null;
  return {
    id,
    createdAt: Date.now(),
    measureMode: payload.measureMode,
    lengthCurvedM: payload.curvedM,
    lengthChordM: payload.chordM,
    girthM: auto?.girthM ?? null,
    girthMethod: auto?.girthMethod ?? null,
    measureConfidence: payload.confidence,
    distanceM: payload.distanceM,
    depthCoverage: auto?.depthCoverage ?? null,
    photoAbsPath: payload.photoPath,
    photoWidth: payload.photoWidth,
    photoHeight: payload.photoHeight,
    photoSource: payload.photoSource,
    plyAbsPath: payload.plyPath,
    maskAbsPath: payload.maskPngPath,
    contour: auto?.contour ?? [],
    noseNorm: auto ? toPair(auto.noseNorm) : toPair(('pointANorm' in payload && payload.pointANorm) || null),
    tailNorm: auto ? toPair(auto.tailNorm) : toPair(('pointBNorm' in payload && payload.pointBNorm) || null),
    lat: null,
    lon: null,
    locAccuracyM: null,
    speciesId: null,
    bait: null,
    notes: '',
    weightKg: null,
    weightFormula: null,
    lengthEdited: false,
    girthEdited: false,
    weightEdited: false,
    unitsAtCapture,
  };
}
