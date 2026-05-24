# React Native migration — Phase 4 (M4, image capture + API integration)

## Context

M1 turned the repo into a pnpm workspace and extracted `@splitbill/core` (verified at `c0d49c8`). M2 stood up `apps/mobile` as an Expo SDK 56 app with the design tokens module wired across the workspace (verified at `15f3b39`). M3 replaced the M2 smoke screen with the full visual surface of the mobile app — Start, Loading, Error, Bill Review with sticky Totals, inclusive toggles, tap-to-cycle assignment — driven by a hardcoded `mockReceipt` and the same `@splitbill/core` reducer the web app uses (verified at `4c3567c`, with a Playwright smoke locked in at `a0c9daa`).

M4 replaces the M3 mock seam with the **real image-capture pipeline**: `expo-image-picker` for camera + library access, `expo-image-manipulator` to convert/resize on-device using the same `computeResizeTarget` heuristic web uses, and a multipart `fetch` POST to the hosted Next.js `/api/extract` route. The deliverable is: a user installing the Expo Go build on a real phone (or running the iOS simulator with library access) taps "Take photo", sees the OS camera UI, snaps a real receipt, watches the LoadingScreen for ~2-5 s, then lands on Bill Review with their actual line items — bit-identical UX to the web `apps/web/src/app/page.tsx` flow, just with native chrome around it.

After M4, the next two milestones layer behaviour and polish on top of working data: M5 swaps the M3 tap-to-cycle `Pressable` in `SwipeableRow` for the Reanimated `Gesture.Pan` with medium haptic on commit; M6 adds the `TextInput` swap-in inline editor, `AsyncStorage` persistence, and the "New bill" confirm Alert. None of those changes touch the M4 data path.

## Decisions baked in

- **Backend stays unauthenticated for M4.** `plan.md`'s "Risks & open questions" section flagged backend exposure as a decision-before-M4. We're consciously deferring auth to **M8** (the EAS Build / TestFlight milestone) and shipping M4 against the existing public `/api/extract`. Trade-off: any preview deploy URL handed out to designers is technically callable by anyone who finds it. Mitigations during M4–M7: don't publicise the deployed URL outside the team; rely on Vercel's preview-URL obscurity. M8 will land a shared-secret header (`x-splitbill-key` against `process.env.API_SHARED_SECRET`) before the binary ships to TestFlight / Play internal. A follow-up TODO is filed in `doc/mobile.md` §13.
- **Cancel-mid-upload uses a native `Alert.alert` confirm.** Tapping Cancel on LoadingScreen first raises an Alert ("Stop reading receipt?" with Cancel / Stop). Only on "Stop" do we abort the in-flight `fetch` via `AbortController` and return to Start. This is the M4 deviation from the web flow (which aborts immediately) — chosen because the M4 round-trip is the longest single tap-confirmed action in the app and a thumb-fumbled Cancel is more disruptive on mobile.
- **Pure orchestrator + jest unit tests.** The picker → resize → fetch → parse → dispatch logic is extracted into one pure async function in `apps/mobile/src/lib/extractFromPicker.ts`. The tests in `extractFromPicker.test.ts` mock `expo-image-picker`, `expo-image-manipulator`, and `global.fetch` to drive every branch (permission deny, picker cancel, manipulator error, 4xx, 5xx, empty `lines`, network failure, abort). The `app/index.tsx` host stays thin — orchestration only.
- **Web/Playwright e2e keeps using the mock.** The M3 Playwright suite (`apps/mobile/e2e/smoke.spec.ts`) drives the app via the Expo web export, which has no access to a real camera. M4 keeps the existing `delayedExtract()` mock reachable behind a `Platform.OS === "web"` fork inside the load handler, so the e2e suite stays green and continues to exercise the loading/bill/error visual states. Native always hits the real picker. The `apps/mobile/src/fixtures/mockBill.ts` file stays in the repo for both the e2e fork and the orchestrator tests.
- **HEIC conversion happens unconditionally.** iOS picker often returns HEIC, which is **not** in the route's `ALLOWED_TYPES` set. Even when the source asset is already under the resize threshold, we still pipe it through `ImageManipulator.manipulateAsync(uri, [], { format: JPEG, compress: JPEG_QUALITY })` to guarantee a `.jpg` payload. This costs one extra encode on small JPEGs but keeps the route contract clean.
- **Permission denial uses native `Alert.alert` with an "Open Settings" deep-link.** Not the inline ErrorScreen — denying permission is a system state, not a parse failure. The Alert offers `Cancel` and `Open Settings` (`Linking.openSettings()`); the flow returns to the StartScreen on either.
- **Success haptic on bill arrival.** Fire `Haptics.notificationAsync(NotificationFeedbackType.Success)` when `LOAD_RECEIPT` dispatches, mirroring `plan.md`'s "fire success haptic when receipt arrives" note. The medium-impact swipe haptic stays scoped to M5.
- **No retry-with-last-photo button on mobile.** The web `ErrorScreen` `onRetry` callback re-runs the extract against the previously picked `File`. Mobile can't hold a `File` reference — the `out.uri` is a temp file that may have been cleaned up. The mobile `ErrorScreen` retry button kicks the user back to Start so they re-pick. The component shape doesn't change; just the wiring.
- **Dev hatch removed.** The "Show error state (dev)" `Pressable` in `StartScreen` (the `onSimulateError` prop) was always a temporary affordance for M3 design review. M4 removes it — the prop, the styles, the test ID, and the call site in `app/index.tsx` all go.

## M4 — Image capture + API integration

### Step M4.0 — Confirm dependency state (no install needed)

`expo-image-picker@~56.0.13`, `expo-image-manipulator@~56.0.14`, `expo-haptics@~56.0.3`, `expo-constants@~56.0.15`, and `expo-linear-gradient@~56.0.4` are already in `apps/mobile/package.json` (added in M2 step M2.3). Confirm with:

```
pnpm --filter @splitbill/mobile ls expo-image-picker expo-image-manipulator expo-haptics expo-constants
```

If any are missing (e.g. a stray `pnpm install` blew them away), reinstall pinned to those exact versions. No new runtime deps land in M4. `expo-linking` is built into Expo SDK 56 so `Linking.openSettings()` is reachable without an explicit dep.

### Step M4.1 — `apiBaseUrl` resolution helper

`apps/mobile/src/lib/apiBaseUrl.ts` (new):

```ts
import Constants from "expo-constants";

export function apiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {}) as {
    apiBaseUrl?: string;
  };
  const fromExtra = extra.apiBaseUrl;
  if (fromExtra && fromExtra.length > 0) return fromExtra.replace(/\/$/, "");
  // Belt-and-braces: `app.config.ts` already supplies a default, but if a future
  // build strips it we fall back to the production Vercel URL explicitly here.
  return "https://vibe-splitthebill.vercel.app";
}
```

Pulled out as a helper (rather than inlined) so jest can `jest.mock("expo-constants")` once and drive the orchestrator tests. Keeps `Constants` access off the hot path.

### Step M4.2 — Pure extract orchestrator

`apps/mobile/src/lib/extractFromPicker.ts` (new). Public shape:

```ts
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  computeResizeTarget,
  JPEG_QUALITY,
  type ExtractedReceipt,
} from "@splitbill/core";
import { apiBaseUrl } from "./apiBaseUrl";

export type PickerSource = "camera" | "library";

export class PickerCancelledError extends Error {
  constructor() { super("Picker cancelled"); this.name = "PickerCancelledError"; }
}
export class PermissionDeniedError extends Error {
  constructor(public source: PickerSource) {
    super(`${source} permission denied`);
    this.name = "PermissionDeniedError";
  }
}

export async function extractFromPicker(
  source: PickerSource,
  options: { signal?: AbortSignal } = {}
): Promise<ExtractedReceipt> {
  // 1. Permissions (per source — camera vs media-library)
  const perm = source === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PermissionDeniedError(source);

  // 2. Launch the native picker
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ quality: 1, exif: false, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    : await ImagePicker.launchImageLibraryAsync({ quality: 1, exif: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });
  if (result.canceled) throw new PickerCancelledError();
  const asset = result.assets[0];

  // 3. Resize + force-JPEG via expo-image-manipulator. HEIC → JPEG conversion is
  //    unconditional even when no resize is needed (server's ALLOWED_TYPES has
  //    no entry for HEIC). actions: [] is a valid no-op.
  const target = computeResizeTarget(asset.width, asset.height, asset.fileSize ?? 0);
  const out = await ImageManipulator.manipulateAsync(
    asset.uri,
    target ? [{ resize: target }] : [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  // 4. Multipart POST. Cancellable via the AbortSignal passed in. React Native
  //    fetch accepts the { uri, name, type } object literal for file parts.
  const form = new FormData();
  form.append("image", {
    uri: out.uri,
    name: "receipt.jpg",
    type: "image/jpeg",
  } as any);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/extract`, {
      method: "POST",
      body: form,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // RN's fetch throws TypeError("Network request failed") when offline. Translate.
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  // 5. Parse + validate
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Server returned ${res.status}`);
  }
  const receipt = (await res.json()) as ExtractedReceipt;
  if (!receipt.lines || receipt.lines.length === 0) {
    throw new Error("I couldn't read any items from that photo. Try a sharper one?");
  }
  return receipt;
}
```

Behaviour parity with `apps/web/src/app/page.tsx` lines 23–56: same resize → multipart → status check → empty-lines guard → friendly server-error pass-through. The two new wrinkles are `PickerCancelledError` (the web flow doesn't need this — the `<input>` reset handles cancel implicitly) and `PermissionDeniedError` (web has no permission gate).

### Step M4.3 — Tests for the orchestrator

`apps/mobile/src/lib/extractFromPicker.test.ts` (new). Top-level mocks:

```ts
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiBaseUrl: "https://example.test" } } },
}));
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
```

Cases (one `test(...)` each):

1. **camera permission denied** → `requestCameraPermissionsAsync` returns `{ granted: false }`, expect `PermissionDeniedError` with `source === "camera"`. `launchCameraAsync` is not called.
2. **library permission denied** → mirror of (1) for library.
3. **user cancels the camera picker** → permission granted, `launchCameraAsync` returns `{ canceled: true }`, expect `PickerCancelledError`. `manipulateAsync` is not called.
4. **happy path** — picker returns one asset 2400×1800 (so resize triggers), manipulator returns `{ uri: "file:///tmp/out.jpg" }`, fetch returns 200 with a known `ExtractedReceipt`. Assert:
   - `computeResizeTarget` outputs (long edge ≤ MAX_EDGE) — verify via the `actions` array passed to `manipulateAsync`.
   - `manipulateAsync` was called with `format: "jpeg", compress: JPEG_QUALITY`.
   - The returned receipt matches the mocked response byte-for-byte.
5. **small image — no resize, still JPEG** — picker returns 800×600 / 300 KB, expect `manipulateAsync` called with `actions: []` (force-JPEG-only). Returned receipt unchanged.
6. **server returns 502 with error JSON** → expect thrown Error message to be the server's `error` field (e.g. `"Anthropic 529: overloaded"`).
7. **server returns 500 with empty body** → expect thrown Error message to fall back to `"Server returned 500"` (status text path).
8. **server returns 200 but `lines === []`** → expect thrown Error "I couldn't read any items from that photo. Try a sharper one?".
9. **fetch throws TypeError("Network request failed")** → expect thrown Error "Couldn't reach the server. Check your connection and try again."
10. **AbortSignal aborts mid-fetch** — fetch rejects with `new DOMException("aborted", "AbortError")` (the jest mock simulates this). Expect the original `AbortError` to propagate so the caller can distinguish.

Each test resets all mocks in `beforeEach`. No real Anthropic key needed (server is fully mocked). Runs under the existing `jest-expo` preset — no new test config.

### Step M4.4 — Phase-machine host rewrite

Replace the body of `apps/mobile/app/index.tsx` to (a) wire the orchestrator behind a `Platform.OS === "web"` fork, (b) keep an `AbortController` per load, (c) add the cancel-confirm Alert, (d) translate `PermissionDeniedError` into an Alert with an Open-Settings deep link, (e) fire a success haptic on bill arrival, (f) drop the `onSimulateError` dev hatch.

Key shape:

```ts
import { useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { BillReview } from "../src/components/BillReview";
import { ErrorScreen } from "../src/components/ErrorScreen";
import { LoadingScreen } from "../src/components/LoadingScreen";
import { StartScreen } from "../src/components/StartScreen";
import { delayedExtract } from "../src/fixtures/mockBill";
import { useBillStore } from "../src/hooks/useBillStore";
import {
  extractFromPicker,
  PermissionDeniedError,
  PickerCancelledError,
  type PickerSource,
} from "../src/lib/extractFromPicker";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function Index() {
  const [state, dispatch] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function loadReceipt(source: PickerSource) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "loading" });
    try {
      const receipt = Platform.OS === "web"
        ? await delayedExtract()
        : await extractFromPicker(source, { signal: ctrl.signal });
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err) {
      if (err instanceof PickerCancelledError) { setPhase({ kind: "idle" }); return; }
      if (err instanceof DOMException && err.name === "AbortError") { setPhase({ kind: "idle" }); return; }
      if (err instanceof PermissionDeniedError) {
        setPhase({ kind: "idle" });
        Alert.alert(
          err.source === "camera" ? "Camera access needed" : "Photo library access needed",
          err.source === "camera"
            ? "Enable camera access in Settings to snap a receipt."
            : "Enable photo library access in Settings to pick a receipt.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => { void Linking.openSettings(); } },
          ],
        );
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  function requestCancel() {
    Alert.alert("Stop reading receipt?", "We'll stop the upload and you can pick another photo.", [
      { text: "Keep reading", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => abortRef.current?.abort() },
    ]);
  }

  if (phase.kind === "loading") return <LoadingScreen onCancel={requestCancel} />;
  if (phase.kind === "error") {
    return (
      <ErrorScreen
        message={phase.message}
        onRetry={undefined}            // retry from ErrorScreen kicks back to Start — see M4.5
        onStartOver={() => setPhase({ kind: "idle" })}
      />
    );
  }
  if (state.bill) {
    return <BillReview bill={state.bill} dispatch={dispatch} onReset={() => dispatch({ type: "RESET" })} />;
  }
  return <StartScreen onTakePhoto={() => loadReceipt("camera")} onChooseLibrary={() => loadReceipt("library")} />;
}
```

The `onSimulateError` prop is dropped from the StartScreen call site. The `loadMock` function is removed.

### Step M4.5 — `StartScreen` cleanup

Edits to `apps/mobile/src/components/StartScreen.tsx`:

- Remove the `onSimulateError?: () => void` prop from `Props`.
- Remove the `<Pressable>` block that renders the "Show error state (dev)" hatch (lines 50–54 today).
- Remove the unused `Pressable` import if nothing else in the file needs it (currently only the dev hatch does).
- Remove the `devHatch` / `devHatchLabel` style entries.

Update `apps/mobile/src/components/StartScreen.test.tsx` (if it asserted the `onSimulateError` testID): drop those assertions; everything else stays.

### Step M4.6 — `ErrorScreen` retry semantics

`apps/mobile/src/components/ErrorScreen.tsx` already accepts `onRetry?: () => void` and only renders the Try Again button when defined. M4 always passes `onRetry={undefined}` from the host, so the button hides and only "Pick a different photo" shows — which kicks back to Start where the user re-picks. No component change needed. Add a one-sentence note to its JSDoc / inline comment explaining the M4 behavior (so M5 doesn't accidentally re-introduce a stale-URI retry).

### Step M4.7 — `LoadingScreen` is unchanged

The component already accepts `onCancel: () => void`. M4 supplies a new wrapper (`requestCancel` in the host) that raises the Alert first. The component itself doesn't need to know about the Alert; this keeps it pure and reusable.

### Step M4.8 — Web e2e parity check

`apps/mobile/e2e/smoke.spec.ts` exercises the M3 phase machine via the Expo web export. The `Platform.OS === "web"` fork in step M4.4 keeps the mock path reachable, so the Playwright run sees `delayedExtract()` exactly as today. Re-run:

```
pnpm --filter @splitbill/mobile e2e
```

Should still go green with zero changes to the spec file. If it doesn't, debug the host's web fork — do NOT add picker mocks to the e2e harness; the right invariant is that web stays mock-driven, native always real.

### Step M4.9 — Manual smoke matrix

iOS Simulator (iPhone 15) + Android emulator (Pixel 7 API 34) + at least one physical device:

```
pnpm --filter @splitbill/mobile ios
pnpm --filter @splitbill/mobile android
```

Click-throughs to verify:

1. **Permission flow — camera (iOS).** Tap Take photo → iOS prompts with the `NSCameraUsageDescription` string from `app.config.ts`. Deny → Alert.alert with "Camera access needed" → tap Open Settings → lands in iOS Settings → back-swipe → StartScreen. Grant → camera UI opens.
2. **Permission flow — library (Android).** Tap Choose from library → Android prompts for media access. Deny → Alert with "Photo library access needed". Grant → photo picker opens.
3. **Happy path on a real receipt photo.** Pick `tests/fixtures/receipt.jpg` from the simulator's photo library → LoadingScreen for ~2-5 s → BillReview renders with the actual line items extracted from the JPEG → success haptic fires (on physical device; simulator silently no-ops). Subtotal + total reasonable.
4. **HEIC handling (iOS).** Pick a HEIC asset from the simulator's default photos → manipulateAsync transcodes to JPEG → server accepts → BillReview renders.
5. **Cancel mid-load.** Tap Take photo → simulate a slow extract by toggling a 3G network condition in the simulator → on LoadingScreen, tap Cancel → Alert.alert "Stop reading receipt?" → tap Keep reading → spinner continues. Repeat, tap Stop → returns to Start, no error screen.
6. **Server error.** Point `EXPO_PUBLIC_API_BASE_URL` at a URL that returns 502 (or temporarily set the deployed Vercel env to drop `ANTHROPIC_API_KEY`) → tap Take photo → snap → ErrorScreen renders with the server's error message → tap Pick a different photo → returns to Start.
7. **Offline.** Toggle the device's airplane mode → tap Take photo → snap → ErrorScreen renders "Couldn't reach the server. Check your connection and try again." → re-enable network → Pick a different photo → retry succeeds.
8. **Empty-extract path.** Snap a non-receipt (e.g. blank wall) → server returns 200 with `lines: []` → ErrorScreen renders "I couldn't read any items from that photo. Try a sharper one?".
9. **Safe areas + footer.** On a notched device, the LoadingScreen Cancel button doesn't clip the home indicator; BillReview Totals respects `useSafeAreaInsets().bottom` once a receipt loads.

### Step M4.10 — Verify M4 (automated)

```
pnpm -r lint
pnpm -r test                                              # core (67) + mobile (M3 + ~10 new orchestrator tests)
pnpm --filter web build                                   # web still builds
pnpm --filter web test                                    # route test unchanged (auth deferred to M8)
pnpm --filter @splitbill/mobile e2e                       # web e2e still green via Platform.OS web fork
pnpm --filter @splitbill/mobile start --no-dev --minify   # production-style Hermes bundle compiles
```

CI's `pnpm -r test` step picks up the new orchestrator tests automatically. No workflow edits needed.

### Step M4.11 — Update docs

`doc/mobile.md`:

- §8 "Image flow": replace the `M4` future-tense framing with present-tense, since M4 ships it. The code block in lines 125–148 stays — it's the canonical recipe — but the paragraph above it switches from "will be" to "is".
- §12 "Migration phases": flip `M4` row from blank to `✅ shipped`, with a one-line bullet of the M4 changes (real picker, Alert-confirm cancel, success haptic, permission-denied Alert).
- §13 "Risks and open questions": tighten the **Backend exposure** bullet to call out that M4 ships unauth'd and M8 lands the shared-secret header. Move the **CORS** bullet to "resolved — not needed in M4" (RN fetch is non-browser; no preflight) but keep a sentence about adding `Access-Control-Allow-Origin` if a future web client moves off `apps/web`.

Optional: append a one-line status note to `doc/spec.md` if that file is still kept (it isn't in the current tree — `doc/` only has `web.md` and `mobile.md`).

## Critical files modified or created

- `apps/mobile/src/lib/apiBaseUrl.ts` (new — `Constants.expoConfig.extra.apiBaseUrl` reader)
- `apps/mobile/src/lib/extractFromPicker.ts` (new — pure orchestrator + `PickerCancelledError` + `PermissionDeniedError`)
- `apps/mobile/src/lib/extractFromPicker.test.ts` (new — 10 jest cases covering every branch)
- `apps/mobile/app/index.tsx` (rewrite — orchestrator wiring, AbortController, cancel-confirm Alert, permission-denied Alert, success haptic, web-fork to keep e2e green, dev hatch removed)
- `apps/mobile/src/components/StartScreen.tsx` (edit — drop `onSimulateError` prop, dev-hatch `<Pressable>`, and unused styles)
- `apps/mobile/src/components/StartScreen.test.tsx` (edit if it asserted the dev hatch testID — otherwise no change)
- `apps/mobile/src/components/ErrorScreen.tsx` (no code change; one-line comment explaining M4's "retry kicks to Start" wiring)
- `doc/mobile.md` (edit — §8 tense flip, §12 status flip, §13 risks tightened)

**Reused as-is from `@splitbill/core`:** `computeResizeTarget`, `JPEG_QUALITY`, `MAX_EDGE`, `RESIZE_SIZE_THRESHOLD` (the resize math is identical on web and mobile — same numbers, same threshold), `ExtractedReceipt` type, `reducer` + `initialState` (no changes; mobile `LOAD_RECEIPT` payload is the same shape web ships), `theme`. No core changes in M4.

**Reused as-is from `apps/mobile`:** every M3 component (`StartScreen` minus the dev hatch, `LoadingScreen`, `ErrorScreen`, `BillReview`, `Totals`, `SwipeableRow`, `PrimaryButton`, `SecondaryButton`, `Chip`, `InclusiveToggleRow`), `useBillStore` (still in-memory; AsyncStorage lands in M6), `mockBill.ts` + `delayedExtract()` (kept for the Platform.OS === "web" fork and as a jest fixture).

**Untouched on web:** `apps/web/src/app/api/extract/route.ts`, `route.test.ts`, `next.config.ts`, `vercel.json`. The route already accepts the multipart shape mobile sends and the four MIME types we forward (mobile only ever sends `image/jpeg`, but the route doesn't care). No CORS headers added — RN fetch is non-browser; no preflight is triggered for `POST multipart/form-data`.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core untouched | `pnpm --filter @splitbill/core test` | 67 unit tests still green; M4 is additive only. |
| Web route untouched | `pnpm --filter web test` | The route's existing test matrix (400 / 413 / 415 / 500 / 502 / 200 / four MIMEs) still passes against the bytes mobile sends. |
| Mobile orchestrator tests | `pnpm --filter @splitbill/mobile test extractFromPicker` | All 10 cases green: permission denials, picker cancel, happy path, no-resize, server 4xx/5xx, empty lines, network failure, abort. |
| All mobile tests | `pnpm --filter @splitbill/mobile test` | M3 component tests + new orchestrator tests + smoke. |
| Web e2e parity | `pnpm --filter @splitbill/mobile e2e` | Playwright smoke still green via `Platform.OS === "web"` fork in the host. |
| Mobile bundle compiles | `pnpm --filter @splitbill/mobile start --no-dev --minify` | Production-style Hermes bundle builds with the new orchestrator and Constants/Linking/Alert/Haptics imports. |
| iOS smoke | `pnpm --filter @splitbill/mobile ios` + step M4.9 checklist | Real camera + library + permission flows + cancel-confirm + Settings deep-link work on a notched device. |
| Android smoke | `pnpm --filter @splitbill/mobile android` | Same checklist on Android; permission UI matches Android idiom. |
| Web hasn't regressed | `pnpm --filter web build && pnpm --filter web dev` + browser smoke | Snap a receipt in the browser — happy path still works against the unchanged route. |
| CI is green | Push, watch the workflow | `pnpm -r test` runs the new orchestrator tests alongside the M3 suite; Vercel preview deploys from `apps/web` unchanged. |

## Risks and follow-ups (deferred to later milestones)

- **Backend auth (M8).** `/api/extract` is still publicly callable. M8's TestFlight gate lands a shared-secret header: mobile reads `EXPO_PUBLIC_API_SECRET` and sends `x-splitbill-key: <secret>`; the route compares against `process.env.API_SHARED_SECRET` and returns 401 on mismatch. Web continues to call same-origin and the route allows missing-header from the same Vercel origin. File a tracking issue when M4 lands.
- **Retry-with-last-asset (out of scope).** Web's ErrorScreen can retry the same `File`; mobile can't safely retain the `out.uri` across an error. If we later want a real retry button, the orchestrator would need to expose the temp URI back to the caller and the host would have to track it. Not worth the complexity vs. "go back and re-pick".
- **Real swipe gesture (M5).** `SwipeableRow`'s `Pressable` wrapper is replaced with `GestureDetector` + `Gesture.Pan()` + medium haptic on commit. Independent of the M4 data path.
- **AsyncStorage persistence (M6).** `useBillStore` swaps in `AsyncStorage` behind the existing `StorageAdapter` interface from `@splitbill/core`. After M6, restarting the app after a successful M4 extract returns the user to the same Bill Review — closing the loop on the data path.
- **Inline edit (M6).** `TextInput` swap-in inside `SwipeableRow`. M4 doesn't touch it; the existing M3 props (`onEditName`, `onEditPrice`) stay unwired until M6.
- **HEIC + Live Photo handling.** `expo-image-picker` strips Live Photo to a still frame; HEIC → JPEG is handled in step M4.2. No follow-up needed unless someone reports a Live-Photo-specific failure.
- **iOS "limited photo access".** When the user picks "Selected photos only" instead of "Allow all", `requestMediaLibraryPermissionsAsync` returns `granted: true` with `accessPrivileges: "limited"`. The picker still works for the selected set. Not blocking M4 — flagged for M7 polish if we want a "manage selection" hint when the user can't find their receipt.
- **Bundle size.** Adding nothing new in M4 (deps shipped in M2). The Reanimated + Gesture Handler + Image Manipulator + Image Picker footprint stays ~3 MB. Still acceptable.
- **CORS.** Confirmed not needed for M4 (RN `fetch` is non-browser; no OPTIONS preflight for `POST multipart/form-data`). If a future web client moves off `apps/web` and into a separate domain, add `Access-Control-Allow-Origin` to the route's response headers.
- **Network reliability on flaky cellular.** A single retry-with-backoff on `TypeError("Network request failed")` would be a nice UX touch but is deliberately out of scope; the M4 path is one-shot. Flagged for M7 polish.
