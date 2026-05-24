import type { ExtractedReceipt } from "@splitbill/core";

// Synthetic restaurant receipt the M3 screens load when the user taps
// "Take photo" or "Choose from library". Sized to exercise:
//   - 8 line items (Unassigned section is populated on load)
//   - tax + tip extras (both inclusive toggles render in BillReview)
//   - $ currency
// Real picker + /api/extract POST land in M4; this fixture stays around
// as a test seed.
export const mockReceipt: ExtractedReceipt = {
  currency: "$",
  lines: [
    { name: "Margherita pizza", price: 14.0, category: "item" },
    { name: "Caesar salad", price: 12.0, category: "item" },
    { name: "Burger", price: 16.0, category: "item" },
    { name: "Fries", price: 6.0, category: "item" },
    { name: "IPA pint", price: 16.0, category: "item", quantity: 2 },
    { name: "Tiramisu", price: 9.0, category: "item" },
    { name: "Tax", price: 5.3, category: "tax" },
    { name: "Tip 15%", price: 9.0, category: "tip" },
  ],
  printedSubtotal: 73.0,
  printedTotal: 87.3,
  taxBehavior: "exclusive",
};

// 700 ms latency stand-in for the future POST /api/extract round-trip so
// the LoadingScreen is reachable from Start.
export function delayedExtract(): Promise<ExtractedReceipt> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockReceipt), 700);
  });
}
