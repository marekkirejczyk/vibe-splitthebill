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
    "extracts line items from a synthetic receipt",
    async () => {
      const buf = await readFile(join(FIX, "receipt.jpg"));
      const result = await extractReceipt(
        client(),
        buf.toString("base64"),
        "image/jpeg"
      );

      expect(result.currency).toBeTruthy();
      const items = result.lines.filter((l) => l.category === "item");
      // The synthetic receipt has 6 items; tolerate ±1 for OCR drift.
      expect(items.length).toBeGreaterThanOrEqual(5);
      expect(items.length).toBeLessThanOrEqual(7);

      // Prices we know are on the receipt.
      const prices = new Set(items.map((l) => l.price));
      expect(prices).toContain(14.0);
      expect(prices).toContain(11.5);

      // Tax line should be picked up.
      const tax = result.lines.find((l) => l.category === "tax");
      expect(tax?.price).toBeCloseTo(4.88, 1);

      // Tip line should be picked up.
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
