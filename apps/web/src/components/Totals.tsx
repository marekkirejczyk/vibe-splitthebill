"use client";

import { computeTotals, formatMoney, type Bill } from "@splitbill/core";

export function Totals({ bill }: { bill: Bill }) {
  const t = computeTotals(bill);
  return (
    <div className="sticky bottom-0 left-0 right-0 bg-card border-t border-border pt-4 pb-8 px-7 pointer-events-auto">
      <div
        aria-hidden
        className="absolute -top-[3px] left-0 right-0 h-[3px]"
        style={{
          background: "linear-gradient(90deg, #f97316 0%, #ec4899 100%)",
        }}
      />
      {t.unassigned > 0 && (
        <div className="rounded-full bg-warn-bg text-warn-text font-bold text-xs px-4 py-2 mb-3 text-center">
          ⚠&nbsp;&nbsp;{formatMoney(t.unassigned, bill.currency)} still unassigned
        </div>
      )}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[12px] font-semibold text-muted">You</div>
          <div className="text-[26px] font-bold leading-none text-you mt-2 tabular-nums">
            {formatMoney(t.you, bill.currency)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-semibold text-muted">Them</div>
          <div className="text-[26px] font-bold leading-none text-them mt-2 tabular-nums">
            {formatMoney(t.them, bill.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
