import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedReceipt } from "./types";

const SYSTEM = `You are an expert at reading restaurant and store receipts from photos.
Extract every visible line that has a price into structured records.
- Use exact item names as printed (clean up obvious OCR mistakes only).
- Prices are positive numbers in the receipt's currency, with the cents preserved.
- Mark discounts and credits with NEGATIVE prices.
- Categorize each line carefully: "item" for goods/dishes; "tax", "tip", "service" for those charges; "discount" for negative line items; "subtotal" and "total" for the running totals; "other" for anything else (rounding, deposit, etc).
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
      lines: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "price", "category"],
          properties: {
            name: { type: "string" },
            price: { type: "number" },
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
