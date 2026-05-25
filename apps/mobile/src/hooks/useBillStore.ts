import {
  initialState,
  reducer,
  STORAGE_KEY,
  type Action,
  type State,
} from "@splitbill/core";
import { useEffect, useReducer, useState, type Dispatch } from "react";
import { asyncStorageAdapter } from "../lib/asyncStorageAdapter";

// Mirrors apps/web/src/lib/useBillStore.ts, but with the async StorageAdapter
// instead of synchronous localStorage. Returns a `hydrated` flag so the host
// can hold the splash screen until the persisted bill (if any) is loaded.
export function useBillStore(): [State, Dispatch<Action>, boolean] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await asyncStorageAdapter.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const loaded = JSON.parse(raw) as State;
          if (loaded.bill) dispatch({ type: "REHYDRATE", bill: loaded.bill });
        }
      } catch {
        // Corrupted storage falls back to initialState; never crash boot.
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change, but only after hydration so we don't clobber the
  // stored bill with initialState during the first render.
  useEffect(() => {
    if (!hydrated) return;
    asyncStorageAdapter
      .setItem(STORAGE_KEY, JSON.stringify(state))
      .catch(() => {
        // Disk-full / sandbox failures shouldn't break the UX.
      });
  }, [state, hydrated]);

  return [state, dispatch, hydrated];
}
