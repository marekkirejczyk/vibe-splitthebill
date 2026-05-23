"use client";

import { AnimatePresence, LayoutGroup } from "framer-motion";
import {
  computeTotals,
  formatMoney,
  type Bill,
  type InclusiveFlags,
} from "@splitbill/core";
import { SwipeableRow } from "./SwipeableRow";
import { Totals } from "./Totals";

type Props = {
  bill: Bill;
  onSwipe: (id: string, direction: "left" | "right") => void;
  onEditName: (id: string, name: string) => void;
  onEditPrice: (id: string, price: number) => void;
  onSetInclusive: (kind: keyof InclusiveFlags, value: boolean) => void;
  onReset: () => void;
};

const INCLUSIVE_LABELS: Record<keyof InclusiveFlags, string> = {
  tax: "Tax already in prices",
  tip: "Tip already in prices",
  service: "Service already in prices",
};

export function BillReview({
  bill,
  onSwipe,
  onEditName,
  onEditPrice,
  onSetInclusive,
  onReset,
}: Props) {
  const unassigned = bill.items.filter((i) => i.assignee === null);
  const youItems = bill.items.filter((i) => i.assignee === "you");
  const themItems = bill.items.filter((i) => i.assignee === "them");
  const t = computeTotals(bill);

  const sections = [
    {
      key: "unassigned",
      title: "Unassigned",
      items: unassigned,
      chipBg: "bg-border",
      chipText: "text-text",
      count: unassigned.length,
      subtotal: null as number | null,
    },
    {
      key: "you",
      title: "You",
      items: youItems,
      chipBg: "bg-you-faint",
      chipText: "text-you",
      count: youItems.length,
      subtotal: t.you,
    },
    {
      key: "them",
      title: "Them",
      items: themItems,
      chipBg: "bg-them-faint",
      chipText: "text-them",
      count: themItems.length,
      subtotal: t.them,
    },
  ];

  return (
    <div className="flex flex-col min-h-dvh">
      <div
        aria-hidden
        className="h-2 w-full"
        style={{ background: "linear-gradient(90deg, #f97316 0%, #ec4899 100%)" }}
      />
      <header className="px-7 pt-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Your bill</h1>
            <p className="mt-1 text-[13px] font-medium text-muted">
              Swipe ◀ for You · Swipe ▶ for Them
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-muted underline-offset-2 hover:underline"
          >
            New bill
          </button>
        </div>
        {(["tax", "tip", "service"] as const).map((kind) => {
          const amount = bill.extras[kind];
          if (amount <= 0) return null;
          const checked = bill.inclusive[kind];
          return (
            <button
              key={kind}
              type="button"
              role="switch"
              aria-checked={checked}
              onClick={() => onSetInclusive(kind, !checked)}
              className="mt-3 flex w-full items-center gap-2 text-[12px] font-semibold text-muted"
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 items-center justify-center rounded border-2 text-[10px] leading-none ${
                  checked
                    ? "border-action bg-action text-white"
                    : "border-border bg-card"
                }`}
              >
                {checked ? "✓" : ""}
              </span>
              {INCLUSIVE_LABELS[kind]} · {formatMoney(amount, bill.currency)}
            </button>
          );
        })}
      </header>

      <LayoutGroup>
        <div className="px-7 mt-6 flex-1 pb-44">
          {sections.map((section) => (
            <section key={section.key} className="mt-6 first:mt-0">
              <div
                className={`inline-flex items-center rounded-full px-3.5 h-7 ${section.chipBg}`}
              >
                <span className={`text-[13px] font-bold ${section.chipText}`}>
                  {section.title}
                  {section.count > 0 && ` · ${section.count}`}
                  {section.subtotal != null && section.count > 0 &&
                    ` · ${formatMoney(section.subtotal, bill.currency)}`}
                </span>
              </div>
              <div className="mt-3 space-y-2 min-h-[8px]">
                <AnimatePresence initial={false}>
                  {section.items.map((item) => (
                    <SwipeableRow
                      key={item.id}
                      item={item}
                      currency={bill.currency}
                      onSwipe={(dir) => onSwipe(item.id, dir)}
                      onEditName={(name) => onEditName(item.id, name)}
                      onEditPrice={(price) => onEditPrice(item.id, price)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}
        </div>
      </LayoutGroup>

      <Totals bill={bill} />
    </div>
  );
}
