import Constants from "expo-constants";

// Reads the shared secret from app.config.ts's `extra.apiSecret` (sourced from
// EXPO_PUBLIC_API_SECRET / an EAS build secret). Sent as the x-splitbill-key
// header on the /api/extract POST so the gated endpoint admits the mobile
// binary. Undefined in local/dev builds, where the server gate is also off.
//
// A secret baked into a shipped binary is recoverable by reverse engineering —
// it stops drive-by abuse of the endpoint, not a determined attacker. App
// Attest / Play Integrity is the real fix and is deferred (see plan-m8.md).
export function apiSecret(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiSecret?: string };
  const fromExtra = extra.apiSecret;
  return fromExtra && fromExtra.length > 0 ? fromExtra : undefined;
}
