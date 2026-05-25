# React Native migration — Phase 6 (M6, inline edit + persistence + reset confirm)

## Context

M1 turned the repo into a pnpm workspace and extracted `@splitbill/core`. M2 stood up `apps/mobile` as an Expo SDK 56 app with shared design tokens. M3 shipped the static screens against a mock bill, with tap-to-cycle row assignment. M4 wired the real `expo-image-picker` → `expo-image-manipulator` → multipart `fetch` to `/api/extract`, plus `Alert.alert` cancel + permission flows + success haptic. M5 replaced the M3 placeholder `Pressable` in `SwipeableRow` with `Gesture.Pan()` + Reanimated translateX + two stacked underlay layers + medium haptic on commit (merged at `3918623`).

M6 closes the feature-parity gap with the web app and starts the polish track. Three things ship together because they all touch `SwipeableRow.tsx` or `useBillStore.ts`:

1. **Inline edit.** Tapping the row's name text or price text swaps it for a `<TextInput>` with the right `keyboardType`. Blur commits the trimmed/parsed draft if valid (matches web's `apps/web/src/components/SwipeableRow.tsx` lines 99–110); invalid drafts are silently discarded. The `Gesture.Pan` is disabled while editing so the keyboard isn't fighting the gesture.
2. **AsyncStorage persistence.** `apps/mobile/src/hooks/useBillStore.ts` swaps the in-memory `useReducer` for the same load-on-mount + save-on-change pattern web uses (`apps/web/src/lib/useBillStore.ts`), backed by `@react-native-async-storage/async-storage` behind the existing `StorageAdapter` interface from `@splitbill/core`. State survives app kill + restart; uninstall clears it.
3. **"New bill" confirm + splash-screen masking.** Tapping the existing "↻ New bill" button on `BillReview` raises an `Alert.alert("Start over?", ...)` confirm **only if at least one item is assigned** (a fresh-loaded bill skips the prompt). Cold-start rehydration is masked by `expo-splash-screen`: `preventAutoHideAsync()` runs at boot, `hideAsync()` fires the moment `hydrated` flips to `true` — no black flash between bundle-load and first paint.

The `KeyboardAvoidingView` wrapper on `BillReview` is part of (1) — without it, editing a row near the bottom of the screen would push the keyboard over the row being edited. Inclusive `Switch` toggles (listed under M6 in `plan.md`) **already shipped in M3** via `InclusiveToggleRow.tsx`; no work needed here.

After M6, the mobile app reaches behavioural parity with the web app on every interaction: capture → extract → swipe to assign → inline edit name + price → see prorated totals → start over → state survives between sessions. M7 then handles polish that doesn't change behaviour: section-change animations (`Layout.springify()`), VoiceOver / TalkBack `accessibilityActions` (the M5 follow-up), app icon, and any remaining safe-area gaps. M8 lands the EAS Build + TestFlight gating + shared-secret auth on `/api/extract` (the M4 follow-up).

## Decisions baked in

- **Tap-outside commits if valid; otherwise discards.** Matches web's `onBlur` behaviour: `commitName()` trims and dispatches `EDIT_NAME` if non-empty and changed; `commitPrice()` parses (accepts `.` and `,`), dispatches `EDIT_PRICE` if a finite non-negative number distinct from the current price. Anything else: silent no-op, edit closes. Familiar mobile idiom (Mail, Notes, Settings all commit on blur).
- **Hardware Android back inside an open edit closes the edit (no commit) and dismisses the keyboard.** Web has no equivalent; this is the mobile-idiomatic cancel affordance. Implemented via `BackHandler.addEventListener('hardwareBackPress', ...)` inside the row's `useEffect`, scoped to `editing !== null`.
- **`Gesture.Pan().enabled(!editing)` toggles dynamically.** When any TextInput in the row is focused (`editing === "name"` or `"price"`), the pan handler is disabled — so the keyboard isn't fighting the gesture, and an accidental drag while typing doesn't reassign the row. Re-enabled the instant edit closes.
- **Name and price each get their own `<Pressable>` on the M5 row's text children.** No `Gesture.Race` or `Gesture.Native` plumbing needed: `Gesture.Pan().activeOffsetX([-10, 10])` already requires >10 px horizontal movement before the parent gesture engages, so a short tap on a child Pressable wins naturally. Validated in jest by firing the tap *before* any gesture state change.
- **Price input prefills with `item.price.toFixed(2)`, no currency symbol.** Matches web (`apps/web/src/components/SwipeableRow.tsx` line 69). `keyboardType="decimal-pad"` on iOS; `keyboardType="decimal-pad"` on Android renders the same — both expose dot and comma. `returnKeyType="done"` so the keyboard accessory reads "Done".
- **Persistence: save the whole `State` on every dispatch.** Mirrors `apps/web/src/lib/useBillStore.ts` lines 28–33 exactly. ~1–2 KB per write × ~20 writes per session = ~40 KB total disk churn per bill, ~5–20 ms per write on real hardware. Debouncing would add `useEffect` cleanup complexity and a 300 ms window for OS-kill data loss — not worth it. Web doesn't debounce either; keep parity.
- **`expo-splash-screen` is pulled into M6 (out of M7's plan.md slot).** ~20 lines of wiring. Without it the cold-start sequence shows a brief black flash between bundle-load and rehydrated state — visibly rough on a real phone. `SplashScreen.preventAutoHideAsync()` runs at the top of `app/_layout.tsx` (synchronous, before any React render); `SplashScreen.hideAsync()` fires from a `useEffect` in `app/index.tsx` keyed on `hydrated`. The M7 polish bucket loses splash + gains a slightly fuller scope (`Layout.springify()`, accessibilityActions, icon, safe-area sweeps).
- **The "New bill" confirm only fires when work would be destroyed.** `bill.items.some(it => it.assignee !== null)` — if every item is still unassigned (fresh load, user hasn't touched anything), tapping "↻ New bill" dispatches `RESET` directly. If anything is assigned, raise `Alert.alert("Start over?", "This clears your bill", [{Cancel}, {style:"destructive", text:"Start over", onPress: () => dispatch({type:"RESET"})}])`. Same logic shape as the M4 cancel-confirm, scaled-down message.
- **Hydration UI: return `null` from `app/index.tsx` until `hydrated === true`.** Same as web. The splash screen overlays the null view, so the user never sees the gap. Once `hydrated` and any persisted bill mount-renders, `hideAsync()` reveals the real UI in one frame.
- **No core changes.** `REHYDRATE`, `EDIT_NAME`, `EDIT_PRICE`, `RESET` actions all already exist in `packages/core/src/store.ts` (lines 16–17, 154, 182–193). The legacy `taxIncluded` → `inclusive.tax` migration on REHYDRATE (lines 156–161) catches any state written before M3's inclusive-flags refactor. No reducer edits.
- **No web changes.** `apps/web/src/lib/useBillStore.ts` already does the right thing on web; the new mobile hook is a per-platform sibling, not a replacement.
- **Tests use jest mocks for AsyncStorage + Alert.** `@react-native-async-storage/async-storage` already ships its own jest mock at `node_modules/.../async-storage/jest/async-storage-mock.js`; reference it via `jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))` in the hook test. `Alert.alert` gets a spy with `jest.spyOn(Alert, "alert").mockImplementation(...)` — the confirm-then-reset test invokes the "destructive" button's `onPress` synchronously by walking the buttons array passed to the spy.

## M6 — Inline edit + persistence + reset confirm

### Step M6.0 — Install `expo-splash-screen`

```
pnpm --filter @splitbill/mobile add expo-splash-screen@~56.0.4
```

Then verify `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `expo-constants`, `expo-image-picker`, `expo-image-manipulator`, `@react-native-async-storage/async-storage` are still pinned (they shipped in M2). The AsyncStorage adapter (M6.2) needs the package's `^3.1.0` already in `apps/mobile/package.json`.

### Step M6.1 — `asyncStorageAdapter.ts`

`apps/mobile/src/lib/asyncStorageAdapter.ts` (new):

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StorageAdapter } from "@splitbill/core";

export const asyncStorageAdapter: StorageAdapter = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
```

Five lines, no logic. Pulled out as a module so the hook can be tested by passing a different adapter (the jest mock for AsyncStorage works via the module mock pattern; we still keep the adapter file for clarity and as the natural extension point if we ever want a SecureStore variant).

### Step M6.2 — Rewrite `useBillStore.ts`

`apps/mobile/src/hooks/useBillStore.ts` (rewrite). Mirrors web's hook shape with `Promise`-returning storage instead of synchronous `localStorage`:

```ts
import {
  initialState,
  reducer,
  STORAGE_KEY,
  type Action,
  type State,
} from "@splitbill/core";
import { useEffect, useReducer, useState, type Dispatch } from "react";
import { asyncStorageAdapter } from "../lib/asyncStorageAdapter";

export function useBillStore(): [State, Dispatch<Action>, boolean] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  // Load on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await asyncStorageAdapter.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const loaded = JSON.parse(raw) as State;
          if (loaded.bill) dispatch({ type: "REHYDRATE", bill: loaded.bill });
        }
      } catch {
        // Silent — corrupted storage falls back to initialState.
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save on every change, but only after hydration finished.
  useEffect(() => {
    if (!hydrated) return;
    asyncStorageAdapter.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      // Silent — disk-full / sandbox issues shouldn't crash the UX.
    });
  }, [state, hydrated]);

  return [state, dispatch, hydrated];
}
```

Signature changes from `[State, Dispatch<Action>]` to `[State, Dispatch<Action>, boolean]`. The host adapts in M6.4.

### Step M6.3 — `useBillStore.test.ts`

`apps/mobile/src/hooks/useBillStore.test.ts` (new). Uses the official AsyncStorage jest mock:

```ts
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { useBillStore } from "./useBillStore";
import { STORAGE_KEY } from "@splitbill/core";

beforeEach(async () => {
  await AsyncStorage.clear();
});
```

Cases:

1. **Cold start with no persisted state** → `hydrated` flips false → true; `state.bill` stays null after hydration. No `setItem` called between mount and first dispatch.
2. **Cold start with a persisted bill** → seed AsyncStorage with `JSON.stringify({bill: knownBill})`; mount the hook; `hydrated` flips false → true; `state.bill` matches the seeded bill exactly. Verifies the `REHYDRATE` dispatch.
3. **Dispatch after hydration writes to AsyncStorage** → mount, wait for hydrated, dispatch `{type:"LOAD_RECEIPT", receipt: mockReceipt}`. Assert `AsyncStorage.setItem` was called with `STORAGE_KEY` and the JSON-parsed value has the loaded bill.
4. **Pre-hydration dispatches don't trigger writes** → mount, dispatch immediately before hydration completes, assert `setItem` is NOT called until after the rehydration effect finishes (guards against clobbering persisted data with the initialState on startup).
5. **Corrupted JSON → fall back to initialState** → seed AsyncStorage with `"not-json"`; mount; `hydrated` still flips to true; `state.bill === null`. No crash.
6. **Legacy `taxIncluded` shape is migrated on REHYDRATE** → seed with a Bill missing `inclusive` but with `taxIncluded: true`; mount; assert hydrated `state.bill.inclusive.tax === true`. (This is `packages/core/src/store.ts` line 156–161 territory — the test guards the core migration at the mobile boundary.)

~70 lines, all green on the jest mock.

### Step M6.4 — Inline edit on `SwipeableRow.tsx`

The M5 row currently renders `<Text>` for name and `<Text>` for price inside an `<Animated.View>`. M6 layers in:

- **State**: `const [editing, setEditing] = useState<"name" | "price" | null>(null); const [draft, setDraft] = useState("");` (single draft string; we never edit both simultaneously). Two `useRef<TextInput>` refs for autofocus + select-all.
- **Pan gate**: pass `editing !== null` as a derived `editingShared = useSharedValue(false)` synced via `useAnimatedReaction`, OR — simpler — call `pan.enabled(editing === null)` inline. The Gesture builder API in 2.31 accepts `.enabled(boolean)`; re-build the gesture object on each render with the current `editing` is fine, the GestureDetector handles the swap.
- **Tap handlers**: wrap the name `<Text>` in a `<Pressable onPress={startEditName}>` and the price `<Text>` in `<Pressable onPress={startEditPrice}>`. `startEditName` sets `draft = item.name`, `editing = "name"`. `startEditPrice` sets `draft = item.price.toFixed(2)`, `editing = "price"`.
- **TextInput swap-in**: when `editing === "name"` render the name `<Pressable>` as a `<TextInput ref={nameRef} value={draft} onChangeText={setDraft} onBlur={commitName} onSubmitEditing={commitName} autoFocus selectTextOnFocus blurOnSubmit returnKeyType="done" />`. Same shape for price with `keyboardType="decimal-pad"`.
- **Commit logic** (pure, ports web verbatim):
  ```ts
  function commitName() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) onEditName?.(trimmed);
    setEditing(null);
  }
  function commitPrice() {
    const parsed = parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== item.price) {
      onEditPrice?.(Math.round(parsed * 100) / 100);
    }
    setEditing(null);
  }
  ```
- **Android back-cancel**:
  ```ts
  useEffect(() => {
    if (editing === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setEditing(null);
      return true;
    });
    return () => sub.remove();
  }, [editing]);
  ```
- **TestIDs**: `${testID}-name-edit`, `${testID}-name-input`, `${testID}-price-edit`, `${testID}-price-input` so jest + Playwright can target each surface.

The underlay layers, pan handler structure, animated transform, and visual styles from M5 stay untouched. The component grows by ~50 lines of edit state + JSX.

### Step M6.5 — Tests for inline edit

Add ~6 jest cases to `apps/mobile/src/components/SwipeableRow.test.tsx`:

1. **Tap on name opens TextInput pre-filled with current name; pan disabled** → press `${testID}-name-edit`, assert TextInput renders with `value="Margherita pizza"`, assert `getByGestureTestId("row-pan")` reports disabled (verify via `getByGestureTestId(...).config.enabled === false` — the gesture-handler test API exposes config).
2. **Type then blur commits via `onEditName`** → fire `changeText` on the input to `"Margherita Reale"`, fire `blur` event, assert `onEditName` called with `"Margherita Reale"`. Editing closes.
3. **Blur with empty input discards** → fire `changeText` to `""`, `blur`; assert `onEditName` NOT called; row text back to original.
4. **Tap on price opens decimal-pad input pre-filled with toFixed(2)** → press `${testID}-price-edit`, assert TextInput renders with `value="14.00"` and `keyboardType="decimal-pad"`.
5. **Commit price `"14,5"` → dispatches 14.5** → asserts the comma-decimal parsing.
6. **Commit invalid price `"abc"` → no dispatch** → asserts `onEditPrice` NOT called.

For tests that interact with `Pressable` children, use `fireEvent.press(getByTestId("row-name-edit"))` from `@testing-library/react-native`. For BackHandler, mock `BackHandler.addEventListener` to capture the callback, invoke it manually, assert `editing` closed (visible via the input disappearing).

### Step M6.6 — `KeyboardAvoidingView` on BillReview

`apps/mobile/src/components/BillReview.tsx`: wrap the `<ScrollView>` in `<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={topBarHeight}>` so the keyboard doesn't cover the row being edited. Android's default `adjustResize` behaviour handles this already, so we leave `behavior={undefined}` there. The `topBar` View stays outside the KAV (its height becomes the `keyboardVerticalOffset`). No other layout change.

### Step M6.7 — Wire `onEditName` / `onEditPrice` through

`apps/mobile/src/components/BillReview.tsx` passes:

```tsx
<SwipeableRow
  item={item}
  currency={bill.currency}
  onSwipe={(direction) => dispatch({ type: "SWIPE", id: item.id, direction })}
  onEditName={(name) => dispatch({ type: "EDIT_NAME", id: item.id, name })}
  onEditPrice={(price) => dispatch({ type: "EDIT_PRICE", id: item.id, price })}
  testID={`row-${item.id}`}
/>
```

The two new prop callbacks (already defined as optional in M5's props) become non-optional in the wiring sense — every row gets them. No prop signature change.

### Step M6.8 — "New bill" confirm

`apps/mobile/src/components/BillReview.tsx`: change the `onReset` wiring. Currently it's `onReset={() => dispatch({ type: "RESET" })}` from `app/index.tsx`. Move the confirm logic into BillReview so the component owns the "is anything dirty?" check:

```tsx
function handleReset() {
  const hasAssignment = bill.items.some((it) => it.assignee !== null);
  if (!hasAssignment) {
    onReset();
    return;
  }
  Alert.alert("Start over?", "This clears your bill.", [
    { text: "Cancel", style: "cancel" },
    { text: "Start over", style: "destructive", onPress: onReset },
  ]);
}
// ...
<SecondaryButton label="↻ New bill" small onPress={handleReset} testID="bill-reset" />
```

`onReset: () => void` prop semantics stay the same; the host doesn't change. A new test in `BillReview.test.tsx` covers both branches (no-assignment → direct reset; some-assignment → Alert.alert → confirm → reset).

### Step M6.9 — Splash-screen wiring

`apps/mobile/app/_layout.tsx` (top, **before any React import** that needs to render):

```tsx
import * as SplashScreen from "expo-splash-screen";
// Top-level side effect — block auto-hide before any provider mounts.
SplashScreen.preventAutoHideAsync().catch(() => {});
```

`apps/mobile/app/index.tsx`: thread the new `hydrated` flag:

```tsx
const [state, dispatch, hydrated] = useBillStore();

useEffect(() => {
  if (hydrated) {
    SplashScreen.hideAsync().catch(() => {});
  }
}, [hydrated]);

if (!hydrated) return null;
// ...existing phase machine unchanged
```

The Loading / Error / BillReview screens come from M3 / M4 / M5 — none of them need to know about hydration.

### Step M6.10 — Playwright e2e

The existing e2e (two tests: the `phase machine` flow + the `M5 swipe` underlay/threshold test, both driving the mock-fixture path via `Platform.OS === "web"`). After M6:

- The web build will also persist via `@react-native-async-storage/async-storage`'s localStorage backend. Each Playwright test spawns a fresh context (verified in `playwright.config.ts` — no `storageState`), so localStorage starts empty per run. No e2e cleanup needed. The `M5 swipe` test stays unchanged.
- Add **two new test legs** to the `phase machine` test in `apps/mobile/e2e/smoke.spec.ts` after the existing swipe leg:
  1. **Inline edit smoke**: click the name on the You-assigned row → assert `getByTestId("row-{id}-name-input")` is focused → `page.keyboard.type("Pizza")` → press `Tab` (blur) → assert the row's text content updated to `"Pizza"`.
  2. **Reset-confirm smoke**: with an assigned row present, click `bill-reset` → assert the Alert dialog is visible (RN web renders Alert as an in-page modal — assert via `page.getByText("Start over?")`) → click "Start over" → returns to Start.
- Test name updated: `"phase machine: start → load → bill → swipe → edit → reset"`.

If RN Web's Alert.alert doesn't render as a DOM-queryable element (it may use a native browser `confirm()` instead — verify), the reset-confirm leg gets skipped on web and the jest test covers it instead. Decide at implementation time.

### Step M6.11 — Manual smoke matrix

iOS Simulator + Android emulator + at least one physical device:

```
pnpm --filter @splitbill/mobile ios
pnpm --filter @splitbill/mobile android
```

Click-throughs:

1. **Cold start with no persisted state** → splash holds → blank → Start screen renders. No black flash.
2. **Cold start with persisted bill** → snap a receipt, assign two rows, force-quit the app, relaunch → splash holds during JS load + rehydration → BillReview renders with the same assignments. No flicker.
3. **Inline name edit** → tap a row's name → keyboard slides up → row shifts above keyboard (KAV) → type, press Done → row updates → keyboard dismisses. Pan disabled while typing (try to drag — nothing happens).
4. **Inline price edit** → same as (3) but with decimal-pad keyboard. Type `14,50` → blur → row shows `$14.50`. Verifies the comma-as-decimal path.
5. **Invalid price edit** → type `abc` → blur → row reverts to original price. No dispatch.
6. **Android hardware back during edit** → open edit → press Back → edit closes, keyboard dismisses, no dispatch. App stays on BillReview.
7. **New bill confirm — clean state** → load a bill, don't assign anything → tap "↻ New bill" → returns to Start immediately, no Alert.
8. **New bill confirm — dirty state** → assign a row → tap "↻ New bill" → Alert appears → tap Cancel → bill intact → tap "↻ New bill" again → Alert → tap "Start over" → Start screen.
9. **Persistence across uninstall** → uninstall the app, reinstall → cold start → Start screen, no persisted bill. (Storage cleared on uninstall is the OS behaviour.)
10. **Persistence after background → foreground** → load + assign → background the app (home button) → wait 30 s → reopen → same state. (Memory should hold; this isn't testing AsyncStorage so much as that we don't accidentally re-mount.)

### Step M6.12 — Verify M6 (automated)

```
pnpm -r lint
pnpm -r test                                              # core (59) + web (9) + mobile (M5 baseline 44 + ~10 new = ~54)
pnpm --filter web build
pnpm --filter @splitbill/mobile e2e                       # 2 existing e2e tests + 2 new legs in the phase-machine test
pnpm --filter @splitbill/mobile start --no-dev --minify   # production-style Hermes bundle compiles with splash-screen
```

CI's `pnpm -r test` picks up the new suites automatically.

### Step M6.13 — Update `doc/mobile.md`

- §9 "Persistence": currently flags AsyncStorage as M6 future-tense; flip to past tense. Add a one-paragraph note about the hydrated-flag pattern + splash-screen masking.
- §10 "Web vs mobile deltas": the "Inline edit" row already lists the mobile shape; confirm `keyboardType="decimal-pad"` + `KeyboardAvoidingView` line up with what shipped. The "New bill CTA" row's `Alert.alert` confirm matches; no edit.
- §12 "Migration phases": flip M6 to ✅ shipped. M7 is "next" with one extra bullet: splash-screen done, focus shifts to `Layout.springify()` + `accessibilityActions` + app icon + safe-area sweeps.
- §13 "Risks and open questions": resolve the AsyncStorage bullet (it was in the M4 / M5 lists as deferred). Move the VoiceOver / TalkBack note to a dedicated "M7 top priority" subsection.

## Critical files modified or created

- `apps/mobile/src/lib/asyncStorageAdapter.ts` (new — 5-line adapter)
- `apps/mobile/src/hooks/useBillStore.ts` (rewrite — async hydrate + save effect; returns `[state, dispatch, hydrated]`)
- `apps/mobile/src/hooks/useBillStore.test.ts` (new — 6 cases covering cold start / persisted / pre-hydration write guard / corrupted JSON / legacy migration)
- `apps/mobile/src/components/SwipeableRow.tsx` (edit — edit state, `Pressable` taps on name + price, `TextInput` swap-in, gesture disable while editing, BackHandler cancel)
- `apps/mobile/src/components/SwipeableRow.test.tsx` (edit — 6 new edit cases on top of M5's 9 cases: 6 gesture + 3 underlay)
- `apps/mobile/src/components/BillReview.tsx` (edit — `KeyboardAvoidingView` wrapper, `onEditName` / `onEditPrice` wiring, `handleReset` with conditional Alert)
- `apps/mobile/src/components/BillReview.test.tsx` (edit — 2 new tests: edit-name dispatch, reset-confirm two-branch)
- `apps/mobile/app/_layout.tsx` (edit — `SplashScreen.preventAutoHideAsync()` top-level side effect)
- `apps/mobile/app/index.tsx` (edit — `[state, dispatch, hydrated]` from hook, `useEffect(SplashScreen.hideAsync, [hydrated])`, `if (!hydrated) return null;`)
- `apps/mobile/package.json` (edit — `expo-splash-screen@~56.0.4` added; nothing else)
- `apps/mobile/e2e/smoke.spec.ts` (edit — two new test legs: inline edit + reset confirm)
- `doc/mobile.md` (edit — §9, §12, §13 updates)

**Reused as-is from `@splitbill/core`:** `STORAGE_KEY`, `StorageAdapter`, `reducer`, `initialState`, all action types — every M6 piece is wiring around primitives core already provides. The legacy `taxIncluded` migration in the REHYDRATE case (`packages/core/src/store.ts` lines 156–161) handles any persisted state from before the inclusive-flags refactor automatically.

**Reused as-is from prior milestones:** M3 `LoadingScreen` / `ErrorScreen` / `StartScreen` / `Chip` / `InclusiveToggleRow` / `PrimaryButton` / `SecondaryButton`. M4 `extractFromPicker` orchestrator. M5 underlay rendering + gesture + descriptor logic.

**Untouched on web:** zero web changes.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core untouched | `pnpm --filter @splitbill/core test` | 59 unit tests still green; M6 wires primitives core already provides. |
| Web route untouched | `pnpm --filter web test` | The route's existing test matrix still passes. |
| AsyncStorage hook tests | `pnpm --filter @splitbill/mobile test useBillStore` | 6 cases: cold start, persisted-on-mount, write-after-hydration, pre-hydration guard, corrupted JSON, legacy migration. |
| SwipeableRow edit tests | `pnpm --filter @splitbill/mobile test SwipeableRow` | M5's 9 cases (6 gesture + 3 underlay) still pass + 6 new edit cases (open, blur-commit, blur-discard, price decimal-pad, comma parsing, invalid input). |
| BillReview edit + reset tests | `pnpm --filter @splitbill/mobile test BillReview` | M5's 4 baseline cases + 2 new (edit-name dispatch, reset-confirm two-branch). |
| All mobile tests | `pnpm --filter @splitbill/mobile test` | ~54 total; ~10 net new. |
| E2E swipe + edit + reset | `pnpm --filter @splitbill/mobile e2e` | Playwright smoke survives the additions — phase machine still goes start → load → bill → swipe → edit → reset. |
| Mobile bundle compiles | `pnpm --filter @splitbill/mobile start --no-dev --minify` | Production-style Hermes bundle builds with `expo-splash-screen` + AsyncStorage. |
| iOS smoke | `pnpm --filter @splitbill/mobile ios` + step M6.11 checklist | Splash holds through rehydration; inline edit + KAV + persistence + reset-confirm all feel native. |
| Android smoke | `pnpm --filter @splitbill/mobile android` | Hardware-back cancels edit; persistence survives kill+restart. |
| Web hasn't regressed | `pnpm --filter web build && pnpm --filter web dev` + browser smoke | Snap a receipt in the browser; inline edit + localStorage persistence still work on web (unchanged). |
| CI green | Push, watch the workflow | `pnpm -r test` runs the new suites alongside existing ones; Vercel preview deploys from `apps/web` unchanged. |

## Risks and follow-ups (deferred to later milestones)

- **Section-change animation (M7).** `Layout.springify()` on `<SwipeableRow>` to soften the bucket transition when an edit or swipe moves an item between Unassigned / You / Them. Web's framer-motion `layoutId` does true shared-element morphing — Reanimated's `Layout.springify()` is fade+slide. Acceptable tradeoff; queued for M7.
- **VoiceOver / TalkBack swipe actions (M7 — top priority).** M5's documented regression; M7 lands `accessibilityActions={[{name:"assignYou"}, {name:"assignThem"}, {name:"unassign"}]}` on each row, filtered by current assignee, with `onAccessibilityAction` dispatching `SWIPE`. Doesn't conflict with M6's inline edit because the edit Pressables get their own `accessibilityLabel` + `accessibilityRole="button"`.
- **App icon + adaptive icon (M7).** Currently `./assets/icon.png` is the Expo placeholder. Designed icon lands in M7.
- **EAS Build + shared-secret auth on `/api/extract` (M8).** Per the M4 follow-up.
- **Persistence-format versioning.** `STORAGE_KEY = "splitbill.v1"` already namespaces by version. If we ever ship a Bill shape change incompatible with the M3 / M6 readers, bump to `splitbill.v2` and either migrate or discard the old payload at REHYDRATE. The legacy `taxIncluded` migration in core (lines 156–161) is the template.
- **Storage size limits.** AsyncStorage on Android has a per-key default of 6 MB; our payload is ~1-2 KB. iOS has no practical limit on SQLite-backed AsyncStorage. Not a concern at current scale.
- **iCloud / cross-device sync.** Out of scope. If a user wants the same bill on iPhone + iPad, they re-snap. Adding iCloud KVS or a backend store is a v2 nicety not in plan.md.
- **Edit conflict with the "Pan disabled while editing" gate.** If the user starts editing on a row, then the gesture handler is rebuilt with `.enabled(false)`, then they background the app and return — the keyboard might already be dismissed but `editing` state is still `"name"`. The gesture stays disabled. Recovery: tap anywhere on the row to commit-and-close via the blur path. Acceptable. Document the recovery in `doc/mobile.md` if a tester reports confusion.
- **`Alert.alert` on Expo web.** RN Web's Alert implementation in Expo SDK 56 renders as a browser `confirm()` dialog (or a custom modal — Expo's behaviour varies by version). The reset-confirm e2e leg may need to be skipped on web if `confirm()` blocks the JS thread in a way Playwright doesn't expect. Fallback: cover reset-confirm via jest on the mobile side only. Decide during M6.10.
- **Splash icon mismatch.** Step M6.9 wires the auto-hide gate but doesn't customise the splash visual — it uses Expo's default (the `icon.png`). M7 ships the designed splash + the matching icon together.
