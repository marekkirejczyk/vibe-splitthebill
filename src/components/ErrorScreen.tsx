"use client";

type Props = {
  message: string;
  onRetry?: () => void;
  onStartOver: () => void;
};

export function ErrorScreen({ message, onRetry, onStartOver }: Props) {
  return (
    <main className="flex flex-col min-h-dvh items-center justify-center px-7 relative overflow-hidden text-center">
      <div className="text-7xl mb-6">😕</div>
      <h2 className="text-2xl font-bold text-text">Something went wrong</h2>
      <p className="mt-3 text-sm text-muted max-w-[300px]">{message}</p>

      <div className="mt-10 w-full max-w-[320px]">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-[0_4px_24px_rgba(236,72,153,0.30)] active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)" }}
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onStartOver}
          className="mt-3 w-full h-14 rounded-2xl bg-card border-2 border-text text-text font-bold text-base active:scale-[0.98] transition-transform"
        >
          Pick a different photo
        </button>
      </div>
    </main>
  );
}
