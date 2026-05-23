import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractReceipt } from "./parseReceipt";

const FIX = join(process.cwd(), "tests", "fixtures");
const RUN = process.env.RUN_ANTHROPIC_TESTS === "1" && !!process.env.ANTHROPIC_API_KEY;

// These tests call the real Anthropic API and consume credits. They're skipped
// unless RUN_ANTHROPIC_TESTS=1 AND ANTHROPIC_API_KEY is set in the env.
//
// To run locally:
//   RUN_ANTHROPIC_TESTS=1 ANTHROPIC_API_KEY=sk-ant-... pnpm test:int
describe.skipIf(!RUN)("extractReceipt (real Anthropic API)", () => {
  const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  it(
    "extracts line items from a synthetic receipt covering all three line shapes",
    async () => {
      const buf = await readFile(join(FIX, "receipt.jpg"));
      const result = await extractReceipt(
        client(),
        buf.toString("base64"),
        "image/jpeg"
      );

      expect(result.currency).toBeTruthy();
      const items = result.lines.filter((l) => l.category === "item");

      // The synthetic receipt has 4 singles + 1 "IPA pint × 2" + 1 "2 × Espresso @ $3.50".
      // Models may report each multi-qty line as ONE line with quantity=2, or
      // collapse them into 2 separate single-quantity lines. We accept both.
      // Total units across the bill is always 6.
      const totalUnits = items.reduce((sum, l) => sum + (l.quantity ?? 1), 0);
      expect(totalUnits).toBeGreaterThanOrEqual(5);
      expect(totalUnits).toBeLessThanOrEqual(7);

      // Group by name (case-insensitive substring) and verify totals per group.
      const findByName = (needle: string) =>
        items.filter((l) => l.name.toLowerCase().includes(needle));

      // Shape 1 — singles
      const margherita = findByName("margherita");
      expect(margherita).toHaveLength(1);
      expect(margherita[0].price).toBeCloseTo(14, 1);
      expect(findByName("caesar")[0]?.price).toBeCloseTo(11.5, 1);
      expect(findByName("tiramisu")[0]?.price).toBeCloseTo(11, 1);

      // Shape 2 — IPA pint × 2 ($16.00 total, no per-unit printed): expect
      // either {quantity:2, price:16, no unitPrice} or two lines of $8.
      const ipa = findByName("ipa");
      const ipaUnits = ipa.reduce((s, l) => s + (l.quantity ?? 1), 0);
      expect(ipaUnits).toBe(2);
      if (ipa.length === 1 && (ipa[0].quantity ?? 1) === 2) {
        expect(ipa[0].price).toBeCloseTo(16, 1);
        expect(ipa[0].unitPrice).toBeUndefined(); // no per-unit on the receipt
      } else {
        // Collapsed into two singles.
        for (const l of ipa) expect(l.price).toBeCloseTo(8, 1);
      }

      // Shape 3 — 2 × Espresso @ $3.50 ($7.00 total, per-unit IS printed):
      // expect {quantity:2, price:7, unitPrice:3.5} or two lines of $3.50.
      const espresso = findByName("espresso");
      const espressoUnits = espresso.reduce((s, l) => s + (l.quantity ?? 1), 0);
      expect(espressoUnits).toBe(2);
      if (espresso.length === 1 && (espresso[0].quantity ?? 1) === 2) {
        expect(espresso[0].price).toBeCloseTo(7, 1);
        expect(espresso[0].unitPrice).toBeCloseTo(3.5, 2);
      } else {
        for (const l of espresso) expect(l.price).toBeCloseTo(3.5, 2);
      }

      // Tax and tip still picked up.
      const tax = result.lines.find((l) => l.category === "tax");
      expect(tax?.price).toBeCloseTo(5.08, 1);
      const tip = result.lines.find((l) => l.category === "tip");
      expect(tip?.price).toBeCloseTo(10, 0);
    },
    60_000
  );

  it(
    "returns an empty / non-item-heavy result for a non-receipt image",
    async () => {
      const buf = await readFile(join(FIX, "not-a-receipt.jpg"));
      const result = await extractReceipt(
        client(),
        buf.toString("base64"),
        "image/jpeg"
      );
      const items = result.lines.filter((l) => l.category === "item");
      expect(items.length).toBe(0);
    },
    60_000
  );
});

describe("extractReceipt (offline contract)", () => {
  it("delegates to client.messages.create and parses the tool_use block", async () => {
    const captured: { args?: unknown } = {};
    const fakeClient = {
      messages: {
        create: async (args: unknown) => {
          captured.args = args;
          return {
            content: [
              {
                type: "tool_use",
                name: "record_receipt",
                input: {
                  currency: "€",
                  lines: [{ name: "Espresso", price: 2.5, category: "item" }],
                },
              },
            ],
          };
        },
      },
    } as unknown as Anthropic;

    const result = await extractReceipt(fakeClient, "ZmFrZQ==", "image/jpeg");
    expect(result.currency).toBe("€");
    expect(result.lines).toEqual([
      { name: "Espresso", price: 2.5, category: "item" },
    ]);
    // Verify we forced a tool call (so the model has to return structured data).
    const args = captured.args as { tool_choice: { type: string; name: string } };
    expect(args.tool_choice).toEqual({ type: "tool", name: "record_receipt" });
  });

  it("throws if no tool_use block is returned", async () => {
    const fakeClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text", text: "I refuse." }],
        }),
      },
    } as unknown as Anthropic;
    await expect(
      extractReceipt(fakeClient, "ZmFrZQ==", "image/jpeg")
    ).rejects.toThrow(/tool_use/);
  });
});
