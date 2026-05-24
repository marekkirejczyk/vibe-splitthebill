# React Native migration — Phase 1 (M1 + M2)

## Context

`plan.md` (root of repo, added in PR #2 on `claude/bill-split-app-plan-aZPmw`) lays out an 8-milestone plan to ship Split the Bill as a native iOS/Android app via Expo while keeping the web app working. M1 and M2 are the foundation: the work that has to be done *before* anyone can write screen code or call image-picker APIs. Specifically:

- **M1 — Monorepo + core extraction.** Turn the single-package Next.js repo into a pnpm workspace with `apps/web` (existing app, relocated) and `packages/core` (pure domain logic — splitter, reducer + helpers, types, `parseReceipt`, `computeResizeTarget`, theme tokens, a `StorageAdapter` interface). Web continues to build and ship; tests stay green; CI keeps passing.
- **M2 — Expo scaffold + theme + Figma kickoff.** Add `apps/mobile` as an Expo SDK 56 app wired to Metro `watchFolders` for the workspace, install the RN dep set, ship `theme.ts` as the single source of design tokens, and create the Figma file we'll design the new mobile UI in (using the `use_figma` MCP tool).

After this phase, no mobile screens exist yet (that's M3) — but the monorepo is real, web hasn't regressed, the mobile app boots a placeholder that proves the core package is importable across workspaces, and the Figma file is open for the designer to lay out screens.

## Decisions baked in

- **pnpm workspaces** (not Nx/Turbo). The stub `pnpm-workspace.yaml` already exists and CI uses `pnpm`.
- **Preserve git history** for moved files via `git mv` — `apps/web/src/lib/splitter.ts` should show the same blame as today's `src/lib/splitter.ts`.
- **Core has no DOM types.** `packages/core/tsconfig.json` omits `"dom"` from `lib`. An ESLint `no-restricted-globals` rule is *not* added in M1 — flagged as M3 polish so we don't gold-plate the boundary before we have screens.
- **`parseReceipt` is a server-only export** of `@splitbill/core` (`@splitbill/core/server`). Mobile never bundles the Anthropic SDK; it always goes through the hosted `/api/extract` route on the web app.
- **No code changes beyond the move + split.** Reducer logic, swipe semantics, totals math, inclusive detection — all bit-identical with what shipped in `a27d4bf`. Tests assert this.
- **Figma file kickoff in M2.** Layout is just placeholder frames + the Variables collection mirroring `theme.ts` 1:1; actual screen design happens in M3.

## M1 — Monorepo + core extraction

### Step M1.1 — Workspace skeleton (root)

- Edit `pnpm-workspace.yaml`: keep the existing `ignoredBuiltDependencies` block, add `packages: ["apps/*", "packages/*"]`.
- `package.json` (root): keep `name`, `version`, `private: true`. Drop everything app-specific (`dependencies`, `devDependencies`, `scripts` except a small set of pass-throughs). Keep / land `packageManager: "pnpm@10.33.0"` (already on origin in `9dfdca8`).
- Root `scripts` after split: `"test": "pnpm -r test"`, `"lint": "pnpm -r lint"`, `"build": "pnpm --filter web build"`, `"dev": "pnpm --filter web dev"`, `"test:int": "pnpm --filter @splitbill/core test:int"`. This keeps CI's existing `pnpm test` / `pnpm lint` commands working without modification.
- New `tsconfig.base.json` at root: `target: "ES2020"`, `module: "esnext"`, `moduleResolution: "bundler"`, `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`, `resolveJsonModule: true`, `isolatedModules: true`, `noEmit: true`. No `lib` and no `paths` — those go in per-package tsconfigs.

### Step M1.2 — Relocate web app

One `git mv` per top-level artefact (preserves history):

```
git mv src                apps/web/src
git mv public             apps/web/public
git mv next.config.ts     apps/web/next.config.ts
git mv next-env.d.ts      apps/web/next-env.d.ts
git mv tsconfig.json      apps/web/tsconfig.json
git mv postcss.config.mjs apps/web/postcss.config.mjs
git mv vitest.config.mts  apps/web/vitest.config.mts
git mv eslint.config.mjs  apps/web/eslint.config.mjs
git mv tests              apps/web/tests          # fixtures + generator
```

- Create `apps/web/package.json` with `name: "web"`, all Next/React/Tailwind/framer/anthropic deps lifted out of root, plus the original `scripts` (`dev`, `build`, `start`, `lint`, `test`, `test:watch`, `fixtures`). Add `"@splitbill/core": "workspace:*"` as a dep.
- `apps/web/tsconfig.json`: change `extends` to `"../../tsconfig.base.json"`, keep `lib: ["dom","dom.iterable","esnext"]`, `jsx: "react-jsx"`, `paths: {"@/*": ["./src/*"]}` exactly as today.
- `apps/web/vitest.config.mts`: same pattern `src/**/*.{test,spec}.{ts,tsx}`, `environment: "node"` unchanged.
- Vercel: update project's **Root Directory** setting to `apps/web` (one-time dashboard click). CI's Vercel preview job in `.github/workflows/ci.yml` keeps working because it pushes the whole repo and Vercel resolves from `apps/web`.

### Step M1.3 — Scaffold `@splitbill/core`

- `packages/core/package.json`: `name: "@splitbill/core"`, `version: "0.1.0"`, `private: true`, `type: "module"`. `main: "./src/index.ts"`, `types: "./src/index.ts"` (no build step — Next, Vitest, and Metro all resolve TypeScript directly with `moduleResolution: "bundler"`). Exports map:
  ```json
  { ".": "./src/index.ts", "./server": "./src/server/index.ts" }
  ```
  Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:int": "RUN_ANTHROPIC_TESTS=1 vitest run parseReceipt"`, `"lint": "eslint src test"`.
- `packages/core/tsconfig.json`: extends `../../tsconfig.base.json`, `lib: ["ES2020"]` (no `"dom"`), `jsx` omitted. This is what enforces the DOM-free boundary.
- `packages/core/vitest.config.ts`: mirrors web's — `environment: "node"`, pattern `{src,test}/**/*.{test,spec}.ts`.
- `packages/core/eslint.config.mjs`: copy web's, strip Next-specific rules.

### Step M1.4 — Move pure files into core

```
git mv apps/web/src/lib/types.ts        packages/core/src/types.ts
git mv apps/web/src/lib/splitter.ts     packages/core/src/splitter.ts
git mv apps/web/src/lib/parseReceipt.ts packages/core/src/server/parseReceipt.ts
```

No edits needed — these files are already DOM-free and React-free (`parseReceipt` only imports `@anthropic-ai/sdk` and types). Add `@anthropic-ai/sdk` to `packages/core/package.json` deps and drop it from web.

### Step M1.5 — Split `store.ts`

Today `src/lib/store.ts` mixes pure reducer logic (top of file) with the React hook `useBillStore` at lines 223–248 plus the `useEffect`/`useReducer`/`useState` import at the top.

- New `packages/core/src/store.ts`: everything **except** the React import and `useBillStore`. Keep `nextAssignee`, `toMultiItem`, `expandItemLine`, `billFromReceipt`, `detectInclusive`, `cryptoId`, the `Action`/`State` types, `reducer`, `initialState`. The `crypto.randomUUID` fallback at lines 149–150 stays — it's already environment-safe.
- New `packages/core/src/storage.ts`: declares the `StorageAdapter` interface and `STORAGE_KEY = "splitbill.v1"` constant (lifted from the old line 13).
- New `apps/web/src/lib/useBillStore.ts`: the React hook. Takes a `StorageAdapter` (the existing web `localStorage` calls move into a small `localStorageAdapter` defined in the same file or alongside). Imports `reducer`, `initialState`, `Action`, `State` from `@splitbill/core`.

### Step M1.6 — Split `resizeImage.ts`

- `packages/core/src/resizeImage.ts`: only `computeResizeTarget`, `MAX_EDGE`, `JPEG_QUALITY` (lines 7–21 of the current file).
- `apps/web/src/lib/resizeImageDom.ts`: the `resizeImage(file)` canvas wrapper. Imports `computeResizeTarget` from `@splitbill/core`.

### Step M1.7 — Move tests

```
git mv apps/web/src/lib/store.test.ts        packages/core/test/store.test.ts
git mv apps/web/src/lib/splitter.test.ts     packages/core/test/splitter.test.ts
git mv apps/web/src/lib/parseReceipt.test.ts packages/core/test/parseReceipt.test.ts
git mv apps/web/src/lib/resizeImage.test.ts  packages/core/test/resizeImage.test.ts
```

Update imports inside each test from `./store` / `./splitter` / etc. to `../src/store`, etc. The Polish PARAGON FISKALNY fixture path becomes `tests/fixtures/real/polish-frac.jpg` relative to the core package — keep `tests/fixtures` co-located by `git mv tests packages/core/tests` and updating the `FIX` constant. `route.test.ts` stays under `apps/web/src/app/api/extract/`.

### Step M1.8 — Public barrel + import rewrites

- `packages/core/src/index.ts` re-exports: everything from `./types`, `./splitter`, `./store`, `./storage`, `./resizeImage`. Explicitly does NOT export `parseReceipt` — that's only reachable via `@splitbill/core/server`.
- `packages/core/src/server/index.ts` re-exports `./parseReceipt`.
- Rewrite all `apps/web` imports:
  - `@/lib/splitter` → `@splitbill/core`
  - `@/lib/store` → split: pure helpers from `@splitbill/core`, the hook from `@/lib/useBillStore`
  - `@/lib/types` → `@splitbill/core`
  - `@/lib/parseReceipt` → `@splitbill/core/server`
  - `@/lib/resizeImage` → wrapper from `@/lib/resizeImageDom`, pure helpers from `@splitbill/core`
- Mock target in `apps/web/src/app/api/extract/route.test.ts` updates from `@/lib/parseReceipt` to `@splitbill/core/server`.

### Step M1.9 — Verify M1

From repo root:

```
pnpm install                                  # lockfile resolves new workspace deps
pnpm -r lint                                  # both packages
pnpm -r test                                  # core (4 suites) + web (route test) — 68 tests, all green
pnpm --filter web build                       # next build succeeds
pnpm --filter web dev                         # smoke-test the bill review flow in a browser
RUN_ANTHROPIC_TESTS=1 pnpm --filter @splitbill/core test:int   # optional, gated
```

If anything fails: don't band-aid. Fix the import or move.

## M2 — Expo scaffold + theme + Figma kickoff

### Step M2.1 — Add `theme.ts` to core

`packages/core/src/theme.ts` lifts the CSS variables from `apps/web/src/app/globals.css` lines 3–20 into a typed object (shape exactly as drafted in `plan.md`'s "Theme module" section: `color`, `spacing`, `radius`, `type`, `shadow`, plus `gradient: { start, end }`). Add `theme` to the core barrel. Web continues to read colors via Tailwind tokens — no migration of web styling in M2.

### Step M2.2 — Scaffold the Expo app

```
pnpm dlx create-expo-app apps/mobile --template blank-typescript
```

Then:
- `apps/mobile/package.json`: rename to `"@splitbill/mobile"`, add `"@splitbill/core": "workspace:*"`, set scripts: `"start"`, `"ios"`, `"android"`, `"lint"`, `"test"` (jest-expo, even if no tests yet — keeps the workspace's root `pnpm -r test` happy with a no-op).
- `apps/mobile/tsconfig.json`: extends `../../tsconfig.base.json`, `jsx: "react-native"`, `lib: ["ES2020"]`.
- `apps/mobile/.gitignore`: standard Expo.

### Step M2.3 — Install RN dep set (pinned to Expo SDK 56)

Versions confirmed current as of the audit:

```
pnpm --filter @splitbill/mobile add \
  expo@56.0.4 expo-router@56.2.6 expo-image-picker@56.0.13 \
  expo-image-manipulator@56.0.14 expo-haptics@56.0.3 \
  expo-constants expo-status-bar expo-linear-gradient \
  react-native-reanimated@4.3.1 react-native-gesture-handler@2.31.2 \
  react-native-safe-area-context \
  @react-native-async-storage/async-storage@3.1.0
```

### Step M2.4 — Configure Metro, Babel, app config

- `apps/mobile/metro.config.js`:
  ```js
  const { getDefaultConfig } = require("expo/metro-config");
  const path = require("path");
  const config = getDefaultConfig(__dirname);
  config.watchFolders = [path.resolve(__dirname, "../..")];
  config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, "node_modules"),
    path.resolve(__dirname, "../../node_modules"),
  ];
  config.resolver.disableHierarchicalLookup = true;
  module.exports = config;
  ```
- `apps/mobile/babel.config.js`: standard Expo preset, `react-native-reanimated/plugin` **last** in the plugin array (peer-dep order requirement; flagged in the audit).
- `apps/mobile/app.config.ts` (replacing the scaffold's `app.json`): scheme `"splitbill"`, `ios.bundleIdentifier`, `android.package`, `ios.infoPlist.NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` (empathetic strings), `extra.apiBaseUrl` read from `process.env.EXPO_PUBLIC_API_BASE_URL` (defaulting to the production Vercel URL).

### Step M2.5 — Minimal app entry that proves cross-workspace import

- `apps/mobile/app/_layout.tsx`: `<GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><Stack /></SafeAreaProvider></GestureHandlerRootView>`.
- `apps/mobile/app/index.tsx`: placeholder that imports `theme` and `computeTotals` from `@splitbill/core` and renders a `<ScrollView>` with (a) the color palette swatches sourced from `theme.color` and (b) the result of `computeTotals` against a hardcoded `Bill` fixture rendered as text. This is the M2 smoke test — if Metro + the workspace are wired correctly, this builds and runs on the simulator.

### Step M2.6 — Kick off the Figma file

Load the `/figma-use` skill (mandatory per the Figma MCP server instructions), then call `use_figma` to:
1. Create a new file titled "Split the Bill — Mobile".
2. Create a Variables collection named `theme` with sub-collections `color`, `spacing`, `radius`, `type` populated to match `packages/core/src/theme.ts` exactly. Names are token paths (`color/you-faint`, `spacing/lg`, etc.).
3. Add five empty frames at iPhone 15 dimensions (393×852), titled `Start`, `Loading`, `Error`, `Bill Review`, `Inline Edit`. These are layout stubs for M3.
4. Persist the `fileKey` somewhere reachable for future sessions — add it to `doc/spec.md`'s Mobile chapter, which we'll stub in step M2.8.

### Step M2.7 — Verify M2

```
pnpm install
pnpm --filter @splitbill/mobile start             # Metro boots clean
# in another shell:
pnpm --filter @splitbill/mobile ios               # iOS Simulator launches; placeholder renders
pnpm --filter @splitbill/mobile android           # Android emulator launches; placeholder renders
pnpm -r test                                      # still green (mobile has no tests yet — jest-expo no-op)
pnpm --filter web build                           # web hasn't regressed
```

The smoke screen showing the color swatches + the computed totals from `@splitbill/core` is the proof the workspace wiring is correct.

### Step M2.8 — Stub the Mobile chapter in spec

Add `## 3. Mobile (iOS + Android)` to `doc/spec.md` with three subsections: (a) monorepo layout (one-paragraph summary of M1), (b) shared core boundary (DOM-free contract, `@splitbill/core/server` for `parseReceipt`), (c) Figma file link with the `fileKey` from step M2.6. Detail comes in later milestones — this stub anchors the document for M3+.

## Critical files modified or created

**M1:**
- `pnpm-workspace.yaml` (edit), `package.json` (root, slim down), `tsconfig.base.json` (new)
- `apps/web/{package,tsconfig,vitest.config,eslint.config,postcss.config,next.config}.*` (relocated)
- `apps/web/src/**` (relocated; imports rewritten)
- `apps/web/src/lib/useBillStore.ts` (new; carved out of old `store.ts`)
- `apps/web/src/lib/resizeImageDom.ts` (new; carved out of old `resizeImage.ts`)
- `packages/core/{package,tsconfig,vitest.config,eslint.config}.*` (new)
- `packages/core/src/{types,splitter,store,storage,resizeImage,index}.ts` (some moved, `storage` and `index` new)
- `packages/core/src/server/{parseReceipt,index}.ts` (moved + new barrel)
- `packages/core/test/*.test.ts` (moved)
- `packages/core/tests/fixtures/**` (moved)

**M2:**
- `packages/core/src/theme.ts` (new), barrel updated
- `apps/mobile/**` (entire new package: `package.json`, `app.config.ts`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `app/_layout.tsx`, `app/index.tsx`, `.gitignore`)
- `doc/spec.md` (new chapter stub)

**Reused as-is from the existing codebase** (no rewrites — these are the whole point of extracting core): `computeTotals` and `formatMoney` in `packages/core/src/splitter.ts`, the `reducer` + `nextAssignee` + `toMultiItem` + `expandItemLine` + `billFromReceipt` + `detectInclusive` set in `packages/core/src/store.ts`, `extractReceipt` in `packages/core/src/server/parseReceipt.ts`, `computeResizeTarget` in `packages/core/src/resizeImage.ts`.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core tests pass | `pnpm --filter @splitbill/core test` | 67 existing unit tests (splitter + store + resizeImage + parseReceipt offline) still green after the move. |
| Live Anthropic still works | `RUN_ANTHROPIC_TESTS=1 pnpm --filter @splitbill/core test:int` | `extractReceipt` works through its new import path. |
| Web route still works | `pnpm --filter web test` | `route.test.ts` passes against `@splitbill/core/server`. |
| Web builds | `pnpm --filter web build` | Next.js production build succeeds against workspace deps. |
| Web runs | `pnpm --filter web dev` + browser smoke: upload `tests/fixtures/receipt.jpg`, swipe, edit, toggle Tax-included. | No behavioural regression. |
| Mobile boots | `pnpm --filter @splitbill/mobile start` + `ios` / `android` | Metro resolves `@splitbill/core` via watchFolders; placeholder screen renders. |
| Cross-workspace import works | The placeholder screen shows `computeTotals` output + theme color swatches. | The whole reason for the workspace exists. |
| CI is green | Push branch, watch GitHub Actions. | `.github/workflows/ci.yml`'s `pnpm install --frozen-lockfile && pnpm lint && pnpm test` still passes against the workspace layout. Vercel preview deploys from `apps/web`. |

## Risks and follow-ups (deferred to M3+)

- **ESLint `no-restricted-globals` on core** — not added in M1; trusting `tsconfig` lib + code review until M3 when we add the second consumer.
- **Vercel root-dir change** is a one-time dashboard click; CI workflow itself doesn't need editing. If we want infra-as-code, switch to `vercel.json` in M3.
- **`packages/core` ships TypeScript directly** (no `dist/`). Next, Vitest, and Metro all handle this with `moduleResolution: "bundler"`. If we later want to publish `@splitbill/core` separately, add a `tsup` build step at that time, not now.
- **No mobile screens** — that's M3. The placeholder in M2 only proves the wiring.
- **Backend auth for mobile** — `/api/extract` is still unauthenticated. Plan.md flags this for M4 (before mobile actually ships); not in scope here.
