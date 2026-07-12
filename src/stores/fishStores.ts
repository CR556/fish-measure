import type {
  DebugInfoEvent,
  FishMeasurementEvent,
  ProjectedPointsEvent,
  SubjectEvent,
} from '../../modules/fish-measure';

type Listener = () => void;

/**
 * Minimal external store (same pattern as projectionStore): per-frame native
 * events land here and only the Skia overlay / HUD components that
 * useSyncExternalStore re-render — never the screen tree. Routing 10–30 Hz
 * data through React state stalled the distance app; don't.
 */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const subjectStore = createStore<SubjectEvent | null>(null);
export const measurementStore = createStore<FishMeasurementEvent | null>(null);
export const debugStore = createStore<DebugInfoEvent | null>(null);
/** Manual-mode anchor projections (native emits at updateHz). */
export const projectedStore = createStore<ProjectedPointsEvent | null>(null);
