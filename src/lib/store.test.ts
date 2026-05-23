import { describe, expect, test } from "vitest";
import {
  billFromReceipt,
  detectInclusive,
  expandItemLine,
  nextAssignee,
  toMultiItem,
} from "./store";
import type { ExtractedLine, ExtractedReceipt, MultiItem } from "./types";

describe("nextAssignee state machine", () => {
  test("unassigned + left → you", () => {
    expect(nextAssignee(null, "left")).toBe("you");
  });
  test("unassigned + right → them", () => {
    expect(nextAssignee(null, "right")).toBe("them");
  });

  test("you + left → unassigned (re-swipe same direction)", () => {
    expect(nextAssignee("you", "left")).toBeNull();
  });
  test("you + right → them (switch sides)", () => {
    expect(nextAssignee("you", "right")).toBe("them");
  });

  test("them + right → unassigned (re-swipe same direction)", () => {
    expect(nextAssignee("them", "right")).toBeNull();
  });
  test("them + left → you (switch sides)", () => {
    expect(nextAssignee("them", "left")).toBe("you");
  });

  test("two left-swipes on unassigned returns it to unassigned", () => {
    const after1 = nextAssignee(null, "left");
    const after2 = nextAssignee(after1, "left");
    expect(after2).toBeNull();
  });

  test("right then left from unassigned ends at you (not unassigned)", () => {
    const a = nextAssignee(null, "right"); // them
    const b = nextAssignee(a, "left"); // you (switch sides, not unassign)
    expect(b).toBe("you");
  });
});

describe("toMultiItem", () => {
  const base = (over: Partial<ExtractedLine>): ExtractedLine => ({
    name: "x",
    price: 10,
    category: "item",
    ...over,
  });

  test("undefined quantity → 1", () => {
    expect(toMultiItem(base({})).quantity).toBe(1);
  });
  test("zero quantity → 1 (degrades safely)", () => {
    expect(toMultiItem(base({ quantity: 0 })).quantity).toBe(1);
  });
  test("fractional quantity floors to ≥1 (0.4 → 1, 2.7 → 2)", () => {
    expect(toMultiItem(base({ quantity: 0.4 })).quantity).toBe(1);
    expect(toMultiItem(base({ quantity: 2.7 })).quantity).toBe(2);
  });
  test("NaN/Infinity quantity → 1", () => {
    expect(toMultiItem(base({ quantity: Number.NaN })).quantity).toBe(1);
    expect(toMultiItem(base({ quantity: Number.POSITIVE_INFINITY })).quantity).toBe(1);
  });
  test("passes name, unitPrice, and lineTotal through", () => {
    const mi = toMultiItem(
      base({ name: "IPA pint", price: 16, quantity: 2, unitPrice: 8 })
    );
    expect(mi).toEqual({
      name: "IPA pint",
      lineTotal: 16,
      quantity: 2,
      unitPrice: 8,
    });
  });
});

describe("expandItemLine", () => {
  const mi = (over: Partial<MultiItem>): MultiItem => ({
    name: "item",
    lineTotal: 10,
    quantity: 1,
    ...over,
  });

  // Shape 1 — single
  test("quantity 1 → one row at lineTotal", () => {
    expect(expandItemLine(mi({ name: "Margherita", lineTotal: 14 }))).toEqual([
      { name: "Margherita", price: 14 },
    ]);
  });

  // Shape 2 — count + total only
  describe("count + total only (Case B: app divides)", () => {
    test("clean division: $16 / 2 → two $8.00 rows", () => {
      const rows = expandItemLine(mi({ name: "IPA", lineTotal: 16, quantity: 2 }));
      expect(rows).toEqual([
        { name: "IPA", price: 8 },
        { name: "IPA", price: 8 },
      ]);
    });

    test("uneven division: $10 / 3 → [3.34, 3.33, 3.33], sum = $10.00", () => {
      const rows = expandItemLine(mi({ name: "X", lineTotal: 10, quantity: 3 }));
      expect(rows.map((r) => r.price)).toEqual([3.34, 3.33, 3.33]);
      const sum = rows.reduce((a, r) => a + r.price, 0);
      expect(sum).toBeCloseTo(10, 2);
    });

    test("large quantity: $1.00 / 7 distributes the 2¢ remainder", () => {
      const rows = expandItemLine(mi({ lineTotal: 1, quantity: 7 }));
      expect(rows).toHaveLength(7);
      const sumCents = rows.reduce((a, r) => a + Math.round(r.price * 100), 0);
      expect(sumCents).toBe(100);
      // exactly two rows are 1¢ higher than the rest
      const counts = rows.reduce<Record<number, number>>((acc, r) => {
        acc[r.price] = (acc[r.price] || 0) + 1;
        return acc;
      }, {});
      expect(counts[0.15]).toBe(2);
      expect(counts[0.14]).toBe(5);
    });

    test("conservation: every (total, qty) sum exactly equals the lineTotal", () => {
      const cases: Array<[number, number]> = [
        [10, 3],
        [9.99, 4],
        [0.01, 3],
        [1234.56, 7],
        [5, 6],
      ];
      for (const [total, qty] of cases) {
        const rows = expandItemLine(mi({ lineTotal: total, quantity: qty }));
        const sumCents = rows.reduce(
          (a, r) => a + Math.round(r.price * 100),
          0
        );
        expect(sumCents, `total=${total} qty=${qty}`).toBe(
          Math.round(total * 100)
        );
      }
    });
  });

  // Shape 3 — count + per-unit + total
  describe("count + per-unit + total (Case A: printed per-unit wins)", () => {
    test("clean: $16 / 2 with unitPrice=$8 → two $8.00 rows", () => {
      const rows = expandItemLine(
        mi({ name: "IPA", lineTotal: 16, quantity: 2, unitPrice: 8 })
      );
      expect(rows).toEqual([
        { name: "IPA", price: 8 },
        { name: "IPA", price: 8 },
      ]);
    });

    test("printed-per-unit wins even when sum ≠ lineTotal", () => {
      // Receipt printed 3 × $3.34 with total $10.00 (rounded for display).
      // We honor the printed per-unit; the sum is $10.02, not $10.00.
      const rows = expandItemLine(
        mi({ name: "X", lineTotal: 10, quantity: 3, unitPrice: 3.34 })
      );
      expect(rows.map((r) => r.price)).toEqual([3.34, 3.34, 3.34]);
      const sum = rows.reduce((a, r) => a + r.price, 0);
      expect(sum).toBeCloseTo(10.02, 2);
    });

    test("non-finite unitPrice falls back to division (Case B)", () => {
      const rows = expandItemLine(
        mi({ lineTotal: 10, quantity: 2, unitPrice: Number.NaN })
      );
      expect(rows.map((r) => r.price)).toEqual([5, 5]);
    });
  });
});

describe("billFromReceipt (the LOAD_RECEIPT effect)", () => {
  test("expands all three line shapes and tags every item with a unique id", () => {
    const receipt: ExtractedReceipt = {
      currency: "$",
      lines: [
        // Shape 1
        { name: "Margherita", price: 14, category: "item" },
        // Shape 2
        { name: "IPA pint", price: 16, category: "item", quantity: 2 },
        // Shape 3
        {
          name: "Espresso",
          price: 7,
          category: "item",
          quantity: 2,
          unitPrice: 3.5,
        },
        { name: "Tax", price: 2.05, category: "tax" },
      ],
    };

    const bill = billFromReceipt(receipt);

    // 1 single + 2 (Shape 2 expanded) + 2 (Shape 3 expanded) = 5 items
    expect(bill.items).toHaveLength(5);

    // Per-unit prices honored
    const byName = bill.items.reduce<Record<string, number[]>>((acc, it) => {
      (acc[it.name] ||= []).push(it.price);
      return acc;
    }, {});
    expect(byName["Margherita"]).toEqual([14]);
    expect(byName["IPA pint"]).toEqual([8, 8]); // divided
    expect(byName["Espresso"]).toEqual([3.5, 3.5]); // printed-per-unit

    // Every item has a distinct id and starts unassigned
    const ids = new Set(bill.items.map((i) => i.id));
    expect(ids.size).toBe(5);
    for (const item of bill.items) {
      expect(item.assignee).toBeNull();
      expect(item.id).toBeTypeOf("string");
      expect(item.id.length).toBeGreaterThan(0);
    }

    // Non-item categories still accumulate into extras
    expect(bill.extras.tax).toBeCloseTo(2.05, 2);
    expect(bill.extras.tip).toBe(0);
    // No textual hint + no printedTotal → safe default { false, false, false }
    expect(bill.inclusive).toEqual({ tax: false, tip: false, service: false });
  });

  test("propagates detected inclusive flags onto the Bill", () => {
    const receipt: ExtractedReceipt = {
      currency: "₹",
      lines: [
        { name: "Pav Bhaji", price: 235, category: "item" },
        { name: "Naan", price: 1595, category: "item" },
        { name: "CGST 2.5%", price: 45.75, category: "tax" },
        { name: "SGST 2.5%", price: 45.75, category: "tax" },
      ],
      printedTotal: 1830,
      taxBehavior: "inclusive",
    };
    expect(billFromReceipt(receipt).inclusive).toEqual({
      tax: true,
      tip: false,
      service: false,
    });
  });
});

describe("detectInclusive", () => {
  const base = (over: Partial<ExtractedReceipt>): ExtractedReceipt => ({
    currency: "$",
    lines: [],
    ...over,
  });
  const line = (over: Partial<ExtractedLine>): ExtractedLine => ({
    name: "x",
    price: 0,
    category: "item",
    ...over,
  });

  test("no extras → all flags false", () => {
    expect(
      detectInclusive(base({ lines: [line({ price: 10 })], printedTotal: 10 }))
    ).toEqual({ tax: false, tip: false, service: false });
  });

  test("all-inclusive (items == printedTotal): every non-zero extra flagged true", () => {
    // sum(items) = 100 matches printedTotal 100 → all three extras below are
    // informational, even though no taxBehavior hint is supplied.
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 100 }),
            line({ price: 8, category: "tax" }),
            line({ price: 5, category: "tip" }),
            line({ price: 3, category: "service" }),
          ],
          printedTotal: 100,
        })
      )
    ).toEqual({ tax: true, tip: true, service: true });
  });

  test("all-inclusive only flags categories that actually have a line", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 100 }),
            line({ price: 10, category: "service" }),
          ],
          printedTotal: 100,
        })
      )
    ).toEqual({ tax: false, tip: false, service: true });
  });

  test("textual 'inclusive' hint flags tax even without printedTotal", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 50 }),
            line({ price: 4, category: "tax" }),
          ],
          taxBehavior: "inclusive",
        })
      )
    ).toEqual({ tax: true, tip: false, service: false });
  });

  test("textual 'exclusive' wins over math", () => {
    // Math matches inclusive (sum(items) == printedTotal), but textual hint wins.
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 1830 }),
            line({ price: 91.5, category: "tax" }),
          ],
          printedTotal: 1830,
          taxBehavior: "exclusive",
        })
      )
    ).toEqual({ tax: false, tip: false, service: false });
  });

  test("Indian GST shape (math): items + tip == printedTotal → tax inclusive only", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 235 }),
            line({ price: 1595 }),
            line({ price: 91.5, category: "tax" }),
            line({ price: 50, category: "tip" }),
          ],
          printedTotal: 1880, // 235 + 1595 + 50
        })
      )
    ).toEqual({ tax: true, tip: false, service: false });
  });

  test("US-style (math): items + tax == printedTotal → all flags false", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 50 }),
            line({ price: 4, category: "tax" }),
          ],
          printedTotal: 54,
        })
      )
    ).toEqual({ tax: false, tip: false, service: false });
  });

  test("no printedTotal + no textual hint → safe defaults", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 50 }),
            line({ price: 4, category: "tax" }),
            line({ price: 5, category: "tip" }),
          ],
        })
      )
    ).toEqual({ tax: false, tip: false, service: false });
  });

  test("tolerance forgives 1% drift on the all-inclusive check", () => {
    // items 1825 vs printedTotal 1830 — 5 off, tol = 18.30 → inclusive.
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 1825 }),
            line({ price: 91.5, category: "tax" }),
          ],
          printedTotal: 1830,
        })
      ).tax
    ).toBe(true);
  });

  test("ambiguous totals far outside tolerance → all defaults", () => {
    expect(
      detectInclusive(
        base({
          lines: [
            line({ price: 100 }),
            line({ price: 4, category: "tax" }),
          ],
          printedTotal: 200,
        })
      )
    ).toEqual({ tax: false, tip: false, service: false });
  });

  test("Polish PARAGON FISKALNY shape: items match SUMA PLN exactly, two PTU lines are inclusive", () => {
    // Frac Bis Sp. z o.o., Warszawa — items sum 159.89 == SUMA PLN 159.89;
    // PTU A (23%) = 2.55 and PTU C (5%) = 6.96 are informational VAT.
    expect(
      detectInclusive(
        base({
          currency: "PLN",
          lines: [
            line({ name: "OGÓREK SZKLARNIOWY", price: 2.23 }),
            line({ name: "JAN.N WORKI LD MAGNUM", price: 8.99 }),
            line({ name: "POMIDOR POLSKI OKRĄGŁY", price: 7.0 }),
            line({ name: "BORÓWKA AMERYKAŃSKA", price: 34.99 }),
            line({ name: "HOCHLAND SEREK ALMETTE", price: 6.99 }),
            line({ name: "MLEKOVITA SER FAVITA", price: 7.99 }),
            line({ name: "TRUSKAWKA", price: 29.99 }),
            line({ name: "TARCZYŃSKI PARÓWKI", price: 8.99 }),
            line({ name: "BG CHLEB RUSTYKALNY", price: 12.85 }),
            line({ name: "BG CHLEB RUSTYKALNY", price: 12.85 }),
            line({ name: "WAFLE RYŻOWE W CZEKOL.", price: 4.65 }),
            line({ name: "KUPIEC WAFLE KUKURYDZIANE", price: 7.49 }),
            line({ name: "WAFLE KUKURYDZI Z SIEM.NIANYM", price: 6.49 }),
            line({ name: "DEVELEY NACHOS TORTILLA CHIPS", price: 8.39 }),
            line({ name: "PTU A=23,00%", price: 2.55, category: "tax" }),
            line({ name: "PTU C=5,00%", price: 6.96, category: "tax" }),
          ],
          printedSubtotal: 159.89,
          printedTotal: 159.89,
          // No textBehavior hint — we rely on the math signal alone.
        })
      )
    ).toEqual({ tax: true, tip: false, service: false });
  });
});
