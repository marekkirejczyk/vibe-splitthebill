"use client";

import { useEffect, useReducer, useState } from "react";
import type {
  Assignee,
  Bill,
  ExtractCategory,
  ExtractedLine,
  ExtractedReceipt,
  Item,
  MultiItem,
} from "./types";

const STORAGE_KEY = "splitbill.v1";

export type Action =
  | { type: "LOAD_RECEIPT"; receipt: ExtractedReceipt }
  | { type: "REHYDRATE"; bill: Bill | null }
  | { type: "SWIPE"; id: string; direction: "left" | "right" }
  | { type: "EDIT_NAME"; id: string; name: string }
  | { type: "EDIT_PRICE"; id: string; price: number }
  | { type: "SET_TAX_INCLUDED"; value: boolean }
  | { type: "RESET" };

// Per spec:
//   unassigned + left  -> you
//   unassigned + right -> them
//   you        + left  -> null     (unassign — same direction)
//   you        + right -> them     (switch)
//   them       + right -> null     (unassign — same direction)
//   them       + left  -> you      (switch)
export function nextAssignee(current: Assignee, dir: "left" | "right"): Assignee {
  if (current === null) return dir === "left" ? "you" : "them";
  if (current === "you") return dir === "left" ? null : "them";
  return dir === "right" ? null : "you";
}

export function toMultiItem(line: ExtractedLine): MultiItem {
  const raw = line.quantity ?? 1;
  const q = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : 1));
  return {
    name: line.name,
    lineTotal: line.price,
    quantity: q,
    unitPrice: line.unitPrice,
  };
}

export function expandItemLine(
  mi: MultiItem
): Pick<Item, "name" | "price">[] {
  if (mi.quantity <= 1) return [{ name: mi.name, price: mi.lineTotal }];

  if (typeof mi.unitPrice === "number" && Number.isFinite(mi.unitPrice)) {
    return Array.from({ length: mi.quantity }, () => ({
      name: mi.name,
      price: mi.unitPrice!,
    }));
  }

  const cents = Math.round(mi.lineTotal * 100);
  const baseCents = Math.floor(cents / mi.quantity);
  const remainder = cents - baseCents * mi.quantity;
  return Array.from({ length: mi.quantity }, (_, i) => ({
    name: mi.name,
    price: (baseCents + (i < remainder ? 1 : 0)) / 100,
  }));
}

export function billFromReceipt(r: ExtractedReceipt): Bill {
  const items: Item[] = [];
  const extras = { tax: 0, tip: 0, service: 0 };
  for (const line of r.lines) {
    if (line.category === "item" || line.category === "discount") {
      for (const unit of expandItemLine(toMultiItem(line))) {
        items.push({ id: cryptoId(), assignee: null, ...unit });
      }
    } else if (line.category === "tax") extras.tax += line.price;
    else if (line.category === "tip") extras.tip += line.price;
    else if (line.category === "service") extras.service += line.price;
  }
  return {
    currency: r.currency || "$",
    items,
    extras,
    taxIncluded: detectTaxIncluded(r),
  };
}

// Decide whether the receipt's item prices already include the tax line.
// Resolution order: textual signal from the model → math cross-check
// against `printedTotal` → safe default (`false`, US-style exclusive).
export function detectTaxIncluded(r: ExtractedReceipt): boolean {
  const sumOf = (cat: ExtractCategory) =>
    r.lines.filter((l) => l.category === cat).reduce((a, l) => a + l.price, 0);

  const tax = sumOf("tax");
  if (tax === 0) return false;

  if (r.taxBehavior === "inclusive") return true;
  if (r.taxBehavior === "exclusive") return false;

  if (typeof r.printedTotal === "number" && Number.isFinite(r.printedTotal)) {
    const items = r.lines
      .filter((l) => l.category === "item" || l.category === "discount")
      .reduce((a, l) => a + l.price, 0);
    const tip = sumOf("tip");
    const service = sumOf("service");
    const inclusive = items + tip + service;
    const exclusive = items + tax + tip + service;
    const tol = Math.max(0.05, 0.01 * Math.abs(r.printedTotal));
    const dInc = Math.abs(inclusive - r.printedTotal);
    const dExc = Math.abs(exclusive - r.printedTotal);
    if (dInc <= tol && dInc < dExc) return true;
    if (dExc <= tol && dExc < dInc) return false;
  }

  return false;
}

function cryptoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export type State = { bill: Bill | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOAD_RECEIPT":
      return { bill: billFromReceipt(action.receipt) };
    case "REHYDRATE":
      // Bills persisted before the taxIncluded field was introduced won't
      // have it — default to false (the previous behaviour).
      return {
        bill: action.bill
          ? { ...action.bill, taxIncluded: action.bill.taxIncluded ?? false }
          : null,
      };
    case "RESET":
      return { bill: null };
    case "SWIPE": {
      if (!state.bill) return state;
      return {
        bill: {
          ...state.bill,
          items: state.bill.items.map((it) =>
            it.id === action.id
              ? { ...it, assignee: nextAssignee(it.assignee, action.direction) }
              : it
          ),
        },
      };
    }
    case "EDIT_NAME": {
      if (!state.bill) return state;
      return {
        bill: {
          ...state.bill,
          items: state.bill.items.map((it) =>
            it.id === action.id ? { ...it, name: action.name } : it
          ),
        },
      };
    }
    case "EDIT_PRICE": {
      if (!state.bill) return state;
      return {
        bill: {
          ...state.bill,
          items: state.bill.items.map((it) =>
            it.id === action.id ? { ...it, price: action.price } : it
          ),
        },
      };
    }
    case "SET_TAX_INCLUDED": {
      if (!state.bill) return state;
      return { bill: { ...state.bill, taxIncluded: action.value } };
    }
  }
}

const initial: State = { bill: null };

export function useBillStore() {
  const [state, dispatch] = useReducer(reducer, initial);
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
