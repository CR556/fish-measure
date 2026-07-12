import * as SecureStore from 'expo-secure-store';

import { createStore } from '../stores/fishStores';

const KEY = 'fish-measure.anthropic-key';

/** Bumps when the key is set/cleared so Settings reflects presence live. */
export const aiKeyPresence = createStore(false);

let cached: string | null = null;
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  cached = await SecureStore.getItemAsync(KEY);
  loaded = true;
  aiKeyPresence.set(!!cached);
}

export async function getApiKey(): Promise<string | null> {
  await ensureLoaded();
  return cached;
}

export async function hasApiKey(): Promise<boolean> {
  await ensureLoaded();
  return !!cached;
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await clearApiKey();
    return;
  }
  await SecureStore.setItemAsync(KEY, trimmed);
  cached = trimmed;
  loaded = true;
  aiKeyPresence.set(true);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  cached = null;
  loaded = true;
  aiKeyPresence.set(false);
}

// Warm the presence flag at import so the Settings toggle is correct on mount.
void ensureLoaded();
