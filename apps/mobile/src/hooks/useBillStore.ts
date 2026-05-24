import { initialState, reducer, type Action, type State } from "@splitbill/core";
import { useReducer, type Dispatch } from "react";

// M3 wires the core reducer to React state only. AsyncStorage persistence
// lands in M6 — the hook signature stays the same so callers don't change.
export function useBillStore(): [State, Dispatch<Action>] {
  return useReducer(reducer, initialState);
}
