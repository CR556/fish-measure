import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';

import type { UnitsSystem } from '../lib/fishUnits';
import { createStore } from './fishStores';

export type AiModelChoice = 'haiku' | 'sonnet';

export type Settings = {
  unitsSystem: UnitsSystem;
  autoCapture: boolean;
  gpsEnabled: boolean;
  saveToPhotosOnKeep: boolean;
  /** Which Claude model identifies the catch. Key lives in secure store. */
  aiModel: AiModelChoice;
  /** Use the custom fish segmentation model (when downloaded). */
  customModelEnabled: boolean;
};

const DEFAULTS: Settings = {
  unitsSystem: 'imperial',
  autoCapture: true,
  gpsEnabled: true,
  saveToPhotosOnKeep: false,
  aiModel: 'haiku',
  customModelEnabled: true,
};

const STORAGE_KEY = 'fish-measure.settings';

/** Module-level store so every screen sees settings changes live. */
const store = createStore<Settings>(DEFAULTS);

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    try {
      store.set({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // Corrupt settings fall back to defaults.
    }
  })
  .catch(() => {});

export function updateSettings(partial: Partial<Settings>) {
  const next = { ...store.get(), ...partial };
  store.set(next);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

export function getSettings(): Settings {
  return store.get();
}

export function useSettings(): [Settings, typeof updateSettings] {
  const settings = useSyncExternalStore(store.subscribe, store.get);
  const update = useCallback(updateSettings, []);
  return [settings, update];
}
