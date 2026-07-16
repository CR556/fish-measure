import { Directory, File, Paths } from 'expo-file-system';

import { createStore } from '../stores/fishStores';

/**
 * Custom fish segmentation model, delivered as a GitHub release asset and
 * downloaded at runtime — replacing Apple's generic subject lift with a
 * fish-trained network, with NO app rebuild (the native side compiles the
 * .mlmodel on device via segmenterModelPath).
 */

const MODEL_TAG = 'model-v1';
const MODEL_FILE = 'FishSeg.mlmodel';
export const MODEL_URL = `https://github.com/CR556/fish-measure/releases/download/${MODEL_TAG}/${MODEL_FILE}`;

export type FishModelState =
  | { status: 'idle' }
  | { status: 'downloading' }
  | { status: 'ready'; path: string; bytes: number }
  | { status: 'error'; message: string };

export const fishModelStore = createStore<FishModelState>({ status: 'idle' });

function modelsDir(): Directory {
  const dir = new Directory(Paths.document, 'models');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function modelFile(): File {
  return new File(modelsDir(), MODEL_FILE);
}

/** Plain filesystem path (no file://) for the native prop, or null. */
export function modelPathIfReady(): string | null {
  const state = fishModelStore.get();
  return state.status === 'ready' ? state.path : null;
}

/** Checks disk on startup so a previously downloaded model is used. */
export function initFishModel(): void {
  try {
    const file = modelFile();
    if (file.exists && (file.size ?? 0) > 100_000) {
      fishModelStore.set({
        status: 'ready',
        path: file.uri.replace(/^file:\/\//, ''),
        bytes: file.size ?? 0,
      });
    }
  } catch {
    // stays idle
  }
}

export async function downloadFishModel(): Promise<void> {
  const current = fishModelStore.get();
  if (current.status === 'downloading') return;
  fishModelStore.set({ status: 'downloading' });
  try {
    const file = modelFile();
    if (file.exists) file.delete();
    const result = await File.downloadFileAsync(MODEL_URL, file);
    const bytes = result.size ?? 0;
    if (bytes < 100_000) {
      throw new Error('Download looks truncated');
    }
    fishModelStore.set({
      status: 'ready',
      path: result.uri.replace(/^file:\/\//, ''),
      bytes,
    });
  } catch (e) {
    fishModelStore.set({ status: 'error', message: String(e) });
  }
}

export function removeFishModel(): void {
  try {
    const file = modelFile();
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
  fishModelStore.set({ status: 'idle' });
}
