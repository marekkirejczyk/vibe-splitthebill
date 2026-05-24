# Split the Bill

A two-person bill splitter: snap a receipt, swipe each line item left for **You** or right for **Them**, and watch the per-person totals settle. Tax, tip, and service prorate across the items pool; receipts that already include tax (Indian GST, EU VAT, etc.) auto-detect and don't double-count.

## What's in this repo

It's a pnpm monorepo with three packages:

```
apps/web/         ← Next.js 16 app — the production web product (deployed on Vercel)
apps/mobile/      ← Expo SDK 56 app — iOS + Android, in progress (M2 scaffold shipped)
packages/core/    ← @splitbill/core — pure domain logic shared by both apps
                    (types, totals math, reducer + helpers, theme tokens, Anthropic SDK wrapper)
```

The split is enforced by `tsconfig`: `packages/core` doesn't have `dom` in its `lib`, so accidentally touching `window` or `localStorage` from shared code is a type error. The Anthropic SDK call is server-only via `@splitbill/core/server`, so the mobile app cannot accidentally bundle the API key path — mobile always goes through the web's `/api/extract` route.

## Documentation

- **[`doc/web.md`](doc/web.md)** — full web spec: UX, swipe state machine, totals math, Claude tool-use contract, component map.
- **[`doc/mobile.md`](doc/mobile.md)** — mobile spec: monorepo layout, shared-core boundary, Figma source-of-truth, screen-by-screen port, gesture spec, web↔mobile UX deltas, app config.
- **[`plan.md`](plan.md)** — 8-milestone React Native migration roadmap.
- **[`plan-m12.md`](plan-m12.md)** — detailed execution plan for M1 (monorepo + core) and M2 (Expo scaffold + theme + Figma kickoff) — both shipped.
- **[`AGENTS.md`](AGENTS.md)** — test conventions, fixtures, and where to add what.

## Getting started

Requirements: Node 22, pnpm 10 (`packageManager` pinned to `pnpm@10.33.0`).

```bash
pnpm install                      # resolves workspace deps
pnpm dev                          # runs the web app on http://localhost:3000
pnpm test                         # runs all tests across both packages (~1s, offline)
pnpm lint                         # eslint across both packages
pnpm build                        # next build for production

# Mobile
pnpm --filter @splitbill/mobile start          # Expo Metro
pnpm --filter @splitbill/mobile ios            # iOS Simulator (needs Xcode)
pnpm --filter @splitbill/mobile android        # Android emulator (needs Android SDK)

# Live Anthropic integration suite (~$0.01/run, gated)
ANTHROPIC_API_KEY=sk-ant-... pnpm test:int
```

The web app needs `ANTHROPIC_API_KEY` in the environment to extract receipts at runtime. Locally: drop it in `apps/web/.env.local`. On Vercel: project → Settings → Environment Variables.

## Deploying

The web app is deployed on Vercel from the `apps/web/` subdirectory. Vercel's project Root Directory setting should point to `apps/web`; the GitHub Actions CI (`.github/workflows/ci.yml`) handles install + lint + test from the repo root and the Vercel build picks up from there.

The mobile app is built via EAS Build (M8 — not yet wired). For now it runs in Expo Go via `pnpm --filter @splitbill/mobile start`.
