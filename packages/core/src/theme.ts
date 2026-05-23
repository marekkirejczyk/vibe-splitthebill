// Single source of truth for design tokens. Web reads colors via Tailwind
// (which mirrors these in globals.css); the mobile app reads them directly
// from this object. The Figma file's Variables collection mirrors this
// 1:1 so design and code don't drift.

export const theme = {
  color: {
    bg: "#f5f5f4",
    card: "#ffffff",
    text: "#111827",
    muted: "#6b7280",
    border: "#e2e2dd",
    you: "#4f46e5",
    youFaint: "#e0e7ff",
    them: "#db2777",
    themFaint: "#fce7f3",
    assignBg: "#d1fae5",
    assignBorder: "#10b981",
    action: "#059669",
    warn: "#ef4444",
    warnFaint: "#fee2e2",
    warnText: "#92400e",
    warnBg: "#fef3c7",
  },
  gradient: {
    start: "#f97316",
    end: "#ec4899",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
    xxxl: 44,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    pill: 999,
  },
  type: {
    h1: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.5 },
    body: { fontSize: 15, fontWeight: "500" as const },
    label: { fontSize: 13, fontWeight: "600" as const },
    money: { fontSize: 18, fontWeight: "700" as const },
    moneyLg: { fontSize: 26, fontWeight: "700" as const },
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    cta: {
      shadowColor: "#f97316",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 4,
    },
  },
} as const;

export type Theme = typeof theme;
