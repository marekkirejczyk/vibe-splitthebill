# React Native Migration Plan — Split the Bill

## Context

`vibe-splitthebill` is a single-page Next.js 16 web app: snap a restaurant receipt, Claude Sonnet 4.6 (forced `record_receipt` tool) extracts line items, the user swipes each row left/right to assign to "You" or "Them", and a sticky footer shows per-person totals with extras (tax/tip/service) prorated across the full items pool. State lives in a `useReducer` + `localStorage`; the swipe UX is built on framer-motion drag.

The goal is to ship the **same product as a native mobile app** (iOS + Android) without losing any functionality, while taking the opportunity to redesign the interface for native idioms (haptics, safe areas, native pickers, native keyboard). The web app must keep working — both clients will share a single source of truth for domain logic and the Anthropic-backed extraction endpoint.

**Decisions already locked in**
- Toolchain: **Expo (managed) + Expo Router**
- Backend: **keep the existing Next.js `/api/extract`**, deployed as a hosted API the mobile app calls over HTTPS
- Code sharing: **pnpm monorepo** — `packages/core` (pure logic, shared tests), `apps/web` (existing Next.js), `apps/mobile` (new Expo)
- Styling: **`StyleSheet.create` + a shared `theme.ts` tokens module** (no NativeWind — the new Figma is designed fresh for native, no Tailwind class-name port needed)

## Audit summary (current app)

| Layer | Files | Portability |
|---|---|---|
| **Pure domain logic** | `src/lib/splitter.ts` (`computeTotals`, `formatMoney`), `src/lib/store.ts` (`reducer`, `nextAssignee`, `billFromReceipt`, `expandItemLine`, `toMultiItem`, `detectInclusive`, `cryptoId`), `src/lib/types.ts`, `src/lib/parseReceipt.ts` (Anthropic SDK call) | 100% portable — move verbatim into `packages/core` |
| **Pure helper, browser wrapper** | `src/lib/resizeImage.ts` — `computeResizeTarget` is pure; `resizeImage(File)` uses `<canvas>` / `FileReader` / `Image` | Split: pure helper → core, wrapper → per-platform |
| **API route** | `src/app/api/extract/route.ts` + `route.test.ts` | Stays in `apps/web`, deployed as the shared API |
| **UI components** | `ImageInput`, `LoadingScreen`, `ErrorScreen`, `BillReview`, `SwipeableRow`, `Totals` | Full rewrite for RN — see screen map below |
| **Storage** | `localStorage` + key `splitbill.v1` in `src/lib/store.ts` lines 229/243 | Mobile uses `AsyncStorage` behind a shared `StorageAdapter` interface |
| **Tests** | `splitter.test.ts`, `store.test.ts`, `resizeImage.test.ts`, `parseReceipt.test.ts` (offline mock + opt-in live) | Move into `packages/core/test/`, unchanged. `route.test.ts` stays in `apps/web` |

## Target monorepo layout

```
vibe-splitthebill/
  pnpm-workspace.yaml          # packages: [apps/*, packages/*]
  tsconfig.base.json           # strict, moduleResolution: bundler
  packages/
    core/                      # name: @splitbill/core
      src/
        types.ts               # verbatim from src/lib/types.ts
        splitter.ts            # verbatim
        store.ts               # reducer + helpers ONLY (no useReducer/useEffect)
        parseReceipt.ts        # Anthropic SDK wrapper — server-only export
        resizeImage.ts         # ONLY computeResizeTarget + MAX_EDGE/JPEG_QUALITY constants
        storage.ts             # NEW: StorageAdapter interface + STORAGE_KEY
        theme.ts               # NEW: design tokens (colors, spacing, type, radii, shadows)
        index.ts               # public barrel — DOES NOT re-export parseReceipt
        server/index.ts        # extractReceipt re-exported here for apps/web only
      test/                    # vitest, node env (verbatim moves)
      tsconfig.json            # lib: ["ES2020"]  — no "dom" — enforces the boundary
  apps/
    web/                       # existing Next.js, trimmed
      src/lib/useBillStore.ts        # localStorage adapter around core reducer
      src/lib/resizeImageDom.ts      # the canvas wrapper
      src/app/api/extract/route.ts   # unchanged; imports from @splitbill/core/server
    mobile/                    # NEW Expo app
      app.json / app.config.ts # iOS NS*UsageDescription strings, scheme "splitbill"
      babel.config.js          # react-native-reanimated/plugin LAST
      metro.config.js          # watchFolders includes ../../packages/core
      app/
        _layout.tsx            # GestureHandlerRootView + SafeAreaProvider + Stack
        index.tsx              # state-machine host (idle/loading/error/bill)
      src/
        components/            # StartScreen, LoadingScreen, ErrorScreen,
                               # BillReviewScreen, SwipeableRow, Totals
        hooks/useBillStore.ts  # AsyncStorage adapter around core reducer
        lib/resizeImageNative.ts        # expo-image-manipulator wrapper
        lib/asyncStorageAdapter.ts
```

Boundary enforcement: `packages/core/tsconfig.json` omits `"dom"` from `lib`, and an ESLint `no-restricted-globals` rule forbids `window`, `document`, `localStorage`, `HTMLElement`, `File`, `Blob` inside core. Accidental DOM references break CI.

## Reusable code inventory

**Move verbatim into `packages/core/src/`:**
- `types.ts`, `splitter.ts`, `parseReceipt.ts` (server-only path)
- The reducer + all helpers from `store.ts`: `nextAssignee`, `toMultiItem`, `expandItemLine`, `billFromReceipt`, `detectInclusive`, `cryptoId`, the `Action`/`State` types, the `reducer` function, `initialState`
- `computeResizeTarget` and its constants from `resizeImage.ts`

**Stays per-platform (thin wrappers around core):**
- `useBillStore()` hook — wraps the same core reducer with a platform-specific `StorageAdapter` (web: `localStorage`, mobile: `AsyncStorage`)
- `resizeImage(file)` — web uses `<canvas>` (current code); mobile uses `expo-image-manipulator`. Both call `computeResizeTarget` from core.

**Tests:**
- `splitter.test.ts`, `store.test.ts`, `resizeImage.test.ts`, `parseReceipt.test.ts` → `packages/core/test/`. Run via `pnpm --filter @splitbill/core test`. No assertions change.
- `src/app/api/extract/route.test.ts` stays in `apps/web` (needs Next `Request`/`FormData`).

## New mobile interface — Figma first

The mobile UI is **designed in Figma before any RN code**, using the existing color tokens from `src/app/globals.css` lines 1–40 as the starting palette and the existing Figma file linked in `doc/spec.md` as inspiration only (web layout shouldn't be ported pixel-for-pixel).

**Figma flow** (uses the Figma MCP server):
1. Load `/figma-generate-design` skill, then `use_figma` to create a "Split the Bill — Mobile" file with a Variables collection mapping 1:1 to `packages/core/src/theme.ts` (colors / spacing / radii / type scale).
2. Design **five screens** plus two interaction states:
   - **Start** — hero, two CTAs (Take photo / Choose from library), inline privacy disclosure
   - **Loading** — animated skeleton receipt + `ActivityIndicator` + Cancel
   - **Error** — full-screen error with Retry / Pick different photo
   - **Bill Review** — three sections (Unassigned / You / Them), inclusive toggles header, sticky Totals footer with safe-area inset
   - **Inline Edit** — TextInput swap-in on a row (name + price variants)
   - **SwipeableRow states** — resting, mid-swipe-left underlay visible, mid-swipe-right underlay visible (so designers can see the 70px threshold UX)
   - **Permission denied** — inline state on Start
3. Approve, then `get_design_context` + `get_variable_defs` per node to round-trip exact token values back into `theme.ts`. `get_screenshot` for visual-regression baselines.
4. Code Connect `SwipeableRow`, `Totals`, primary `Button`, inclusive `Toggle` so Figma references the RN source.

## Screen-by-screen port

| Web component | RN screen | Primitives | UX notes |
|---|---|---|---|
| `ImageInput.tsx` | `StartScreen` | `SafeAreaView`, `View`, `Text`, `Pressable` | Replace `<input type="file" capture="environment">` with `ImagePicker.launchCameraAsync` / `launchImageLibraryAsync`. Pre-request permissions; `Alert.alert` on deny with a Settings deep-link |
| `LoadingScreen.tsx` | `LoadingScreen` | `ActivityIndicator`, animated skeleton (`useSharedValue` opacity loop), `Pressable` | Cancel still aborts. Fire `Haptics.notificationAsync(Success)` when receipt arrives |
| `ErrorScreen.tsx` | `ErrorScreen` | `SafeAreaView`, `Text`, `Pressable` | Same layout. Reserve native `Alert.alert` for transient/permission errors only |
| `BillReview.tsx` | `BillReviewScreen` | `ScrollView` (not `FlatList` — virtualization fights row gestures), section chips, inclusive toggle row | Use `Switch` for inclusive toggles (more native than custom checkbox) |
| `SwipeableRow.tsx` | `SwipeableRow` | `Animated.View` (Reanimated), `Gesture.Pan()`, `TextInput`, `Pressable` | See gesture spec below |
| `Totals.tsx` | `Totals` (footer) | `View` outside the `ScrollView`, `useSafeAreaInsets().bottom`, `expo-linear-gradient` hairline | Anchored absolutely; warn pill stays |

**Gesture spec for `SwipeableRow`** — drop-in replacement for framer-motion:

```ts
const tx = useSharedValue(0);
const pan = Gesture.Pan()
  .activeOffsetX([-10, 10])
  .failOffsetY([-12, 12])          // let vertical scroll win
  .onUpdate(e => { tx.value = clamp(e.translationX, -160, 160); })
  .onEnd(e => {
    if (Math.abs(e.translationX) > 70) {
      const dir = e.translationX < 0 ? "left" : "right";
      runOnJS(onSwipe)(dir);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    }
    tx.value = withSpring(0, { stiffness: 320, damping: 32 });
  });
```

The underlay view sits behind the row and computes label/color from the existing `nextAssignee(item.assignee, dir)` helper in `@splitbill/core` — identical visual semantics to the web. `pan.enabled(false)` while a `TextInput` has focus.

## Image flow rewrite

`expo-image-picker` → `expo-image-manipulator` → multipart `fetch` to `${API_BASE_URL}/api/extract`. `API_BASE_URL` is read via `expo-constants` from `app.config.ts` `extra`.

```ts
const pick = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
if (pick.canceled) return;
const a = pick.assets[0];
const target = computeResizeTarget(a.width, a.height, a.fileSize ?? 0); // from core
const out = await ImageManipulator.manipulateAsync(a.uri,
  target ? [{ resize: target }] : [],
  { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
const form = new FormData();
form.append("image", { uri: out.uri, name: "receipt.jpg", type: "image/jpeg" } as any);
const res = await fetch(`${API_BASE_URL}/api/extract`, { method: "POST", body: form });
```

The `extractReceipt` Anthropic wrapper **never runs on the device** — mobile always goes through the hosted `/api/extract` so the API key stays server-side.

## Persistence

`packages/core/src/storage.ts` defines:

```ts
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const STORAGE_KEY = "splitbill.v1";
```

Each app supplies its own adapter. The `REHYDRATE` reducer action and the legacy `taxIncluded` migration in `store.ts` lines 159–171 work unchanged — `AsyncStorage` serializes the same JSON shape.

## Theme module

`packages/core/src/theme.ts` lifts every token from `src/app/globals.css` (color/spacing/radii) into a typed object. Sample shape:

```ts
export const theme = {
  color: {
    bg: "#f5f5f4", text: "#111827", muted: "#6b7280",
    you: "#4f46e5", youFaint: "#e0e7ff",
    them: "#db2777", themFaint: "#fce7f3",
    assignBg: "#d1fae5", assignBorder: "#10b981", action: "#059669",
    warn: "#ef4444", warnBg: "#fef3c7", warnText: "#92400e",
    gradientStart: "#f97316", gradientEnd: "#ec4899",
  },
  spacing: { xs:4, sm:8, md:12, lg:16, xl:20, xxl:28, xxxl:44 },
  radius:  { sm:8, md:12, lg:16, xl:20, pill:999 },
  type:    { h1:{fontSize:44,...}, body:{fontSize:15,...}, moneyLg:{fontSize:26,...} },
  shadow:  { card:{...}, cta:{...} },
} as const;
```

The Figma Variables collection mirrors this 1:1 so design and code never drift.

## Web vs mobile UX deltas

| Concern | Web (current) | Mobile (new) |
|---|---|---|
| Photo capture | hidden `<input capture="environment">` | `expo-image-picker` with explicit permission prompt + native picker UI |
| Swipe affordance | framer-motion drag, mouse + touch | `Gesture.Pan` + Reanimated, **medium haptic on commit** |
| Inline edit | `<input>` swapped into row | `TextInput`, `keyboardType="decimal-pad"`, `KeyboardAvoidingView`, return-key submits |
| Persistence | `localStorage` | `AsyncStorage` (survives kill + restart) |
| Navigation | one page, internal state machine | Expo Router `Stack` with single `index` route reusing the same state machine |
| Errors | inline `ErrorScreen` only | inline screen for parse failures + native `Alert.alert` for permission denials / abort confirmations |
| Loading | CSS spinner | `ActivityIndicator` + animated skeleton; **success haptic** on receipt arrival |
| "New bill" CTA | bare link | `Alert.alert` confirm if any item is already assigned (prevents thumb fumble) |
| Safe areas | n/a (mobile web honors viewport meta) | `SafeAreaView` on every screen; `useSafeAreaInsets().bottom` padding on Totals; `expo-status-bar` |
| Pull-to-refresh | n/a | intentionally not added — bill is local; refresh would be destructive |
| Share/export | n/a | future: `expo-sharing` to share "You: $X · Them: $Y" |
| Section animation | framer-motion `layoutId` shared element | Reanimated `Layout.springify()` fade+slide (no true shared-element morph) |
| Multi-quantity | identical behavior | identical (logic lives in core `expandItemLine`) |
| Inclusive toggles | `<input type="checkbox">` | `Switch` component, identical wiring through `SET_INCLUSIVE` action |
| Tax/tip/service math | identical | identical (logic lives in core `computeTotals`) |
| Assignee state machine | identical | identical (logic lives in core `nextAssignee`) |

**High-level functionality stays identical:** capture → extract → assign by swipe → see prorated totals → edit inline → persist → start over. The redesign is in idiom and chrome, not in behavior.

## Migration phases

- **M1 — Monorepo + core extraction.** `pnpm-workspace.yaml`; create `@splitbill/core`; move pure files + tests; refactor `apps/web` `useBillStore` to wrap the core reducer; verify `pnpm test` (all suites green) and `pnpm --filter web build` still pass.
- **M2 — Expo scaffold + theme.** `create-expo-app apps/mobile`; install deps; configure Metro `watchFolders` for the workspace; wire `_layout.tsx` providers; ship `theme.ts`. Kick off Figma file via `use_figma`.
- **M3 — Static screens.** Build all five screens against a hardcoded mock `Bill` fixture. No gestures yet — tap a row to cycle assignee. Validates layout, theme, Totals subscription, scroll behavior, safe areas.
- **M4 — Image capture + API integration.** Wire `expo-image-picker` → `expo-image-manipulator` → multipart `fetch` to deployed `/api/extract`. Implement loading/error transitions. Add CORS or a shared-secret header on the Next.js route for the mobile origin.
- **M5 — SwipeableRow gestures.** Replace tap-to-cycle with `Gesture.Pan()` + animated underlay + threshold commit + haptic.
- **M6 — Inline edit, persistence, polish chrome.** `TextInput` swap-in, `KeyboardAvoidingView`, AsyncStorage hook, inclusive `Switch`, "New bill" confirm Alert.
- **M7 — Polish.** Safe areas everywhere, `expo-splash-screen`, app icon, accessibility (`accessibilityLabel`, `accessibilityRole="button"`, swipe hint), `LayoutAnimation` on section change.
- **M8 — Distribution.** `eas build --profile preview`; TestFlight internal group; Android internal track. Smoke test on iPhone (notched), Android (gesture-nav), and one older device.

## Verification

- **Unit (unchanged coverage):** `pnpm --filter @splitbill/core test` — splitter, store, resizeImage, parseReceipt offline mock.
- **Live integration:** `RUN_ANTHROPIC_TESTS=1 pnpm --filter @splitbill/core test parseReceipt` (≈$0.01/run, existing budget).
- **Web route:** `pnpm --filter web test` — unchanged.
- **Mobile components:** `jest-expo` + `@testing-library/react-native` for `SwipeableRow` (mock Reanimated; assert `runOnJS(onSwipe)` fires past threshold), inline-edit commit, Totals rendering against a known bill.
- **Manual matrix:** iOS Simulator (iPhone 15), Android emulator (Pixel 7 API 34), one physical iPhone, one physical Android. Verify permissions flow on both, swipe + haptic, keyboard avoidance, AsyncStorage survives app kill, gradient + safe-area rendering on notched devices.
- **Docs:** add a "Mobile" chapter to `doc/spec.md` covering permissions, navigation, persistence, deltas, and `API_BASE_URL` configuration.

## Risks & open questions

- **Hermes shims.** `parseReceipt` is kept server-only (mobile never bundles `@anthropic-ai/sdk`), so Hermes compatibility of the SDK is moot. Document the rule in `packages/core/src/index.ts` — only `server/index.ts` exports `extractReceipt`.
- **Backend exposure.** Today `/api/extract` is unauthenticated, intended for first-party browser use. Once a mobile binary calls it, add a shared-secret header or short-lived signed token to prevent abuse. Decide before **M4**.
- **CORS.** Mobile `fetch` ignores CORS, but if Vercel deployment adds OPTIONS preflight for any reason, add `Access-Control-Allow-Origin` allow-list including `splitbill://`.
- **iOS permission strings.** Must be empathetic and specific: `NSCameraUsageDescription = "Take a photo of your receipt so we can split it."`, same shape for `NSPhotoLibraryUsageDescription`.
- **Bundle size.** Reanimated + Gesture Handler + Image Manipulator add ~3 MB. Acceptable for a bill-splitting app; flag if tight.
- **Offline.** No on-device OCR. Fail-fast with a friendly error when `fetch` throws `Network request failed`. ML Kit fallback is a v2 nicety.
- **`crypto.randomUUID` under Hermes.** Existing fallback in `store.ts` line 149 is sufficient. Optionally polyfill at app boot with `expo-crypto.randomUUID` for stronger IDs.
- **Section-change animation fidelity.** framer-motion's `layoutId` does true shared-element morphing across sections. Reanimated's `Layout.springify()` does fade+slide — visually different. Acceptable tradeoff; designers should review in Figma.

## Critical files to modify

- `src/lib/store.ts` (split: reducer to core, hook to per-platform)
- `src/lib/splitter.ts` (move to core verbatim)
- `src/lib/parseReceipt.ts` (move to core, restricted to server export path)
- `src/lib/resizeImage.ts` (split: `computeResizeTarget` to core, canvas wrapper stays in `apps/web`)
- `src/lib/types.ts` (move to core verbatim)
- `src/app/page.tsx` (update imports to `@splitbill/core`; behavior unchanged)
- `src/app/api/extract/route.ts` (update imports to `@splitbill/core/server`; behavior unchanged)
- `package.json` → `pnpm-workspace.yaml` + per-app `package.json`s
- `doc/spec.md` (add Mobile chapter)
- All files under `apps/mobile/` are new
