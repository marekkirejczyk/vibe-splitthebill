"use client";

import { useEffect, useReducer, useState } from "react";
import type {
  Assignee,
  Bill,
  ExtractCategory,
  ExtractedLine,
  ExtractedReceipt,
  InclusiveFlags,
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
  | { type: "SET_INCLUSIVE"; kind: keyof InclusiveFlags; value: boolean }
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
    inclusive: detectInclusive(r),
  };
}

// Decide which extras (if any) are already baked into the listed item prices.
// Each flag is independent so the user can correct a single one without
// changing the others.
//
// Tax: textual signal from the model wins; otherwise math cross-checks
// `sum(items) + tip + service` against `printedTotal`. Default false.
//
// Tip + service: there's no strong textual signal, so we anchor on the
// "everything inclusive" math case — when `sum(items) ≈ printedTotal`,
// every extra below it is informational. Default false otherwise (tip and
// service are nearly always additive).
export function detectInclusive(r: ExtractedReceipt): InclusiveFlags {
  const sumOf = (cat: ExtractCategory) =>
    r.lines.filter((l) => l.category === cat).reduce((a, l) => a + l.price, 0);

  const items = r.lines
    .filter((l) => l.category === "item" || l.category === "discount")
    .reduce((a, l) => a + l.price, 0);
  const tax = sumOf("tax");
  const tip = sumOf("tip");
  const service = sumOf("service");

  // An explicit "exclusive" textual signal overrides everything below — the
  // user/receipt told us tax is additive, so don't second-guess from math.
  if (r.taxBehavior === "exclusive") {
    return { tax: false, tip: false, service: false };
  }

  const hasTotal = typeof r.printedTotal === "number" && Number.isFinite(r.printedTotal);
  const total = hasTotal ? (r.printedTotal as number) : NaN;
  const tol = hasTotal ? Math.max(0.05, 0.01 * Math.abs(total)) : 0;

  // All-inclusive: items alone match the printed total — every visible extra
  // is informational, regardless of which categories appear.
  if (hasTotal && Math.abs(items - total) <= tol) {
    return {
      tax: tax > 0,
      tip: tip > 0,
      service: service > 0,
    };
  }

  // Tax-only inclusive: text hint, or items + tip + service match the total
  // (common Indian / EU / UK shape with a real tip added on top).
  let taxIncluded = false;
  if (tax > 0) {
    if (r.taxBehavior === "inclusive") taxIncluded = true;
    else if (hasTotal) {
      const inclusiveDist = Math.abs(items + tip + service - total);
      const exclusiveDist = Math.abs(items + tax + tip + service - total);
      taxIncluded = inclusiveDist <= tol && inclusiveDist < exclusiveDist;
    }
  }

  return { tax: taxIncluded, tip: false, service: false };
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
    case "REHYDRATE": {
      if (!action.bill) return { bill: null };
      // Pre-existing bills in localStorage may lack `inclusive` entirely, or
      // carry a single-boolean `taxIncluded` from the earlier shape — fold
      // both into the current InclusiveFlags shape.
      const legacy = action.bill as Bill & { taxIncluded?: boolean };
      const inclusive: InclusiveFlags = action.bill.inclusive ?? {
        tax: legacy.taxIncluded ?? false,
        tip: false,
        service: false,
      };
      return { bill: { ...action.bill, inclusive } };
    }
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
    case "SET_INCLUSIVE": {
      if (!state.bill) return state;
      return {
        bill: {
          ...state.bill,
          inclusive: { ...state.bill.inclusive, [action.kind]: action.value },
        },
      };
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
