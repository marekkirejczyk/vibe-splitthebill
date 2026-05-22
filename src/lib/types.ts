export type Assignee = "you" | "them" | null;

export type Item = {
  id: string;
  name: string;
  price: number;
  assignee: Assignee;
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
};

export type ExtractedReceipt = {
  currency: string;
  lines: ExtractedLine[];
};
