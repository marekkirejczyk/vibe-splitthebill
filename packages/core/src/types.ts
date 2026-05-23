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

export type InclusiveFlags = {
  tax: boolean;
  tip: boolean;
  service: boolean;
};

export type Bill = {
  currency: string;
  items: Item[];
  extras: Extras;
  // Which extras are already baked into the listed item prices, and so must
  // NOT be added to per-person totals. Each flag is independent; the user
  // can flip any of them via the bill review header.
  inclusive: InclusiveFlags;
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
