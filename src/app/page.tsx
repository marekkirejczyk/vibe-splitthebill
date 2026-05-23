"use client";

import { useRef, useState } from "react";
import { BillReview } from "@/components/BillReview";
import { ErrorScreen } from "@/components/ErrorScreen";
import { ImageInput } from "@/components/ImageInput";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useBillStore } from "@/lib/store";
import { resizeImage } from "@/lib/resizeImage";
import type { ExtractedReceipt } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function Home() {
  const [state, dispatch, hydrated] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [lastFile, setLastFile] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function extract(file: File) {
    setLastFile(file);
    setPhase({ kind: "loading" });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      const sendName = blob.type === "image/jpeg" ? "receipt.jpg" : file.name;
      form.append("image", blob, sendName);
      const res = await fetch("/api/extract", {
        method: "POST",
        body: form,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `Server returned ${res.status}`);
      }
      const receipt = (await res.json()) as ExtractedReceipt;
      if (!receipt.lines || receipt.lines.length === 0) {
        throw new Error("I couldn't read any items from that photo. Try a sharper one?");
      }
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase({ kind: "idle" });
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  function cancelLoading() {
    abortRef.current?.abort();
  }

  if (!hydrated) return null;

  if (phase.kind === "loading") {
    return <LoadingScreen onCancel={cancelLoading} />;
  }

  if (phase.kind === "error") {
    return (
      <ErrorScreen
        message={phase.message}
        onRetry={lastFile ? () => extract(lastFile) : undefined}
        onStartOver={() => {
          setLastFile(null);
          setPhase({ kind: "idle" });
        }}
      />
    );
  }

  if (state.bill) {
    return (
      <BillReview
        bill={state.bill}
        onSwipe={(id, direction) => dispatch({ type: "SWIPE", id, direction })}
        onEditName={(id, name) => dispatch({ type: "EDIT_NAME", id, name })}
        onEditPrice={(id, price) => dispatch({ type: "EDIT_PRICE", id, price })}
        onSetTaxIncluded={(value) =>
          dispatch({ type: "SET_TAX_INCLUDED", value })
        }
        onReset={() => dispatch({ type: "RESET" })}
      />
    );
  }

  return <ImageInput onPick={extract} />;
}
