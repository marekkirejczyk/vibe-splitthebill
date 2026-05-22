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
  const extras = bill.extras.tax + bill.extras.tip + bill.extras.service;
  const assigned = subYou + subThem;
  const shareYou =
    assigned > 0 ? extras * (subYou / assigned) : subU > 0 ? 0 : extras / 2;
  const shareThem =
    assigned > 0 ? extras - shareYou : subU > 0 ? 0 : extras / 2;
  return {
    you: round(subYou + shareYou),
    them: round(subThem + shareThem),
    unassigned: round(subU),
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
