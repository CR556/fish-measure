import { useEffect, useState } from 'react';

type Store<T> = {
  get: () => T;
  subscribe: (l: () => void) => () => void;
};

/**
 * Reads an external store with re-renders capped to `intervalMs` — for text
 * HUD elements fed by 10–30 Hz native events (the Skia overlays subscribe
 * unthrottled via useSyncExternalStore instead).
 */
export function useThrottledStore<T>(store: Store<T>, intervalMs = 100): T {
  const [value, setValue] = useState<T>(store.get);

  useEffect(() => {
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      const now = Date.now();
      if (now - last >= intervalMs) {
        last = now;
        setValue(store.get());
      } else if (!trailing) {
        trailing = setTimeout(() => {
          trailing = null;
          last = Date.now();
          setValue(store.get());
        }, intervalMs - (now - last));
      }
    };
    const unsubscribe = store.subscribe(push);
    return () => {
      unsubscribe();
      if (trailing) clearTimeout(trailing);
    };
  }, [store, intervalMs]);

  return value;
}
