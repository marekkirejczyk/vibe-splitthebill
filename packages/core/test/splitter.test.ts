import { describe, expect, test } from "vitest";
import { computeTotals, formatMoney } from "../src/splitter";
import type { Bill, Item } from "../src/types";

function bill(
  items: Partial<Item>[],
  extras = { tax: 0, tip: 0, service: 0 },
  inclusive: Bill["inclusive"] = { tax: false, tip: false, service: false }
): Bill {
  return {
    currency: "$",
    items: items.map((it, i) => ({
      id: String(i),
      name: it.name ?? `item-${i}`,
      price: it.price ?? 0,
      assignee: it.assignee ?? null,
    })),
    extras,
    inclusive,
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

  test("if only one side has items AND nothing else is unassigned, that side absorbs all extras", () => {
    const t = computeTotals(
      bill(
        [{ price: 10, assignee: "you" }],
        { tax: 5, tip: 0, service: 0 }
      )
    );
    expect(t.you).toBe(15);
    expect(t.them).toBe(0);
    expect(t.unassigned).toBe(0);
  });

  test("partial assignment: extras prorate over (you + them + unassigned), NOT just assigned (regression: GH bug report)", () => {
    // Real-world bug: one ₹235 item assigned to Them, ₹1595 still unassigned,
    // ₹91.50 extras. Old logic gave Them ALL ₹91.50 (because denominator
    // was just `assigned`). New logic spreads extras across the full bill.
    const t = computeTotals(
      bill(
        [
          { price: 235, assignee: "them" },
          { price: 1595, assignee: null },
        ],
        { tax: 91.5, tip: 0, service: 0 }
      )
    );
    // Them only gets their proportional share of extras (235/1830 of 91.50)
    expect(t.them).toBeCloseTo(235 + 91.5 * (235 / 1830), 2);
    expect(t.you).toBe(0);
    // Unassigned bucket carries the remainder of the extras
    expect(t.unassigned).toBeCloseTo(1595 + 91.5 * (1595 / 1830), 2);
    // Total money is conserved
    expect(t.you + t.them + t.unassigned).toBeCloseTo(235 + 1595 + 91.5, 2);
  });

  test("with everything unassigned, extras flow entirely into the unassigned bucket", () => {
    const t = computeTotals(
      bill(
        [{ price: 30, assignee: null }],
        { tax: 4, tip: 0, service: 0 }
      )
    );
    expect(t.you).toBe(0);
    expect(t.them).toBe(0);
    expect(t.unassigned).toBe(34); // 30 of food + all 4 of tax
    expect(t.extras).toBe(4);
  });

  test("with no items at all but extras present, splits 50/50 (avoid divide-by-zero)", () => {
    const t = computeTotals(bill([], { tax: 4, tip: 0, service: 0 }));
    expect(t.you).toBe(2);
    expect(t.them).toBe(2);
    expect(t.unassigned).toBe(0);
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

  describe("inclusive flags", () => {
    test("tax inclusive: tax skipped, tip + service still prorate", () => {
      // Indian-style: items already include GST (₹91.50). Tip ₹50 stays additive.
      const t = computeTotals(
        bill(
          [
            { price: 235, assignee: "them" },
            { price: 1595, assignee: "you" },
          ],
          { tax: 91.5, tip: 50, service: 0 },
          { tax: true, tip: false, service: false }
        )
      );
      expect(t.them).toBeCloseTo(235 + 50 * (235 / 1830), 2);
      expect(t.you).toBeCloseTo(1595 + 50 * (1595 / 1830), 2);
      expect(t.unassigned).toBeCloseTo(0, 2);
      expect(t.extras).toBe(50);
      expect(t.you + t.them + t.unassigned).toBeCloseTo(235 + 1595 + 50, 2);
    });

    test("all three inclusive: per-person totals equal item subtotals exactly", () => {
      const t = computeTotals(
        bill(
          [
            { price: 235, assignee: "them" },
            { price: 1595, assignee: "you" },
          ],
          { tax: 91.5, tip: 50, service: 30 },
          { tax: true, tip: true, service: true }
        )
      );
      expect(t.them).toBe(235);
      expect(t.you).toBe(1595);
      expect(t.unassigned).toBe(0);
      expect(t.extras).toBe(0);
    });

    test("service-only inclusive: tip + tax still added", () => {
      // Hong-Kong style: 10% service already in prices, sales tax + tip extra.
      const t = computeTotals(
        bill(
          [{ price: 100, assignee: "you" }],
          { tax: 8, tip: 5, service: 10 },
          { tax: false, tip: false, service: true }
        )
      );
      expect(t.extras).toBe(13);
      expect(t.you).toBe(113);
    });

    test("tax inclusive + partial assignment: unassigned doesn't absorb tax share", () => {
      const t = computeTotals(
        bill(
          [
            { price: 235, assignee: "them" },
            { price: 1595, assignee: null },
          ],
          { tax: 91.5, tip: 0, service: 0 },
          { tax: true, tip: false, service: false }
        )
      );
      expect(t.them).toBe(235);
      expect(t.unassigned).toBe(1595);
      expect(t.you).toBe(0);
      expect(t.extras).toBe(0);
    });
  });

  test("you + them + unassigned always equals subtotal + extras (money is conserved)", () => {
    const t = computeTotals(
      bill(
        [
          { price: 17.33, assignee: "you" },
          { price: 12.67, assignee: "them" },
          { price: 9.99, assignee: null },
        ],
        { tax: 3.21, tip: 5.79, service: 1.0 }
      )
    );
    expect(t.you + t.them + t.unassigned).toBeCloseTo(
      17.33 + 12.67 + 9.99 + 3.21 + 5.79 + 1.0,
      2
    );
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
