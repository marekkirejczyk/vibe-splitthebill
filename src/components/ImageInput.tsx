"use client";

import { useRef } from "react";

type Props = {
  onPick: (file: File) => void;
};

export function ImageInput({ onPick }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  return (
    <main className="flex flex-col min-h-dvh px-7 pt-12 pb-10 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 -right-24 h-[380px] w-[380px] rounded-full opacity-25 blur-md"
        style={{
          background:
            "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
        }}
      />

      <h1 className="text-[44px] leading-[1.05] font-bold tracking-tight text-text">
        Split the
        <br />
        bill.
      </h1>
      <p className="mt-5 text-base text-muted font-medium">
        Snap a receipt. We&apos;ll handle the math.
      </p>

      <div className="mt-9 rounded-3xl bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-border h-[280px] flex flex-col items-center justify-center">
        <span className="text-[120px] leading-none">🧾</span>
        <span className="mt-4 text-sm font-semibold text-muted">
          Receipt → split, in seconds
        </span>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="w-full h-16 rounded-2xl text-white text-lg font-bold shadow-[0_4px_24px_rgba(236,72,153,0.30)] active:scale-[0.98] transition-transform"
        style={{
          background: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
        }}
      >
        📷&nbsp;&nbsp;Take photo
      </button>
      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="mt-3 w-full h-16 rounded-2xl bg-card border-2 border-text text-text text-lg font-bold active:scale-[0.98] transition-transform"
      >
        🖼&nbsp;&nbsp;Upload from photos
      </button>

      <p className="mt-6 text-center text-xs text-muted">
        Photo sent to Anthropic to read line items, then discarded.
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </main>
  );
}
