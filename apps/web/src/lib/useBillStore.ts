"use client";

import { useEffect, useReducer, useState } from "react";
import {
  initialState,
  reducer,
  STORAGE_KEY,
  type State,
} from "@splitbill/core";

export function useBillStore() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded = JSON.parse(raw) as State;
        if (loaded.bill) dispatch({ type: "REHYDRATE", bill: loaded.bill });
      }
    } catch {}
    // Sync flag from localStorage availability is exactly the case useEffect+setState is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  return [state, dispatch, hydrated] as const;
}
