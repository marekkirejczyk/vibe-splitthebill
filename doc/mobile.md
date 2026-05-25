# Split the bill — mobile specification

The mobile app (`apps/mobile/`) is the iOS + Android version of the same product as the web app. Same domain logic, same totals math, same inclusive-tax detection — different idiom: native gestures, haptics, safe areas, native pickers, native keyboard.

This document covers what the mobile app is and how it relates to the web app. For the web spec see [`web.md`](./web.md). For the 8-milestone migration roadmap see [`../plan.md`](../plan.md); for the detailed M1+M2 execution plan (already shipped) see [`../plan-m12.md`](../plan-m12.md).

**Design source of truth:** Figma file *Split the Bill — Mobile* — https://www.figma.com/design/yDOs60DEcPKCIvBEbMPtRD

---

## 1. Monorepo layout

The repo is a pnpm workspace with three packages:

```
apps/web/         ← Next.js 16 app — the existing product (see web.md)
apps/mobile/      ← Expo SDK 56 app — this document
packages/core/    ← @splitbill/core — pure domain logic shared by both
```

`packages/core` exports the type model, totals math (`computeTotals`, `formatMoney`), the reducer + helpers (`reducer`, `nextAssignee`, `toMultiItem`, `expandItemLine`, `billFromReceipt`, `detectInclusive`), the `StorageAdapter` interface + `STORAGE_KEY`, `computeResizeTarget`, and the `theme` design-token object. None of these touch the DOM, React, or platform APIs.

## 2. Shared-core boundary

Two rules hold the boundary:

- `packages/core/tsconfig.json` omits `"dom"` from `lib`, so accidentally referencing `window`, `document`, or `localStorage` from core is a type error.
- `parseReceipt` (which imports `@anthropic-ai/sdk`) is reachable only from the server-only path `@splitbill/core/server`. Mobile **never** imports it — when it needs to extract a receipt, it `POST`s the photo to the web app's `/api/extract` route, which keeps the Anthropic key server-side.

The web app composes the core reducer with a `localStorage`-backed adapter in `apps/web/src/lib/useBillStore.ts`. The mobile app does the same with `AsyncStorage` (introduced in M3+).

## 3. Reuse inventory

What ships in `@splitbill/core` and is consumed verbatim by both apps:

| From core | What it does | Web uses it via | Mobile uses it via |
|---|---|---|---|
| `Item`, `Bill`, `ExtractedReceipt`, `Assignee`, `InclusiveFlags` (`types.ts`) | Domain types | direct import | direct import |
| `computeTotals`, `formatMoney` (`splitter.ts`) | Per-person totals + money formatting | `Totals.tsx`, `BillReview.tsx` | `Totals` screen component (M3) |
| `reducer`, `initialState`, `Action`, `State` (`store.ts`) | Pure state machine | `useBillStore` (web hook) | `useBillStore` (mobile hook, M3) |
| `nextAssignee` (`store.ts`) | Swipe state transitions | `SwipeableRow.tsx` | `SwipeableRow` (RN, M5) |
| `billFromReceipt`, `toMultiItem`, `expandItemLine`, `detectInclusive` (`store.ts`) | Bill construction + inclusive detection | invoked inside reducer | invoked inside reducer |
| `StorageAdapter`, `STORAGE_KEY` (`storage.ts`) | Persistence contract | `localStorage` adapter | `AsyncStorage` adapter (M6) |
| `computeResizeTarget`, `MAX_EDGE`, `JPEG_QUALITY` (`resizeImage.ts`) | Pure dimension/size logic | `resizeImageDom.ts` (canvas wrapper) | `resizeImageNative.ts` (expo-image-manipulator, M4) |
| `theme` (`theme.ts`) | Design tokens (colors, spacing, type, radii, gradient, shadow) | mirrored in `globals.css` | `StyleSheet.create` direct |

What stays per-platform: the React/RN hook around the reducer, the image-resize wrapper, every UI component, the storage adapter, the API call wrapper.

## 4. Theme tokens

`packages/core/src/theme.ts` is the single source of truth for color, spacing, radius, type, gradient, and shadow values. The web app continues to read colors via Tailwind tokens (`apps/web/src/app/globals.css` mirrors the same hex values); mobile imports `theme` directly into `StyleSheet.create`.

```ts
import { theme } from "@splitbill/core";

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  money: { ...theme.type.moneyLg, color: theme.color.you },
});
```

The Figma file's Variables collection is a 1:1 mirror of `theme.ts`. When tokens change, both files must move together — code first, then re-run the Figma mirror script.

## 5. Figma source of truth

Mobile UI is designed in Figma **before** any RN screen code lands. The web layout is not ported pixel-for-pixel — native idioms (system fonts, native switches, full-bleed safe areas, haptic feedback) shape the new screens.

- **File:** *Split the Bill — Mobile* — https://www.figma.com/design/yDOs60DEcPKCIvBEbMPtRD
- **Variables collection:** `theme` (`color/`, `spacing/`, `radius/`, `type/`) — mirrors `packages/core/src/theme.ts`.
- **Frame stubs (M2):** five iPhone-15-sized (393×852) frames — `Start`, `Loading`, `Error`, `Bill Review`, `Inline Edit` — waiting to be designed in M3.
- **App Icon & Splash (M7):** the stacked-receipt mark (three cards on the orange→pink brand gradient, middle card tilted 7°) across six frames — `Icon — master (1024)`, `Adaptive — foreground/background/monochrome (1024)`, `Splash (1242×2688)`, `Favicon (256)`. Because the sandbox network policy can't reach Figma's asset CDN, the PNGs in `apps/mobile/assets/` are reproduced from these frames by `apps/mobile/assets/generate-icons.mjs` (HTML/CSS → headless-Chromium raster, the same Playwright technique as `tests/fixtures/generate.mjs`). Re-run it after a design change.

Design flow uses the Figma MCP server (`use_figma`). Round-trip per node via `get_design_context` + `get_variable_defs` to keep `theme.ts` and the Figma Variables in lockstep; `get_screenshot` for visual-regression baselines.

## 6. Screen-by-screen port

What each web component becomes on mobile:

| Web component | RN screen | Primitives | UX notes |
|---|---|---|---|
| `ImageInput.tsx` | `StartScreen` | `SafeAreaView`, `View`, `Text`, `Pressable` | Replace `<input type="file" capture="environment">` with `ImagePicker.launchCameraAsync` / `launchImageLibraryAsync`. Pre-request permissions; `Alert.alert` on deny with a Settings deep-link. |
| `LoadingScreen.tsx` | `LoadingScreen` | `ActivityIndicator`, animated skeleton (Reanimated `useSharedValue` opacity loop), `Pressable` | Cancel still aborts. Fire `Haptics.notificationAsync(Success)` when receipt arrives. |
| `ErrorScreen.tsx` | `ErrorScreen` | `SafeAreaView`, `Text`, `Pressable` | Same layout. Reserve native `Alert.alert` for transient/permission errors only. |
| `BillReview.tsx` | `BillReviewScreen` | `ScrollView` (not `FlatList` — virtualization fights row gestures), section chips, inclusive toggle row | Use `Switch` for inclusive toggles (more native than custom checkbox). |
| `SwipeableRow.tsx` | `SwipeableRow` | `Animated.View` (Reanimated), `Gesture.Pan()`, `TextInput`, `Pressable` | See §7 gesture spec. |
| `Totals.tsx` | `Totals` (footer) | `View` outside the `ScrollView`, `useSafeAreaInsets().bottom`, `expo-linear-gradient` hairline | Anchored absolutely; warn pill stays. |

**Functionally identical** to web: capture → extract → assign by swipe → see prorated totals → edit inline → persist → start over. The redesign is in idiom and chrome, not in behavior.

## 7. Gesture spec for `SwipeableRow`

Drop-in replacement for framer-motion drag:

```ts
import { Gesture } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const tx = useSharedValue(0);
const pan = Gesture.Pan()
  .activeOffsetX([-10, 10])
  .failOffsetY([-12, 12])          // let vertical scroll win
  .onUpdate((e) => { tx.value = clamp(e.translationX, -160, 160); })
  .onEnd((e) => {
    if (Math.abs(e.translationX) > 70) {
      const dir = e.translationX < 0 ? "left" : "right";
      runOnJS(onSwipe)(dir);
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    }
    tx.value = withSpring(0, { stiffness: 320, damping: 32 });
  });
```

The underlay view sits behind the row and computes label/color by calling `nextAssignee(item.assignee, dir)` from `@splitbill/core` — identical visual semantics to the web. `pan.enabled(false)` while a `TextInput` has focus, so the keyboard isn't fighting the gesture.

70 px commit threshold is the same as web. Vertical scroll wins below 12 px of Y deflection.

## 8. Image flow

The pipeline lives in `apps/mobile/src/lib/extractFromPicker.ts`: `expo-image-picker` (permission + native picker) → `expo-image-manipulator` (resize + force-JPEG so iOS HEIC becomes a MIME the route accepts) → multipart `fetch` to `${apiBaseUrl()}/api/extract`. `apiBaseUrl()` reads `Constants.expoConfig.extra.apiBaseUrl` from `app.config.ts`.

```ts
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { computeResizeTarget, JPEG_QUALITY } from "@splitbill/core";

const pick = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
if (pick.canceled) return;
const a = pick.assets[0];
const target = computeResizeTarget(a.width, a.height, a.fileSize ?? 0);
const out = await ImageManipulator.manipulateAsync(
  a.uri,
  target ? [{ resize: target }] : [],
  { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
);
const form = new FormData();
form.append(
  "image",
  { uri: out.uri, name: "receipt.jpg", type: "image/jpeg" } as any
);
const res = await fetch(`${API_BASE_URL}/api/extract`, {
  method: "POST",
  body: form,
});
```

`extractReceipt` (the Anthropic SDK wrapper in `@splitbill/core/server`) **never runs on the device** — mobile always goes through the hosted `/api/extract` so the API key stays server-side.

The orchestrator surfaces two error classes the host pattern-matches: `PickerCancelledError` (the user backed out of the native picker — silent return to Start) and `PermissionDeniedError` (camera or media-library access denied — `Alert.alert` with an "Open Settings" deep link via `Linking.openSettings()`). Everything else funnels into `ErrorScreen`. Cancel mid-upload uses an `AbortController` plumbed through to `fetch`, and a native `Alert.alert` ("Stop reading receipt?") confirms the cancel before aborting. A successful `LOAD_RECEIPT` dispatch fires `Haptics.notificationAsync(Success)`.

The web export (used by the Playwright smoke in `apps/mobile/e2e/smoke.spec.ts`) short-circuits to the M3 `delayedExtract()` mock via `Platform.OS === "web"` — the real picker isn't reachable in a browser. Native always hits the real pipeline.

## 9. Persistence

`packages/core/src/storage.ts` defines:

```ts
export const STORAGE_KEY = "splitbill.v1";

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

Each app supplies its own adapter:

| App | Adapter | Survives |
|---|---|---|
| Web | `localStorage` wrapper in `apps/web/src/lib/useBillStore.ts` | Page reload; cleared by "Clear site data". |
| Mobile | `asyncStorageAdapter` in `apps/mobile/src/lib/asyncStorageAdapter.ts`, wired through `apps/mobile/src/hooks/useBillStore.ts` | App kill + restart; cleared by uninstall. |

The `REHYDRATE` reducer action and the legacy `taxIncluded` → `inclusive` migration in `packages/core/src/store.ts` work unchanged — `AsyncStorage` serializes the same JSON shape.

The mobile `useBillStore` returns `[state, dispatch, hydrated]`. The host (`app/index.tsx`) returns `null` until `hydrated` is true, and `expo-splash-screen` holds the native splash across the rehydration round-trip (`preventAutoHideAsync()` at the top of `app/_layout.tsx`, `hideAsync()` once `hydrated` flips) so there's no black flash on cold start. State is written on every dispatch, but only after hydration completes — so the first render never clobbers a persisted bill with `initialState`.

## 10. Web vs mobile deltas

| Concern | Web | Mobile |
|---|---|---|
| Photo capture | hidden `<input capture="environment">` | `expo-image-picker` with explicit permission prompt + native picker UI |
| Swipe affordance | framer-motion drag, mouse + touch | `Gesture.Pan` + Reanimated, **medium haptic on commit** |
| Inline edit | `<input>` swapped into row | `TextInput`, `keyboardType="decimal-pad"`, `KeyboardAvoidingView`, return-key submits |
| Persistence | `localStorage` | `AsyncStorage` (survives app kill + restart) |
| Navigation | one page, internal state machine | Expo Router `Stack` with single `index` route reusing the same state machine |
| Errors | inline `ErrorScreen` only | inline screen for parse failures + native `Alert.alert` for permission denials / abort confirmations |
| Loading | CSS spinner | `ActivityIndicator` + animated skeleton; **success haptic** on receipt arrival |
| "New bill" CTA | bare link | `Alert.alert` confirm if any item is already assigned (prevents thumb fumble) |
| Safe areas | n/a (mobile web honors viewport meta) | `SafeAreaView` on every screen; `useSafeAreaInsets().bottom` padding on Totals; `expo-status-bar` |
| Pull-to-refresh | n/a | intentionally not added — bill is local; refresh would be destructive |
| Share/export | n/a | future: `expo-sharing` to share "You: $X · Them: $Y" |
| Section animation | framer-motion `layoutId` shared element | Reanimated `LinearTransition.springify()` row reflow + `FadeIn`/`FadeOut` sections (no true shared-element morph) |
| Multi-quantity | identical | identical (logic lives in core `expandItemLine`) |
| Inclusive toggles | `<input type="checkbox">` | `Switch` component, identical wiring through `SET_INCLUSIVE` action |
| Tax/tip/service math | identical | identical (logic lives in core `computeTotals`) |
| Assignee state machine | identical | identical (logic lives in core `nextAssignee`) |

High-level functionality is identical — the redesign is in idiom and chrome, not in behaviour.

## 11. App configuration

`apps/mobile/app.config.ts`:

- `scheme: "splitbill"` — for deep links and OAuth callbacks (future).
- `ios.infoPlist.NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` — empathetic, specific permission strings.
- `ios.bundleIdentifier`, `android.package` — `com.splitbill.app`.
- `icon: "./assets/icon.png"` — 1024² full-bleed source (iOS masks its own corners).
- `android.adaptiveIcon` — three layers: `foregroundImage` (the mark on transparent), `backgroundImage` (the brand gradient), `monochromeImage` (single-colour silhouette for Android 13+ themed icons; Android tints it via the alpha channel).
- `plugins`: `"expo-router"` plus `["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#f5f5f4" }]` — the splash mark centred on the stone background. The auto-hide *gate* lives in `app/_layout.tsx` / `app/index.tsx` (M6); this plugin supplies the *art* (M7).
- `assets/favicon.png` (48²) is the web tab icon; all icon/splash PNGs are generated by `assets/generate-icons.mjs` (see §5).
- `extra.apiBaseUrl` — read from `process.env.EXPO_PUBLIC_API_BASE_URL`, defaulting to the production Vercel URL. This is the host the mobile app POSTs receipts to.

`apps/mobile/metro.config.js`:

- `watchFolders: [workspaceRoot]` so changes in `packages/core` hot-reload.
- `resolver.nodeModulesPaths` includes both the local + hoisted node_modules.
- `resolver.disableHierarchicalLookup = true` — Metro stops at the workspace boundary.

`apps/mobile/babel.config.js`:

- `babel-preset-expo`.
- `react-native-reanimated/plugin` **last** in the plugins array (peer-dep order requirement).

Root `.npmrc` uses `node-linker=hoisted` — Expo's recommended pnpm-monorepo config, because Metro can't follow pnpm's nested symlinks for transitive peers like `whatwg-fetch` under `@expo/metro-runtime`.

## 12. Migration phases

The whole 8-milestone plan lives in [`../plan.md`](../plan.md); execution detail in [`../plan-m12.md`](../plan-m12.md), [`../plan-m3.md`](../plan-m3.md), [`../plan-m4.md`](../plan-m4.md), [`../plan-m5.md`](../plan-m5.md), [`../plan-m6.md`](../plan-m6.md), and [`../plan-m7.md`](../plan-m7.md).

| Phase | Goal | Status |
|---|---|---|
| **M1** | pnpm workspace, extract `@splitbill/core`, web continues to ship | ✅ shipped |
| **M2** | Expo scaffold, `theme.ts`, Metro watchFolders, Figma file | ✅ shipped |
| **M3** | Static screens against a mock bill — no gestures yet (tap-to-cycle) | ✅ shipped |
| **M4** | Real `expo-image-picker` + `expo-image-manipulator` + `fetch` to `/api/extract`, `Alert.alert` cancel + permission flows, success haptic | ✅ shipped |
| **M5** | `SwipeableRow` gestures: `Gesture.Pan` + Reanimated translateX + two stacked underlay layers + medium haptic on commit. Tap-to-cycle removed | ✅ shipped |
| **M6** | Inline edit (`TextInput` swap-in + `KeyboardAvoidingView`), `AsyncStorage` persistence, "New bill" confirm Alert, `expo-splash-screen` masking cold-start rehydration | ✅ shipped |
| **M7** | Polish: app icon + adaptive (fg/bg/monochrome) + designed splash visual, **`accessibilityActions` for VoiceOver / TalkBack swipe equivalents (M5 follow-up)**, `LinearTransition.springify()` row reflow + `FadeIn`/`FadeOut` sections, safe-area sweep | ✅ shipped |
| **M8** | EAS Build preview, TestFlight internal, Android internal track, physical-device smoke + shared-secret auth on `/api/extract` | next |

## 13. Risks and open questions

- **VoiceOver / TalkBack swipe equivalents — ✅ resolved in M7.** Each row exposes `accessibilityActions` filtered by the current assignee (the two reachable targets among `you` / `them` / `unassign`, spoken as "Assign to You" / "Assign to Them" / "Unassign"), and `onAccessibilityAction` dispatches the same `onSwipe(direction)` + medium haptic the gesture does. The action set is built by the pure `rowAccessibilityActions(assignee)` helper (`src/components/swipeDescriptor.ts`), derived from `nextAssignee`, so a11y and the visual underlay can't drift. A broader label/hint/`accessibilityLiveRegion`/focus-order audit is a deliberate post-M7 follow-up.
- **Backend exposure (M8 follow-up).** `/api/extract` is still unauthenticated as of M5 — mobile and web both call it as-is. **M8** will land a shared-secret header before TestFlight / Play internal: mobile reads `EXPO_PUBLIC_API_SECRET` and sends `x-splitbill-key: <secret>`; the route compares against `process.env.API_SHARED_SECRET` and 401s on mismatch. Until then, don't publicise the deployed URL outside the team.
- **CORS — not needed.** Confirmed in M4: RN `fetch` is non-browser, so no OPTIONS preflight is triggered for `POST multipart/form-data`. If a future web client moves off `apps/web` (different origin), add `Access-Control-Allow-Origin` to the route's response headers.
- **iOS permission strings.** Must be empathetic and specific (already wired in `app.config.ts`): `NSCameraUsageDescription = "Take a photo of your receipt so we can split it."`, same shape for `NSPhotoLibraryUsageDescription`.
- **Bundle size.** Reanimated + Gesture Handler + Image Manipulator add ~3 MB. Acceptable for a bill-splitting app; flag if tight.
- **Offline.** No on-device OCR. Fail-fast with a friendly error when `fetch` throws `Network request failed`. ML Kit fallback is a v2 nicety.
- **`crypto.randomUUID` under Hermes.** Existing fallback in `packages/core/src/store.ts` is sufficient. Optionally polyfill at app boot with `expo-crypto.randomUUID` for stronger IDs.
- **Section-change animation fidelity.** framer-motion's `layoutId` does true shared-element morphing across sections. Mobile uses Reanimated `LinearTransition.springify()` on the row's outer wrapper (reflow as items move between buckets) plus `FadeIn`/`FadeOut` on the section containers (`Layout` is a deprecated alias for `LinearTransition` in Reanimated 4.x). This is fade+slide, not a true shared-element morph — an accepted native-idiom tradeoff. The layout animation lives on the *outer* wrap so it doesn't fight the inner translateX pan transform.

## 14. Verification

| Check | Command | What it proves |
|---|---|---|
| Core tests pass | `pnpm --filter @splitbill/core test` | The pure logic mobile relies on is bit-identical with what web ships. |
| Live Anthropic still works | `RUN_ANTHROPIC_TESTS=1 pnpm --filter @splitbill/core test:int` | `extractReceipt` works through its core path — the server route mobile POSTs to is unchanged. |
| Mobile bundles | `pnpm --filter @splitbill/mobile expo export --platform ios` | Metro resolves `@splitbill/core` across the workspace; the placeholder screen + theme tokens compile to a Hermes bundle. |
| Mobile boots | `pnpm --filter @splitbill/mobile ios` / `android` | iOS Simulator + Android emulator render the placeholder screen with theme color swatches and `computeTotals` output. |
| Web unchanged | `pnpm --filter web test && pnpm --filter web build` | The refactor didn't regress web. |
