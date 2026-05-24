import Constants from "expo-constants";

// Reads the API host from app.config.ts's `extra.apiBaseUrl`. Mobile POSTs
// receipts to `${apiBaseUrl()}/api/extract` — the Anthropic key stays on the
// hosted Next.js route, never on the device.
//
// Pulled out as a one-shot helper so jest can `jest.mock("expo-constants")`
// once in the orchestrator tests without driving Constants reads through the
// hot path.
export function apiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  const fromExtra = extra.apiBaseUrl;
  if (fromExtra && fromExtra.length > 0) return fromExtra.replace(/\/$/, "");
  // Fallback if a future build strips `extra` — app.config.ts already supplies
  // a default but we'd rather not 404 silently on a misconfig.
  return "https://vibe-splitthebill.vercel.app";
}
