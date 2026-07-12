import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { getCatch, updateCatch } from '../db/catchRepo';
import { dequeueId, enqueueId, listQueue, markAttempt } from '../db/idQueueRepo';
import { FishIdError, identifyFish, type FishIdResult } from '../lib/claudeId';
import { hasApiKey } from '../lib/aiKey';
import { resolveCatchUri } from '../lib/files';
import { estimateWeight } from '../lib/weight';
import { createStore } from '../stores/fishStores';
import { getSettings } from '../stores/settingsStore';

/** Bumps whenever a catch's identification changes, so screens re-query. */
export const catchRevision = createStore(0);
function bump() {
  catchRevision.set(catchRevision.get() + 1);
}

const APPLY_CONFIDENCE = 0.5;
const MAX_AUTO_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

let draining = false;

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

/** Applies an ID result to a catch, respecting user overrides. */
function applyResult(catchId: string, result: FishIdResult): void {
  const item = getCatch(catchId);
  if (!item) return;

  const patch: Parameters<typeof updateCatch>[1] = {
    aiSuggestions: result.speciesTop3,
  };

  // Only set species if the user hasn't chosen one.
  if (item.speciesSource !== 'user') {
    const top = result.speciesTop3[0];
    if (top && top.confidence >= APPLY_CONFIDENCE) {
      patch.speciesId = top.speciesId;
      patch.speciesConfidence = top.confidence;
      patch.speciesSource = 'ai';
      // Refresh weight if it wasn't hand-edited (no girth → species drives it).
      if (item.weightSource !== 'user') {
        const est = estimateWeight({
          speciesId: top.speciesId,
          lengthCurvedM: item.lengthCurvedM,
          girthM: item.girthM,
        });
        if (est) {
          patch.weightKg = est.kg;
          patch.weightFormula = est.formula;
          patch.weightSource = 'auto';
        }
      }
    }
  }

  // Only set bait if the user hasn't.
  if (result.bait && item.baitSource !== 'user') {
    patch.bait = result.bait;
    patch.baitSource = 'ai';
  }

  updateCatch(catchId, patch);
  bump();
}

/** Runs identification for one catch now; returns true on success. */
async function runOne(catchId: string): Promise<boolean> {
  const item = getCatch(catchId);
  if (!item) {
    dequeueId(catchId);
    return false;
  }
  try {
    const result = await identifyFish({
      photoUri: resolveCatchUri(item.photoPath),
      lengthCm: item.lengthCurvedM * 100,
      model: getSettings().aiModel,
    });
    applyResult(catchId, result);
    dequeueId(catchId);
    return true;
  } catch (e) {
    const message = e instanceof FishIdError ? e.message : String(e);
    markAttempt(catchId, message);
    return false;
  }
}

/**
 * Called on Keep. Fires immediately when a key is set and we're online; else
 * enqueues for the drain loop. Never throws into the caller.
 */
export async function requestId(catchId: string): Promise<void> {
  enqueueId(catchId);
  if (!(await hasApiKey())) return; // feature off — stays queued but idle
  if (await isOnline()) {
    await runOne(catchId);
  }
}

/** Drains the queue sequentially, honoring per-row exponential backoff. */
export async function drainQueue(force = false): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    if (!(await hasApiKey()) || !(await isOnline())) return;
    for (const row of listQueue()) {
      if (!force && row.attempts >= MAX_AUTO_ATTEMPTS) continue;
      if (!force && row.lastAttemptAt != null) {
        const wait = BASE_BACKOFF_MS * 2 ** Math.min(row.attempts, 8);
        if (Date.now() - row.lastAttemptAt < wait) continue;
      }
      const ok = await runOne(row.catchId);
      if (!ok && !force) break; // network likely down again; stop early
    }
  } finally {
    draining = false;
  }
}

/** Manual "Retry ID" for a single catch (ignores backoff/attempt cap). */
export async function retryId(catchId: string): Promise<boolean> {
  enqueueId(catchId);
  if (!(await hasApiKey()) || !(await isOnline())) return false;
  return runOne(catchId);
}

let initialized = false;

/** Wires the drain triggers: app foreground + network regained. */
export function initIdQueue(): void {
  if (initialized) return;
  initialized = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') void drainQueue();
  });

  try {
    Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void drainQueue();
      }
    });
  } catch {
    // Listener API unavailable — foreground + post-Keep drains still cover it.
  }

  // Catch anything left from a previous session.
  void drainQueue();
}
