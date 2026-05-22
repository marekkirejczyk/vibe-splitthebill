"use client";

import { useState } from "react";
import { BillReview } from "@/components/BillReview";
import { ImageInput } from "@/components/ImageInput";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useBillStore } from "@/lib/store";
import type { ExtractedReceipt } from "@/lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "idle" };

export default function Home() {
  const [state, dispatch, hydrated] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function handlePick(file: File) {
    setPhase({ kind: "loading" });
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
      const receipt = (await res.json()) as ExtractedReceipt;
      if (!receipt.lines || receipt.lines.length === 0) {
        throw new Error("Couldn't read any items from that photo. Try another one?");
      }
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  if (phase.kind === "loading") return <LoadingScreen />;

  // Avoid flashing the wrong screen during hydration of the persisted bill.
  if (!hydrated) return null;

  if (state.bill && phase.kind !== "error") {
    return (
      <BillReview
        bill={state.bill}
        onSwipe={(id, direction) => dispatch({ type: "SWIPE", id, direction })}
        onEditName={(id, name) => dispatch({ type: "EDIT_NAME", id, name })}
        onEditPrice={(id, price) => dispatch({ type: "EDIT_PRICE", id, price })}
        onReset={() => dispatch({ type: "RESET" })}
      />
    );
  }

  return (
    <>
      {phase.kind === "error" && (
        <div className="px-7 pt-6">
          <div className="rounded-2xl bg-warn-faint text-[color:var(--warn)] px-4 py-3 text-sm font-semibold">
            {phase.message}
            <button
              type="button"
              onClick={() => setPhase({ kind: "idle" })}
              className="ml-3 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <ImageInput onPick={handlePick} />
    </>
  );
}
