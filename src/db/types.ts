import type { UnitsSystem } from '../lib/fishUnits';

export type MeasureMode = 'auto' | 'manual';
export type ValueSource = 'auto' | 'user';
export type SpeciesSource = 'ai' | 'user' | 'none';
export type BaitKind = 'fly' | 'grub' | 'worm' | 'lure' | 'live' | 'other';
export type BaitSource = 'ai' | 'user';

export type AiSuggestion = { speciesId: string; confidence: number };

/**
 * One stored catch. Mirrors the `catches` table 1:1. Lengths/girth are in
 * meters and weight in kg internally regardless of the display units — the
 * unit system at capture time is recorded so exports can reproduce it.
 * File paths are RELATIVE to the catches directory (portable across app
 * container path changes between installs).
 */
export type Catch = {
  id: string;
  createdAt: number;
  updatedAt: number;
  measureMode: MeasureMode;

  lengthCurvedM: number;
  lengthChordM: number;
  lengthSource: ValueSource;

  girthM: number | null;
  girthSource: ValueSource | null;

  weightKg: number | null;
  weightSource: ValueSource | null;
  weightFormula: string | null;

  measureConfidence: number | null;
  distanceM: number | null;
  depthCoverage: number | null;

  speciesId: string | null;
  speciesConfidence: number | null;
  speciesSource: SpeciesSource;
  aiSuggestions: AiSuggestion[] | null;
  userCorrected: boolean;

  bait: BaitKind | null;
  baitSource: BaitSource | null;

  lat: number | null;
  lon: number | null;
  locAccuracyM: number | null;

  photoPath: string;
  thumbPath: string;
  plyPath: string | null;
  maskPath: string | null;
  contourJsonPath: string | null;

  notes: string;
  unitsAtCapture: UnitsSystem;
  schemaVersion: number;
};

export type CatchFilter = {
  speciesIds?: string[];
  fromDate?: number;
  toDate?: number;
  minLengthM?: number;
  maxLengthM?: number;
};

export type CatchSort = 'newest' | 'oldest' | 'lengthDesc' | 'lengthAsc' | 'weightDesc';
