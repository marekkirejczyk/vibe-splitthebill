import { describe, expect, test } from "vitest";
import { computeTotals, formatMoney } from "./splitter";
import type { Bill, Item } from "./types";

function bill(items: Partial<Item>[], extras = { tax: 0, tip: 0, service: 0 }): Bill {
  return {
    currency: "$",
    items: items.map((it, i) => ({
      id: String(i),
      name: it.name ?? `item-${i}`,
      price: it.price ?? 0,
      assignee: it.assignee ?? null,
    })),
    extras,
  };
}

describe("computeTotals", () => {
  test("empty bill has zero totals", () => {
    const t = computeTotals(bill([]));
    expect(t).toEqual({ you: 0, them: 0, unassigned: 0, extras: 0 });
  });

  test("sums subtotals per assignee", () => {
    const t = computeTotals(
      bill([
        { price: 10, assignee: "you" },
        { price: 5, assignee: "you" },
        { price: 20, assignee: "them" },
        { price: 7.5, assignee: null },
      ])
    );
    expect(t.you).toBe(15);
    expect(t.them).toBe(20);
    expect(t.unassigned).toBe(7.5);
  });

  test("splits extras proportionally when both have items", () => {
    // You: $30, Them: $10 → 75% / 25% of $20 extras = $15 / $5
    const t = computeTotals(
      bill(
        [
          { price: 30, assignee: "you" },
          { price: 10, assignee: "them" },
        ],
        { tax: 12, tip: 8, service: 0 }
      )
    );
    expect(t.extras).toBe(20);
    expect(t.you).toBe(45);
    expect(t.them).toBe(15);
  });

  test("if only one side has items, that side absorbs all extras", () => {
    const t = computeTotals(
      bill(
        [{ price: 10, assignee: "you" }],
        { tax: 5, tip: 0, service: 0 }
      )
    );
    expect(t.you).toBe(15);
    expect(t.them).toBe(0);
  });

  test("with unassigned items present, extras are NOT prorated yet (held until items assigned)", () => {
    const t = computeTotals(
      bill(
        [{ price: 30, assignee: null }],
        { tax: 4, tip: 0, service: 0 }
      )
    );
    expect(t.you).toBe(0);
    expect(t.them).toBe(0);
    expect(t.unassigned).toBe(30);
    expect(t.extras).toBe(4);
  });

  test("with no items at all but extras present, splits 50/50 (avoid divide-by-zero)", () => {
    const t = computeTotals(bill([], { tax: 4, tip: 0, service: 0 }));
    expect(t.you).toBe(2);
    expect(t.them).toBe(2);
  });

  test("rounds to cents (no floating-point drift)", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS without rounding
    const t = computeTotals(
      bill([
        { price: 0.1, assignee: "you" },
        { price: 0.2, assignee: "you" },
      ])
    );
    expect(t.you).toBe(0.3);
  });

  test("you + them always equals subtotal + extras", () => {
    const t = computeTotals(
      bill(
        [
          { price: 17.33, assignee: "you" },
          { price: 12.67, assignee: "them" },
        ],
        { tax: 3.21, tip: 5.79, service: 1.0 }
      )
    );
    expect(t.you + t.them).toBeCloseTo(17.33 + 12.67 + 3.21 + 5.79 + 1.0, 2);
  });
});

describe("formatMoney", () => {
  test("two decimal places with default currency symbol", () => {
    expect(formatMoney(10)).toBe("$10.00");
    expect(formatMoney(10.5)).toBe("$10.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  test("respects custom currency symbol", () => {
    expect(formatMoney(12.5, "€")).toBe("€12.50");
    expect(formatMoney(8, "PLN ")).toBe("PLN 8.00");
  });

  test("rounds to cents", () => {
    expect(formatMoney(1.005)).toMatch(/\$1\.0[01]/); // banker's rounding ambiguity acceptable
    expect(formatMoney(1.234)).toBe("$1.23");
    expect(formatMoney(1.235)).toMatch(/\$1\.2[34]/);
  });
});
