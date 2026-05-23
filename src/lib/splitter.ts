import type { Bill } from "./types";

export type Totals = {
  you: number;
  them: number;
  unassigned: number;
  extras: number;
};

export function computeTotals(bill: Bill): Totals {
  const subYou = sum(bill.items, "you");
  const subThem = sum(bill.items, "them");
  const subU = sum(bill.items, null);
  // Each extra is zeroed independently when its corresponding `inclusive`
  // flag is on — those amounts are already baked into the item prices and
  // adding them again would double-count.
  const tax = bill.inclusive.tax ? 0 : bill.extras.tax;
  const tip = bill.inclusive.tip ? 0 : bill.extras.tip;
  const service = bill.inclusive.service ? 0 : bill.extras.service;
  const extras = tax + tip + service;
  const itemsTotal = subYou + subThem + subU;

  let shareYou: number, shareThem: number, shareU: number;
  if (itemsTotal > 0) {
    // Prorate extras over the FULL items pool, not just the assigned portion.
    // Otherwise the first person to be assigned anything absorbs the entire
    // extras pool until the other person also has items.
    shareYou = extras * (subYou / itemsTotal);
    shareThem = extras * (subThem / itemsTotal);
    shareU = extras - shareYou - shareThem;
  } else {
    // No items at all — split extras 50/50 to avoid divide-by-zero.
    shareYou = extras / 2;
    shareThem = extras - shareYou;
    shareU = 0;
  }

  return {
    you: round(subYou + shareYou),
    them: round(subThem + shareThem),
    unassigned: round(subU + shareU),
    extras: round(extras),
  };
}

function sum(items: Bill["items"], who: Bill["items"][number]["assignee"]) {
  return items.filter((i) => i.assignee === who).reduce((a, i) => a + i.price, 0);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatMoney(n: number, currency = "$") {
  return `${currency}${n.toFixed(2)}`;
}
