"use client";

export function LoadingScreen() {
  return (
    <main className="flex flex-col min-h-dvh items-center justify-center px-7 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 -left-32 h-[500px] w-[500px] rounded-full opacity-20 blur-md"
        style={{
          background:
            "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
        }}
      />

      <div className="w-60 h-80 rounded-2xl bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6 relative">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-2 rounded-md bg-border mb-5 animate-pulse"
            style={{ width: `${100 - (i % 3) * 18}%` }}
          />
        ))}
      </div>

      <div className="mt-12">
        <div
          className="h-12 w-12 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderTopColor: "#f97316",
            borderRightColor: "#ec4899",
          }}
        />
      </div>

      <h2 className="mt-6 text-2xl font-bold text-text">Reading your receipt…</h2>
      <p className="mt-1 text-sm text-muted">Claude is identifying items and prices.</p>
    </main>
  );
}
