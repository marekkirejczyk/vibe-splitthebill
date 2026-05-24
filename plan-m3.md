# React Native migration — Phase 3 (M3, static screens)

## Context

M1 turned the repo into a pnpm workspace and extracted `@splitbill/core` (verified at `c0d49c8`). M2 stood up `apps/mobile` as an Expo SDK 56 app and proved Metro can resolve the core package across workspaces via `theme` + `computeTotals` rendered on a smoke screen (verified at `15f3b39`). The mobile app currently boots a single placeholder route (`apps/mobile/app/index.tsx`) — a color palette + sample totals dump.

M3 replaces that smoke screen with the **full visual surface of the mobile app**, rendered against a hardcoded mock `Bill` fixture and driven by the same `@splitbill/core` reducer the web app uses. No camera, no API call, no real swipe gesture, no persistence. The deliverable is: a designer or PM running `pnpm --filter @splitbill/mobile ios` sees Start → "load receipt" → Loading → Bill Review with all sections, sticky totals footer, inclusive toggles, and an Error fallback path — pixel-aligned with the Figma file and using the exact same totals math as the web.

Practically, M3 is the milestone where the **screens-as-components** land in `apps/mobile/src/components/`, the **phase-machine host** in `app/index.tsx` mirrors `apps/web/src/app/page.tsx`, and the **mobile test harness** (jest-expo + `@testing-library/react-native`) is set up so the screens have a regression guard before M5 adds gestures.

After M3, the next two milestones connect the static surface to real inputs and outputs: M4 wires the image picker + the hosted `/api/extract` POST; M5 swaps the tap-to-cycle row for the Reanimated `Gesture.Pan` swipe with haptics; M6 adds inline edit, `AsyncStorage` persistence, and the "New bill" confirm flow.

## Decisions baked in

- **Single Expo Router route.** `app/index.tsx` stays the only route and hosts a `phase` state machine (`idle | loading | error`) just like `apps/web/src/app/page.tsx` lines 12–17. No stack navigation in M3 — the screen swap is internal. Adding routes later (e.g. a modal `edit` route in M6) is cheap from this baseline.
- **Tap-to-cycle replaces swipe.** The M3 `SwipeableRow` is a `Pressable` that dispatches `SWIPE` with a synthetic direction computed from current assignee, walking `null → you → them → null`. The full Reanimated Pan + underlay + haptic implementation is M5 — the row's *public props* (`item`, `onSwipe`, `onEditName`, `onEditPrice`) are designed in M3 to match what M5 needs so the component can be replaced with no caller changes.
- **Mock fixture in lieu of camera + API.** A `mockBill` constant lives in `apps/mobile/src/fixtures/mockBill.ts` and `StartScreen`'s "Take photo" / "Choose from library" CTAs both dispatch `LOAD_RECEIPT` against it after a fake 700 ms latency (sets `phase = "loading"` first so the LoadingScreen is reachable). A dev-only "Show error" CTA on Start triggers `phase = "error"` so ErrorScreen is reachable without forcing a failure.
- **In-memory state only.** The mobile `useBillStore` hook wraps the core `reducer` + `initialState` but skips the `StorageAdapter` plumbing — bill state survives a hot reload but resets on a full restart. AsyncStorage lands in M6.
- **No inline edit yet.** Item rows show name + price but the tap surface only cycles assignment. Tapping a name or price has no edit affordance; that's M6. The component shape leaves room for `onEditName` / `onEditPrice` callbacks so M6 doesn't have to refactor.
- **Static section grouping, no layout animation.** Items are bucketed into Unassigned / You / Them sections at render time. The framer-motion `layoutId` cross-section morph that web does is intentionally skipped in M3 — Reanimated `Layout.springify()` lands as polish in M7. M3 just re-renders.
- **Figma source of truth.** Two mobile Figma files exist today: the M2-created stub at `yDOs60DEcPKCIvBEbMPtRD` (variables + empty frames, recorded in `doc/spec.md`) and the fully-designed file at `pRf4fWtfr9n3P4z8Eh6BzR` (5 screens + 6 interaction states + variables, built during the planning session). M3 designs against the *designed* file. Step M3.0 reconciles which file is canonical — recommendation: pull the designed frames into the M2 file so the linked URL in `doc/spec.md` stays stable, then update the recorded `fileKey` only if it changes.
- **Test harness uses jest-expo, not vitest.** Vitest doesn't speak the RN module graph (`react-native`, `react-native-reanimated` mocks, etc.). The `pnpm -r test` script runs core's vitest and mobile's jest in the same root command; jest-expo's preset handles RN transforms.

## M3 — Static screens

### Step M3.0 — Reconcile the two Figma files (one-time, before code)

Decide canonical file. Recommended: keep `yDOs60DEcPKCIvBEbMPtRD` as the link in `doc/spec.md`, and use the Figma MCP to copy the fully-designed frames (`Start`, `Loading`, `Error`, `Permission denied`, `Bill review`, plus the six interaction-state details) from `pRf4fWtfr9n3P4z8Eh6BzR` into it. Concretely:

1. `whoami` to confirm Figma auth.
2. `get_metadata` on the source file (`pRf4fWtfr9n3P4z8Eh6BzR`) to enumerate frame node IDs.
3. `use_figma` against the destination file (`yDOs60DEcPKCIvBEbMPtRD`) to recreate each frame (the Figma plugin API doesn't cross files; rebuild via the JS code captured in the planning session — already in conversation history, can be re-run almost verbatim against the destination file key).
4. `get_screenshot` per destination frame to confirm parity.
5. Delete the stub `pRf4fWtfr9n3P4z8Eh6BzR` file or keep it as an archive — either way, *only* `yDOs60DEcPKCIvBEbMPtRD` is referenced from code.

If preferred instead: update `doc/spec.md` line 300 to point at `pRf4fWtfr9n3P4z8Eh6BzR` and stop maintaining the M2 file. The M3 component implementations don't care which file is canonical — they're driven by the design tokens in `theme.ts`, not by Figma node IDs.

### Step M3.1 — Mobile test harness

```
pnpm --filter @splitbill/mobile add -D jest jest-expo @testing-library/react-native @testing-library/jest-native @types/jest
```

- `apps/mobile/jest.config.js`: `{ preset: "jest-expo", setupFilesAfterEach: ["@testing-library/jest-native/extend-expect"], transformIgnorePatterns: ["node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|@react-native-async-storage/.*|react-native-reanimated|react-native-gesture-handler|expo-linear-gradient|expo-haptics)/)"] }`.
- `apps/mobile/jest.setup.ts`: `import "react-native-gesture-handler/jestSetup"; jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"))`.
- Replace the no-op `test` script in `apps/mobile/package.json` with `"test": "jest"`.
- Add `apps/mobile/__tests__/smoke.test.tsx`: renders `<View><Text>ok</Text></View>` from `react-native` and asserts it. Verifies the harness loads cleanly before any real component is on the line.

### Step M3.2 — Mock fixture + in-memory `useBillStore` hook

- `apps/mobile/src/fixtures/mockBill.ts`: exports `mockReceipt: ExtractedReceipt` shaped like a synthetic restaurant bill (≈8 line items mixed across `item`/`tax`/`tip`, mixed assignees once converted by `billFromReceipt`, one `inclusive` flag interesting, `$` currency). Also exports `delayedExtract(): Promise<ExtractedReceipt>` that resolves after 700 ms — used by the Start CTA to fake the network round-trip so LoadingScreen is reachable.
- `apps/mobile/src/hooks/useBillStore.ts`: thin wrapper around `useReducer(reducer, initialState)` from `@splitbill/core`. Signature `() => [State, Dispatch<Action>]`. No `StorageAdapter`, no `useEffect`, no `hydrated` flag. The M6 version replaces this file with the AsyncStorage-backed implementation; the M3 callers are untouched because the hook signature is the same.

### Step M3.3 — Atom components (shared across screens)

Under `apps/mobile/src/components/`:

- `PrimaryButton.tsx`: gradient pill (`expo-linear-gradient` from `theme.gradient.start → theme.gradient.end`), 56 pt high, bold white label, `shadow.cta`. Props: `{ label: string; icon?: ReactNode; onPress: () => void; disabled?: boolean }`.
- `SecondaryButton.tsx`: white pill with `theme.color.border` 1 pt stroke, semibold text. Same props as PrimaryButton.
- `Chip.tsx`: section header chip. Props: `{ label: string; count: number; total?: string; tone: "neutral" | "you" | "them" }`. Reads colors from theme (`muted` for neutral, `you` + `youFaint` for you, `them` + `themFaint` for them).
- `InclusiveToggleRow.tsx`: white card with rounded border, label on left, value + `Switch` on right. Props: `{ label: string; value: string; on: boolean; onValueChange: (v: boolean) => void }`. The RN `Switch` `trackColor` uses `assignBorder` (on) and `border` (off) so it visually matches the assigned-row tint.

Each atom ships a colocated `.test.tsx` rendering snapshot or asserting prop-driven visual states (disabled greys out, tone changes chip color, switch on/off swaps tint).

### Step M3.4 — Phase-machine host

Rewrite `apps/mobile/app/index.tsx` to mirror `apps/web/src/app/page.tsx`:

```ts
type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

export default function Index() {
  const [state, dispatch] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const loadMock = async () => {
    setPhase({ kind: "loading" });
    try {
      const receipt = await delayedExtract();
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  };

  if (phase.kind === "loading") return <LoadingScreen onCancel={() => setPhase({ kind: "idle" })} />;
  if (phase.kind === "error") return <ErrorScreen message={phase.message} onRetry={loadMock} onStartOver={() => setPhase({ kind: "idle" })} />;
  if (state.bill) return <BillReview bill={state.bill} dispatch={dispatch} onReset={() => dispatch({ type: "RESET" })} />;
  return <StartScreen onTakePhoto={loadMock} onChooseLibrary={loadMock} onSimulateError={() => setPhase({ kind: "error", message: "Mock error for design review" })} />;
}
```

The `onSimulateError` prop is a dev hatch — a small text link at the bottom of `StartScreen` so designers can reach ErrorScreen without forcing a failure. Stripped in M4 when the real picker lands.

### Step M3.5 — `StartScreen.tsx`

`<SafeAreaView>` with a gradient blob (decorative absolute-positioned `<View>` with `LinearGradient` masked by `borderRadius`), receipt card (white box with shadow + 🧾 emoji or `<Image source={require("../../assets/icon.png")}>`), big bold title, muted subtitle, flex spacer, `<PrimaryButton label="Take photo" />`, `<SecondaryButton label="Choose from library" />`, privacy disclosure text. Optional `<Pressable onPress={onSimulateError}><Text>Show error state</Text></Pressable>` at the very bottom (dev-only, removed M4). Matches the Figma `Start` frame.

### Step M3.6 — `LoadingScreen.tsx`

`<SafeAreaView>` with a `SkeletonReceipt` sub-component (6 gray rounded `<View>`s of varying widths inside a white card with `shadow.card`), a Reanimated-driven `ActivityIndicator` or animated arc (`expo-linear-gradient` over a 56 pt ellipse with `transform: [{ rotate: spin.value }]`), heading "Reading your receipt…", muted subtitle "Claude is identifying items and prices.", flex spacer, ghost `<Pressable>` "Cancel" calling `onCancel`. The spin animation is `withRepeat(withTiming(360, { duration: 1200 }), -1)` — small enough that it's not deferred.

### Step M3.7 — `ErrorScreen.tsx`

`<SafeAreaView>` with a yellow rounded warn card containing a ⚠️ emoji, bold heading ("Hmm, we hit a snag"), the `message` prop rendered as body text, flex spacer, `<PrimaryButton label="Try again" onPress={onRetry} />`, `<SecondaryButton label="Pick a different photo" onPress={onStartOver} />`. Matches the Figma `Error` frame.

### Step M3.8 — `SwipeableRow.tsx` (M3 placeholder)

```ts
type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  onEditName?: (name: string) => void;    // M6
  onEditPrice?: (price: number) => void;  // M6
};
```

Implementation in M3: `<Pressable onPress={() => onSwipe(cycleDirection(item.assignee))}>` wrapping a row View with name (left) + price (right). `cycleDirection` is a local pure function:

```ts
const cycleDirection = (a: Assignee): "left" | "right" =>
  a === null ? "left" : a === "you" ? "right" : "right";
// null → "left" hits nextAssignee(null,"left") = "you"
// you  → "right" hits nextAssignee("you","right") = "them"
// them → "right" hits nextAssignee("them","right") = null
```

Background fill flips between `theme.color.card` and `theme.color.assignBg` based on `item.assignee !== null`; border matches. Row height 56, radius `theme.radius.lg`, padding 16. Tests assert (a) initial render shows correct fill per assignee, (b) tap fires `onSwipe` with the right direction for each starting state.

M5 swaps the `Pressable` for `<GestureDetector gesture={Gesture.Pan()...}>` + `Animated.View` and adds the haptic + underlay layer. The `Props` contract stays.

### Step M3.9 — `BillReview.tsx` + `Totals.tsx`

`BillReview.tsx`:
- `<SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>` with `edges={["top"]}` (bottom edge is handled by Totals).
- Top bar: title "Split the bill" on the left, `<SecondaryButton label="↻ New bill" small onPress={onReset} />` on the right.
- `<ScrollView contentContainerStyle={{ paddingBottom: FOOTER_HEIGHT + insets.bottom }}>`:
  - "CHARGES ALREADY IN PRICES" caption (only rendered if any of `bill.extras.tax|tip|service` > 0).
  - One `<InclusiveToggleRow>` per non-zero extra, wired to `dispatch({ type: "SET_INCLUSIVE", kind, value })`.
  - Three sections (Unassigned / You / Them): each is a `<Chip>` + a `<View>` containing the bucket's `<SwipeableRow>`s. Bucket items by filtering `bill.items` in render — no memoization needed at M3 scale.
  - Sections render in the order Unassigned → You → Them so visual scanning matches the web.

`Totals.tsx`:
- Absolutely positioned at the bottom of the screen (`position: "absolute", bottom: 0, left: 0, right: 0`).
- `paddingBottom = insets.bottom + theme.spacing.lg` via `useSafeAreaInsets()`.
- White background with negative-Y `shadow.card`.
- Gradient hairline at the top edge (1.5 pt `LinearGradient` from `theme.gradient.start → end`, absolute-positioned at `top: 0`).
- Warn pill (yellow card with ⚠️ + "$X.XX still unassigned") rendered only when `totals.unassigned > 0`.
- Two columns: "You" (label muted, money in `theme.color.you`, left-aligned) and "Them" (label muted, money in `theme.color.them`, right-aligned). Layout via `flexDirection: "row", justifyContent: "space-between"`.
- All numbers formatted via `formatMoney(totals.you, bill.currency)` from `@splitbill/core`.

The single `computeTotals(bill)` call lives in `BillReview` and is passed to `Totals` as a prop (no context, no second call). Memoized via `useMemo` keyed on `bill`.

Tests:
- `BillReview.test.tsx`: render against `mockBill`, assert (a) section item counts match expected buckets, (b) tapping a Caesar salad row in Unassigned section dispatches a `SWIPE` action that moves it to You, (c) toggling the "Tax already in prices" switch zeroes the tax contribution in the visible totals.
- `Totals.test.tsx`: given a known totals object, assert money strings + warn pill visibility logic.

### Step M3.10 — Smoke verification

Manual on iOS simulator + Android emulator:

```
pnpm --filter @splitbill/mobile ios
# Tap "Take photo" → spinner appears for ~700ms → bill loads
# Tap an unassigned row → moves to You section, totals update
# Tap the same row again → moves to Them section
# Tap once more → back to Unassigned
# Toggle "Tax already in prices" → You + Them totals drop by their tax share
# Tap "↻ New bill" → returns to Start
# Tap dev-only "Show error" link on Start → ErrorScreen renders → "Try again" loops back through Loading
```

Then `pnpm --filter @splitbill/mobile android` for the same flow. Pay attention to:
- Safe-area handling on a notched device (status bar doesn't overlap top bar, home indicator doesn't overlap Totals footer).
- The gradient hairline renders as a hairline, not a band.
- Switch animations feel native (use the platform default, no custom styling beyond `trackColor`).

### Step M3.11 — Verify M3 (automated)

```
pnpm -r lint
pnpm -r test                                              # core (67) + mobile (~10-15 new component tests)
pnpm --filter web build                                   # web still builds
pnpm --filter @splitbill/mobile start --no-dev --minify   # production-style bundle compiles
pnpm --filter @splitbill/mobile ios                       # manual smoke (see step M3.10)
```

CI's existing `pnpm -r test` step now picks up the mobile suite automatically. No `.github/workflows/ci.yml` edits needed.

## Critical files modified or created

- `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.ts` (new — test harness)
- `apps/mobile/__tests__/smoke.test.tsx` (new — sanity check)
- `apps/mobile/package.json` (`devDependencies` += jest stack, `scripts.test` becomes `jest`)
- `apps/mobile/src/fixtures/mockBill.ts` (new)
- `apps/mobile/src/hooks/useBillStore.ts` (new — in-memory M3 version)
- `apps/mobile/src/components/PrimaryButton.tsx` (+ test)
- `apps/mobile/src/components/SecondaryButton.tsx` (+ test)
- `apps/mobile/src/components/Chip.tsx` (+ test)
- `apps/mobile/src/components/InclusiveToggleRow.tsx` (+ test)
- `apps/mobile/src/components/SwipeableRow.tsx` (+ test — tap-to-cycle, real Pan deferred to M5)
- `apps/mobile/src/components/StartScreen.tsx`
- `apps/mobile/src/components/LoadingScreen.tsx`
- `apps/mobile/src/components/ErrorScreen.tsx`
- `apps/mobile/src/components/BillReview.tsx` (+ test)
- `apps/mobile/src/components/Totals.tsx` (+ test)
- `apps/mobile/app/index.tsx` (rewrite — phase-machine host replaces M2 smoke)
- `doc/spec.md` (optional: append M3 status note under §3.5)

**Reused as-is from `@splitbill/core`:** `reducer`, `initialState`, `Action`, `State`, `Assignee`, `Item`, `Bill`, `ExtractedReceipt`, `InclusiveFlags`, `nextAssignee`, `billFromReceipt`, `computeTotals`, `formatMoney`, `theme`. No core changes in M3.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core untouched | `pnpm --filter @splitbill/core test` | 67 unit tests still green; M3 is additive only. |
| Mobile tests pass | `pnpm --filter @splitbill/mobile test` | Atom components render correctly across states; `BillReview` dispatches the right actions on row tap and toggle change; `Totals` formats money + shows the warn pill conditionally. |
| Mobile bundle compiles | `pnpm --filter @splitbill/mobile start --no-dev --minify` | Production-style Hermes bundle builds without TS or RN-import errors. |
| iOS smoke | `pnpm --filter @splitbill/mobile ios` + the M3.10 click-through | Visual parity with the Figma `Start` / `Loading` / `Error` / `Bill review` frames on a notched device. |
| Android smoke | `pnpm --filter @splitbill/mobile android` | Same click-through; Switch and shadow rendering look native; safe-area insets correct. |
| Web hasn't regressed | `pnpm --filter web build && pnpm --filter web test` | Next.js bundle + route test both green. |
| CI is green | Push, watch the workflow | `pnpm -r test` now runs the mobile suite alongside core + web; Vercel preview still deploys against `apps/web`. |

## Risks and follow-ups (deferred to later milestones)

- **Real swipe gesture (M5).** `SwipeableRow`'s `Pressable` wrapper is replaced with `GestureDetector` + `Gesture.Pan()` + Reanimated `useSharedValue`/`useAnimatedStyle`. Adds `expo-haptics` impact-medium on commit. Public props don't change.
- **Camera + API (M4).** `StartScreen`'s `onTakePhoto` / `onChooseLibrary` callbacks switch from `delayedExtract()` to `expo-image-picker` → `expo-image-manipulator` (using `computeResizeTarget` from `@splitbill/core`) → multipart `fetch` against `${extra.apiBaseUrl}/api/extract`. The dev-only "Show error" link gets removed. `mockBill.ts` stays as a test fixture.
- **AsyncStorage persistence (M6).** `useBillStore` swaps in `@react-native-async-storage/async-storage` behind the existing `StorageAdapter` interface from `@splitbill/core`. Add a `hydrated` flag exactly like web's hook so the first render after a fresh launch doesn't flash an empty state.
- **Inline edit (M6).** `SwipeableRow` gains `TextInput` swap-in on press inside name/price regions (separate from the row-level tap that cycles in M3). M3 leaves the `onEditName` / `onEditPrice` props in place but unwired so the M6 patch is minimal.
- **Layout animation between sections (M7).** Reanimated `Layout.springify()` on each `<SwipeableRow>` to soften the position change when an item moves buckets. Visual nicety, not behaviour — safely deferred.
- **Cross-section shared-element morph.** The framer-motion `layoutId` magic on web is genuinely hard to reproduce in RN. M7 accepts a fade-out + fade-in delta; full shared-element transitions are an explicit non-goal.
- **Accessibility passes (M7).** `accessibilityLabel`, `accessibilityRole="button"`, swipe-row VoiceOver hint, Switch on/off announcement. Stubbed-in via component-level `accessibilityLabel` props during M3 so M7 only has to fill the strings.
- **Backend auth (M4).** Mobile still calls an unauthenticated `/api/extract`. A shared-secret header lands before TestFlight / Play internal. Not blocking M3 — local development can hit the deployed endpoint as-is.
- **Figma file reconciliation.** If step M3.0 isn't done, designers and engineers might point at different files. Easy to resolve early, ugly to resolve once feedback is flying — recommend doing M3.0 *first*, before any component code.
