import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Reuse the Next.js TS rules for consistency across packages even though
// core has no Next dependencies; the rules themselves are framework-agnostic.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["dist/**", "node_modules/**"]),
]);
