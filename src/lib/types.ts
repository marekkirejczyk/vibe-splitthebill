export type Assignee = "you" | "them" | null;

export type Item = {
  id: string;
  name: string;
  price: number;
  assignee: Assignee;
};

export type MultiItem = {
  name: string;
  lineTotal: number;
  quantity: number;
  unitPrice?: number;
};

export type Extras = {
  tax: number;
  tip: number;
  service: number;
};

export type Bill = {
  currency: string;
  items: Item[];
  extras: Extras;
  // True when the extracted item prices already include tax (VAT/GST/MRP),
  // so `extras.tax` is informational and must NOT be added to per-person
  // totals. Set by `detectTaxIncluded` at load time; flippable by the user.
  taxIncluded: boolean;
};

export type ExtractCategory =
  | "item"
  | "tax"
  | "tip"
  | "service"
  | "discount"
  | "subtotal"
  | "total"
  | "other";

export type ExtractedLine = {
  name: string;
  price: number;
  category: ExtractCategory;
  quantity?: number;
  unitPrice?: number;
};

export type ExtractedReceipt = {
  currency: string;
  lines: ExtractedLine[];
  printedSubtotal?: number;
  printedTotal?: number;
  taxBehavior?: "inclusive" | "exclusive" | "unknown";
};
