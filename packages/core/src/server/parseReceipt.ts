import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedReceipt } from "../types";

const SYSTEM = `You are an expert at reading restaurant and store receipts from photos.
Extract every visible line that has a price into structured records.
- Use exact item names as printed (clean up obvious OCR mistakes only).
- Prices are positive numbers in the receipt's currency, with the cents preserved.
- Mark discounts and credits with NEGATIVE prices.
- Categorize each line carefully: "item" for goods/dishes; "tax", "tip", "service" for those charges; "discount" for negative line items; "subtotal" and "total" for the running totals; "other" for anything else (rounding, deposit, etc).
- If a line shows a quantity multiplier (e.g. "2 × IPA", "Espresso x3", "3 @ $3.50"), set "quantity" to that count. "price" is ALWAYS the line total as printed.
  - If the per-unit price is ALSO printed on the receipt (e.g. "2 × $8.00   $16.00" or "Espresso  3 @ $3.50   $10.50"), set "unitPrice" to that printed per-unit value.
  - If only the line total is printed (e.g. "IPA pint x2   $16.00"), leave "unitPrice" out — the app will divide.
- Whenever the receipt prints a subtotal line, fill "printedSubtotal" with it. Common labels: "Subtotal", "Sub Total", "PODSUMA" (Polish), "Zwischensumme" (German), "Sous-total" (French), "Subtotale" (Italian).
- Whenever the receipt prints a final total line, fill "printedTotal". Common labels: "Total", "Grand Total", "Amount Payable", "Balance Due", "SUMA" / "SUMA PLN" (Polish), "Gesamt" / "Summe" (German), "Total à payer" (French), "Totale" (Italian), "合計" (Japanese), "总计" (Chinese). These two numbers are used to cross-check the math, so always extract them when visible.
- Set "taxBehavior" to indicate whether item prices ALREADY include tax:
  - "inclusive" when the receipt explicitly says prices include tax — cues like "incl. GST", "incl. VAT", "MRP", "Inclusive of taxes", "Prices include tax", "VAT included", "GST included", "PTU" (Polish VAT abbreviation; Polish receipts are always inclusive), "MwSt." (German VAT — usually inclusive), "TVA" (French — usually inclusive), or when items are listed with their MRP (common in India). Most receipts from India, the EU (including Poland, Germany, France, Italy, Spain, Netherlands), the UK, Australia, and Japan are inclusive.
  - "exclusive" when tax is added on top — cues like "Sales tax", "+ Tax", "Tax (added)", or a US-style receipt that shows items, then "Subtotal", then "Tax", then "Total" with Total = Subtotal + Tax.
  - "unknown" when there's no tax line at all, or you genuinely cannot tell.
- IMPORTANT: do not confuse a sales-by-tax-rate breakdown with the tax itself. Polish receipts print lines like "Sp.op.A   13,64" / "Sp.op.C   146,25" — these are *subtotals of items taxed at each rate* (Sprzedaż opodatkowana), NOT tax amounts. Use category "other" (or skip) for these. The actual tax is on the "PTU A=…" / "PTU C=…" lines below. The same shape appears on German ("Netto/Brutto je Steuersatz") and other EU receipts.
- If you can't read the receipt at all, return an empty lines array.`;

const TOOL: Anthropic.Tool = {
  name: "record_receipt",
  description: "Records the parsed contents of a receipt.",
  input_schema: {
    type: "object",
    required: ["currency", "lines"],
    properties: {
      currency: {
        type: "string",
        description: "Currency symbol or ISO code, e.g. '$', '€', 'PLN'. Best guess.",
      },
      printedSubtotal: {
        type: "number",
        description:
          "The 'Subtotal' line as printed on the receipt, if visible. Omit otherwise.",
      },
      printedTotal: {
        type: "number",
        description:
          "The final 'Total' / 'Grand Total' / 'Amount Payable' line as printed, if visible. Omit otherwise.",
      },
      taxBehavior: {
        type: "string",
        enum: ["inclusive", "exclusive", "unknown"],
        description:
          "Whether item prices already include tax. 'inclusive' when the receipt says so (incl. GST/VAT, MRP, etc.). 'exclusive' when tax is added on top (US-style). 'unknown' otherwise.",
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "price", "category"],
          properties: {
            name: { type: "string" },
            price: {
              type: "number",
              description:
                "Line total as printed on the receipt (NOT per-unit when quantity > 1).",
            },
            category: {
              type: "string",
              enum: [
                "item",
                "tax",
                "tip",
                "service",
                "discount",
                "subtotal",
                "total",
                "other",
              ],
            },
            quantity: {
              type: "integer",
              minimum: 1,
              description:
                "Number of units on this line. Default 1. Set when the receipt shows a multiplier like '2 ×', 'x3', '3 @'.",
            },
            unitPrice: {
              type: "number",
              description:
                "Per-unit price IF the receipt prints it explicitly (e.g. '2 × $8.00 $16.00' or '3 @ $3.50 $10.50'). Omit when only the line total is shown.",
            },
          },
        },
      },
    },
  },
};

export async function extractReceipt(
  client: Anthropic,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"
): Promise<ExtractedReceipt> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_receipt" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Extract every line item with a price from this receipt and call record_receipt.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return toolUse.input as ExtractedReceipt;
}
