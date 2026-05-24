# React Native migration — Phase 5 (M5, SwipeableRow gestures)

## Context

M1 turned the repo into a pnpm workspace and extracted `@splitbill/core`. M2 stood up `apps/mobile` as an Expo SDK 56 app with the design tokens module wired across the workspace. M3 replaced the M2 smoke screen with the full visual surface, driven by a hardcoded `mockReceipt` and a tap-to-cycle `Pressable` standing in for the real swipe affordance. M4 replaced the mock seam with the real `expo-image-picker` → `expo-image-manipulator` → multipart `fetch` pipeline against the hosted `/api/extract`, plus `Alert.alert` confirm on cancel, permission-denied Alert with `Linking.openSettings()` deep link, and a success haptic on bill arrival (merged at `db46d91`).

M5 replaces the M3 tap-to-cycle `Pressable` inside `SwipeableRow` with the **gesture-driven swipe**: `react-native-gesture-handler`'s `Gesture.Pan()` composed with Reanimated v4 shared values for the translate animation, an underlay layer that fades in behind the row to preview what will happen on commit, and `Haptics.impactAsync(Medium)` on each successful swipe. The 70 px commit threshold, ±160 px drag clamp, and `nextAssignee` state machine are the same as the web app (`apps/web/src/components/SwipeableRow.tsx` lines 12–44, 83–92) — only the chrome and platform primitives are different.

After M5, the visible feature set on mobile matches web's first-tier interactions: capture → assign by swipe → totals with proration. M6 layers `TextInput` inline edit, `KeyboardAvoidingView`, `AsyncStorage` persistence, the inclusive `Switch` (already in M3), and the "New bill" `Alert.alert` confirm. M7 then handles section-change animation (`Layout.springify()`), accessibility actions for VoiceOver / TalkBack swipe equivalents, the splash screen, the app icon, and safe-area polish across every screen. The M5-introduced VoiceOver regression (no swipe equivalent for accessibility users — `M3` provided one via tap-to-cycle, `M5` removes the tap surface) is **acknowledged** and explicitly tracked as the highest-priority item inside M7.

## Decisions baked in

- **Tap-to-cycle is removed.** The M3 `Pressable` wrapper goes away entirely. The whole row becomes a `<GestureDetector gesture={pan}><Animated.View>...</Animated.View></GestureDetector>`. Tapping the row does nothing in M5 (M6 adds the inline-edit tap surface on the name + price children, scoped to those text regions only). VoiceOver / TalkBack users lose the cycle affordance for one milestone — M7's accessibility pass lands `accessibilityActions={[{name:"assignYou"}, {name:"assignThem"}, {name:"unassign"}]}` filtered by current assignee, with `onAccessibilityAction` dispatching the right `SWIPE` direction.
- **Gesture composition: Pan only.** No `Gesture.Tap()` racing alongside. The pan's `.activeOffsetX([-10, 10])` already prevents short touches from being interpreted as drags; with no tap handler on the row body, a short touch is a true no-op. This matches web's web-export `framer-motion` behavior (web users don't get tap-cycling either — they drag).
- **Gesture composes cleanly with the parent `ScrollView`.** `Gesture.Pan().failOffsetY([-12, 12])` lets the scroll handler win when vertical movement exceeds 12 px before horizontal exceeds 10 px. The `<GestureHandlerRootView>` is already at the app root from M2 (`apps/mobile/app/_layout.tsx`); no additional plumbing is needed. No `simultaneousHandlers` ref dance is required for v2 of gesture-handler — the `activeOffsetX` / `failOffsetY` pair is the canonical pattern.
- **Underlay = two stacked `Animated.View`s, not blended.** One layer per direction. Each is `position: "absolute", inset: 0`, with its background color and label text pre-computed from `nextAssignee(current, dir)` outside the worklet, and its opacity bound to `tx.value` via `useAnimatedStyle`. The layer visible at any moment is the one matching the sign of `tx.value`. Blending colors in a worklet is doable but adds branchy interpolation math for no UX gain — two layers are cheaper to read and faithful to web's mental model (web shows one underlay at a time too).
- **Underlay labels match web verbatim.** `target === null → "Unassign"`, `target === "you" → "→ You"`, `target === "them" → "Them ←"`. Arrow placement intentionally mirrors `apps/web/src/components/SwipeableRow.tsx` lines 36–43 so designers reviewing the Figma file see the same strings on both platforms.
- **Spring constants match web verbatim.** `withSpring(0, { stiffness: 320, damping: 32 })` is the snap-back. Drag clamp: ±160 px. Commit threshold: 70 px. Pulled straight from the web's framer-motion config + the gesture spec in `plan.md` lines 113–127. Underlay opacity ramps from 0 to 1 over the threshold (0–70 px), then stays at 1 past the commit point so the user can see "ready to commit" feedback before letting go.
- **Haptic = medium impact, on commit only.** `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` fires inside `.onEnd` when `|translationX| > 70`, via `runOnJS`. Not on each frame, not on cancel-below-threshold, not on the snap-back. iOS-only behavior visible on physical devices; Android emulator runs the JS but the Taptic Engine equivalent (vibrate pattern) is OS-defined.
- **Tests use `fireGestureHandler` from `react-native-gesture-handler/jest-utils`.** This is the gesture-handler-blessed pattern for driving `Gesture.Pan` callbacks under jest without a real touch system. Available in 2.31.x (verified at `node_modules/react-native-gesture-handler/jest-utils/`). Test pattern: assign a `withTestId("row-{id}-pan")` to the gesture, query it with `getByGestureTestId`, fire a synthetic `BEGAN → ACTIVE(translationX) → END(translationX)` sequence, assert the `onSwipe` / `Haptics.impactAsync` mocks were called.
- **Playwright e2e moves from `.click()` to `page.mouse` drag.** `gesture-handler`'s web implementation supports mouse-driven pan, so the existing smoke can simulate a swipe with `page.mouse.move(x1, y1); mouse.down(); mouse.move(x1 - 120, y1); mouse.up()`. The e2e remains the canonical "phase machine still works end-to-end" guard; M5 just adopts the production gesture pattern. If the web build's gesture pipeline turns out to be flakier under Playwright than expected, the fallback is to set `e.test-only` data attributes that `fireEvent.click` against — but that's only if the mouse drag isn't reliable.
- **No section-change animation.** `Layout.springify()` on each `<SwipeableRow>` to soften bucket transitions is M7 polish. M5 lands the gesture only; the row re-renders into its new section abruptly, same as M3.
- **No `tx.set(0)` race fix.** Web has a `draggedRef` to suppress `onTap` after a drag (`apps/web/src/components/SwipeableRow.tsx` lines 60, 90–92). Mobile doesn't need it because there's no competing tap handler in M5. M6 will reintroduce the equivalent guard for the inline-edit tap once tap surfaces exist on the name + price children.

## M5 — SwipeableRow gestures

### Step M5.0 — Confirm dependency state (no install needed)

`react-native-reanimated@~4.3.1`, `react-native-gesture-handler@~2.31.2`, `expo-haptics@~56.0.3` are already pinned in `apps/mobile/package.json` (M2 step M2.3). Confirm with:

```
pnpm --filter @splitbill/mobile ls react-native-reanimated react-native-gesture-handler expo-haptics
```

If any are missing, reinstall pinned. `babel.config.js` already lists `react-native-reanimated/plugin` last (M2 step M2.4); `app/_layout.tsx` already wraps in `<GestureHandlerRootView>`; `jest.setup.ts` already imports `react-native-gesture-handler/jestSetup` and mocks Reanimated via `react-native-reanimated/mock`. No build-config changes land in M5.

### Step M5.1 — Pure descriptors for the underlay (testable in isolation)

`apps/mobile/src/components/swipeDescriptor.ts` (new). Two small pure helpers that map `(current, direction)` to `{ label, color }`:

```ts
import { nextAssignee, type Assignee, theme } from "@splitbill/core";

export type SwipeDescriptor = {
  label: string;            // "→ You" | "Them ←" | "Unassign"
  color: string;            // theme.color.action | theme.color.warn
  target: Assignee;         // for tests + a11y in M7
};

function labelFor(target: Assignee): string {
  if (target === null) return "Unassign";
  return target === "you" ? "→ You" : "Them ←";
}

export function swipeDescriptor(
  current: Assignee,
  direction: "left" | "right",
): SwipeDescriptor {
  const target = nextAssignee(current, direction);
  return {
    label: labelFor(target),
    color: target === null ? theme.color.warn : theme.color.action,
    target,
  };
}
```

Colocated `swipeDescriptor.test.ts` exercises all six `(current, direction)` cells of the `nextAssignee` matrix — null+left, null+right, you+left, you+right, them+left, them+right — asserting label + color + target. Pure, fast, no RN imports. ~10 lines of test code.

### Step M5.2 — Rewrite `SwipeableRow.tsx` for gesture

`apps/mobile/src/components/SwipeableRow.tsx` (rewrite). Shape:

```ts
import {
  formatMoney,
  theme,
  type Item,
} from "@splitbill/core";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { swipeDescriptor } from "./swipeDescriptor";

const THRESHOLD = 70;
const CLAMP = 160;
const SPRING = { stiffness: 320, damping: 32 };

type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  onEditName?: (name: string) => void;  // wired in M6
  onEditPrice?: (price: number) => void; // wired in M6
  testID?: string;
};

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function fireHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function SwipeableRow({ item, currency, onSwipe, testID }: Props) {
  const tx = useSharedValue(0);

  // Pre-compute the two underlay descriptors outside the worklet — they
  // depend on item.assignee, which the worklet shouldn't snapshot.
  const leftDir = useMemo(
    () => swipeDescriptor(item.assignee, "left"),
    [item.assignee],
  );
  const rightDir = useMemo(
    () => swipeDescriptor(item.assignee, "right"),
    [item.assignee],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .withTestId(`${testID ?? "row"}-pan`)
    .onUpdate((e) => {
      tx.value = clamp(e.translationX, -CLAMP, CLAMP);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > THRESHOLD) {
        const dir = e.translationX < 0 ? "left" : "right";
        runOnJS(onSwipe)(dir);
        runOnJS(fireHaptic)();
      }
      tx.value = withSpring(0, SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  // Left-positioned underlay shows when dragging RIGHT (tx > 0): describes
  // what a commit-right would do. Right-positioned underlay shows when
  // dragging LEFT (tx < 0). Opacity ramps 0→1 over [0, THRESHOLD] then holds.
  const leftLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value > 0 ? Math.min(tx.value / THRESHOLD, 1) : 0,
  }));
  const rightLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value < 0 ? Math.min(-tx.value / THRESHOLD, 1) : 0,
  }));

  const assigned = item.assignee !== null;

  return (
    <View style={styles.wrap} testID={testID}>
      {/* Underlay for a RIGHT-swipe commit (label on left, visible when dragging right). */}
      <Animated.View
        style={[styles.underlay, styles.underlayLeft, { backgroundColor: rightDir.color }, leftLabelStyle]}
        pointerEvents="none"
      >
        <Text style={styles.underlayLabel}>{rightDir.label}</Text>
      </Animated.View>
      {/* Underlay for a LEFT-swipe commit (label on right, visible when dragging left). */}
      <Animated.View
        style={[styles.underlay, styles.underlayRight, { backgroundColor: leftDir.color }, rightLabelStyle]}
        pointerEvents="none"
      >
        <Text style={styles.underlayLabel}>{leftDir.label}</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${formatMoney(item.price, currency)}, ${item.assignee ?? "unassigned"}`}
          style={[
            styles.row,
            assigned ? styles.assignedRow : styles.unassignedRow,
            rowStyle,
          ]}
        >
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <View style={styles.spacer} />
          <Text style={styles.price}>{formatMoney(item.price, currency)}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  underlay: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: theme.radius.lg,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  underlayLeft: { alignItems: "flex-start" },
  underlayRight: { alignItems: "flex-end" },
  underlayLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  unassignedRow: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.border,
  },
  assignedRow: {
    backgroundColor: theme.color.assignBg,
    borderColor: theme.color.assignBorder,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.color.text,
    flexShrink: 1,
  },
  spacer: { flex: 1 },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.color.text,
    fontVariant: ["tabular-nums"],
  },
});
```

The old `cycleDirection` export is deleted. Public props stay the same as M3 (`item`, `currency`, `onSwipe`, optional `onEditName`/`onEditPrice`, `testID`) so `BillReview.tsx` doesn't need editing.

### Step M5.3 — Replace `SwipeableRow.test.tsx`

`apps/mobile/src/components/SwipeableRow.test.tsx` is rewritten. The three `cycleDirection` tests go away (the export is gone). The render + tap tests are replaced with gesture-driven equivalents. New shape:

```ts
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import type { PanGesture } from "react-native-gesture-handler";
import { State } from "react-native-gesture-handler";
import { render, screen } from "@testing-library/react-native";
import type { Item } from "@splitbill/core";
import * as Haptics from "expo-haptics";
import { SwipeableRow } from "./SwipeableRow";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

const item = (overrides: Partial<Item> = {}): Item => ({
  id: "i1",
  name: "Margherita pizza",
  price: 14,
  assignee: null,
  ...overrides,
});

beforeEach(() => {
  (Haptics.impactAsync as jest.Mock).mockClear();
});

test("renders item name and money-formatted price", () => {
  render(<SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />);
  expect(screen.getByText("Margherita pizza")).toBeTruthy();
  expect(screen.getByText("$14.00")).toBeTruthy();
});

test("swipe past threshold (-80 px) commits left and fires haptic", () => {
  const onSwipe = jest.fn();
  render(<SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />);
  fireGestureHandler<PanGesture>(getByGestureTestId("row-pan"), [
    { state: State.BEGAN,  translationX: 0 },
    { state: State.ACTIVE, translationX: -80 },
    { state: State.END,    translationX: -80 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("left");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

test("swipe past threshold (+80 px) commits right", () => {
  const onSwipe = jest.fn();
  render(<SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />);
  fireGestureHandler<PanGesture>(getByGestureTestId("row-pan"), [
    { state: State.BEGAN,  translationX: 0 },
    { state: State.ACTIVE, translationX: 80 },
    { state: State.END,    translationX: 80 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
});

test("swipe below threshold (40 px) does NOT commit; no haptic", () => {
  const onSwipe = jest.fn();
  render(<SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />);
  fireGestureHandler<PanGesture>(getByGestureTestId("row-pan"), [
    { state: State.BEGAN,  translationX: 0 },
    { state: State.ACTIVE, translationX: 40 },
    { state: State.END,    translationX: 40 },
  ]);
  expect(onSwipe).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});

test("you-state swipe right commits 'right' (→ them); haptic fires", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item({ assignee: "you" })} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireGestureHandler<PanGesture>(getByGestureTestId("row-pan"), [
    { state: State.BEGAN,  translationX: 0 },
    { state: State.ACTIVE, translationX: 100 },
    { state: State.END,    translationX: 100 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

test("them-state swipe right commits 'right' (→ unassigned); haptic fires", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item({ assignee: "them" })} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireGestureHandler<PanGesture>(getByGestureTestId("row-pan"), [
    { state: State.BEGAN,  translationX: 0 },
    { state: State.ACTIVE, translationX: 100 },
    { state: State.END,    translationX: 100 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
});
```

Six cases, ~80 lines. The `runOnJS` calls in the gesture body run synchronously under the Reanimated mock, so the assertions can be made immediately after `fireGestureHandler` returns. No `waitFor`.

### Step M5.4 — `BillReview.tsx` integration

`BillReview.tsx` passes the same `onSwipe={(direction) => dispatch({ type: "SWIPE", id: item.id, direction })}` prop to every row. **No changes needed in `BillReview.tsx`** — the M5 SwipeableRow's public contract is unchanged. The existing `BillReview.test.tsx` cases (M3, four tests covering load / tap-assign / inclusive toggle / reset) need their "tap-assign" test rewritten to use `fireGestureHandler` against the row's gesture handler, the same way the SwipeableRow tests do. Pattern:

```ts
test("swiping an unassigned row right moves it into the Them section", () => {
  // ...render BillReview against mockBill...
  const firstUnassigned = mockBill.items.find((it) => it.assignee === null)!;
  fireGestureHandler<PanGesture>(getByGestureTestId(`row-${firstUnassigned.id}-pan`), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: 100 },
    { state: State.END, translationX: 100 },
  ]);
  // existing dispatch-spy assertion stays the same — direction flips from "left" (M3) to "right" (M5).
});
```

Only the test patch is needed; the production component is untouched.

### Step M5.5 — Playwright e2e: mouse-drag swipe

`apps/mobile/e2e/smoke.spec.ts` currently `.click()`s a row to assign it (lines 36, 45 in the merged file). M5 replaces those with mouse-drag pans against the same row. Replacement pattern (one helper at the top of the file, four callsites updated):

```ts
async function swipeRow(page: Page, locator: Locator, direction: "left" | "right") {
  const box = await locator.boundingBox();
  if (!box) throw new Error("row has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + (direction === "left" ? -120 : 120);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move in steps so the gesture handler's activeOffsetX engages before END.
  await page.mouse.move((startX + endX) / 2, startY, { steps: 8 });
  await page.mouse.move(endX, startY, { steps: 8 });
  await page.mouse.up();
}

// Update the two row-cycle steps:
await swipeRow(page, firstUnassignedRow, "left");    // null → you
await expect(page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`)).toBeVisible();
await swipeRow(page, page.getByTestId("section-you").locator(`[data-testid="${rowId}"]`), "right"); // you → them
await expect(page.getByTestId("section-them").locator(`[data-testid="${rowId}"]`)).toBeVisible();
```

The test name + comments get updated to reflect "swipe" not "tap". The remainder of the spec (loading, totals, inclusive toggle, reset) is unchanged. Test name becomes `"phase machine: start → load → bill → swipe → toggle → reset"`.

**If gesture-handler-web turns out to be flaky under Playwright** (race against Reanimated's worklet scheduler on the web bundle), fallback options in order: (a) inject a `data-testid={`${testID}-tap-fallback`}` element wrapped behind `process.env.EXPO_PUBLIC_E2E_SWIPE_VIA_TAP === "1"`, set the env var in the e2e config, and have it call `onSwipe("left")` directly; (b) skip the swipe-driven leg of the e2e on web (only assert phases up through loading + reset). Decide based on what M5.5 actually observes. Prefer (a) — explicit test seam — over (b) — coverage loss.

### Step M5.6 — Manual smoke matrix

iOS Simulator (iPhone 15) + Android emulator (Pixel 7 API 34) + at least one physical device:

```
pnpm --filter @splitbill/mobile ios
pnpm --filter @splitbill/mobile android
```

Click-throughs to verify:

1. **Swipe right on an unassigned row** → underlay fades in on the left, label reads "Them ←" with the green action color, snaps shut after release past 70 px → row moves to Them section. Medium haptic palpable on physical device. Subtle dip back: spring-snap looks smooth, no jank.
2. **Swipe left on an unassigned row** → underlay fades in on the right, label "→ You" + green. Past threshold → row moves to You.
3. **Swipe right on a You-assigned row** → underlay left side reads "Them ←" + green → past threshold → moves to Them.
4. **Swipe right on a Them-assigned row** → underlay left side reads "Unassign" + warn red → past threshold → moves to Unassigned. Verify the destructive color clearly reads as "you're removing an assignment".
5. **Swipe below threshold (~40 px) then release** → row springs back, no dispatch, no haptic. Visually the underlay was briefly partly-visible and faded out cleanly.
6. **Slow vertical scroll on the bill list** → `failOffsetY` keeps the scroll smooth; the row's horizontal pan never accidentally engages.
7. **Section transitions** → row jumps into its new section without animation (M7 will fix). Confirm no flicker, no layout shift in Totals.
8. **Totals + safe area** → Totals footer respects bottom inset after a swipe (no regression from M4).
9. **Edge cases** — drag past the ±160 clamp (try a full 300 px throw): row stops at clamp, releases, fires commit. Drag and then change direction mid-pan: underlay swaps which side is visible smoothly.

### Step M5.7 — Verify M5 (automated)

```
pnpm -r lint
pnpm -r test                                              # core (59) + web (9) + mobile (M3+M4 baseline + 6 new SwipeableRow + 4 swipeDescriptor)
pnpm --filter web build                                   # web still builds
pnpm --filter web test                                    # route test untouched
pnpm --filter @splitbill/mobile e2e                       # Playwright with the new swipeRow helper
pnpm --filter @splitbill/mobile start --no-dev --minify   # production-style Hermes bundle compiles
```

CI's `pnpm -r test` step picks up the new tests automatically. No workflow edits needed.

### Step M5.8 — Update `doc/mobile.md`

- §7 "Swipe gesture": already describes the M5 implementation in present tense (lines 95–119); double-check the code block matches what M5 actually ships. If `failOffsetY` / `activeOffsetX` values were tweaked during implementation, sync them.
- §10 "Web vs mobile deltas": the "Swipe affordance" row already lists "medium haptic on commit" — no change needed.
- §12 "Migration phases": flip M5 row from blank to `✅ shipped`. Move M6 to "next".
- §13 "Risks and open questions": add a one-liner about the VoiceOver regression — "**M7 follow-up: VoiceOver / TalkBack swipe actions.** M5 removed tap-to-cycle; M7 lands `accessibilityActions` (Assign to You / Assign to Them / Unassign) filtered by current assignee."

Optionally add a §15 "Implementation notes" subsection for the M5-shipped two-underlay rendering trick if doc maintainers want it as a reference for the next dev. Not strictly necessary — the source comments cover it.

## Critical files modified or created

- `apps/mobile/src/components/swipeDescriptor.ts` (new — pure label/color/target descriptor)
- `apps/mobile/src/components/swipeDescriptor.test.ts` (new — 6 cases covering the nextAssignee matrix)
- `apps/mobile/src/components/SwipeableRow.tsx` (rewrite — `Pressable` → `GestureDetector` + Reanimated `Animated.View`s + two underlay layers + medium haptic)
- `apps/mobile/src/components/SwipeableRow.test.tsx` (rewrite — drop `cycleDirection` tests; add 6 `fireGestureHandler`-driven cases)
- `apps/mobile/src/components/BillReview.test.tsx` (edit — patch the tap-assign test to use `fireGestureHandler`; production component untouched)
- `apps/mobile/e2e/smoke.spec.ts` (edit — `swipeRow` helper replaces `.click()` on row testIDs; test name updated)
- `doc/mobile.md` (edit — §12 status flip, §13 VoiceOver regression noted; §7 sync if values drifted)

**Reused as-is from `@splitbill/core`:** `nextAssignee` (drives the descriptor), `formatMoney`, `theme.color.{action,warn,assignBg,assignBorder,card,border,text}`, `theme.radius.lg`, `theme.spacing.lg`, types (`Assignee`, `Item`). No core changes in M5.

**Reused as-is from `apps/mobile`:** every M3 + M4 component except `SwipeableRow.{tsx,test.tsx}`. `BillReview.tsx` is unchanged; only its test is patched. `app/index.tsx` is unchanged.

**Untouched on web:** zero web changes in M5. `apps/web/src/components/SwipeableRow.tsx` keeps its framer-motion implementation; web is the reference, mobile is the port.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core untouched | `pnpm --filter @splitbill/core test` | 59 unit tests still green; M5 is additive only. |
| Web route untouched | `pnpm --filter web test` | The route's existing test matrix still passes. |
| swipeDescriptor unit tests | `pnpm --filter @splitbill/mobile test swipeDescriptor` | All 6 (current × direction) cells of the descriptor table map to the right label + color + target. |
| SwipeableRow gesture tests | `pnpm --filter @splitbill/mobile test SwipeableRow` | Past-threshold left swipe commits "left" + fires haptic; past-threshold right swipe commits "right"; below-threshold swipe is a no-op; assigned-row swipes commit the right direction; haptic fires only on commit. |
| All mobile tests | `pnpm --filter @splitbill/mobile test` | M3 + M4 baseline + new M5 cases all green. |
| E2E mouse-drag | `pnpm --filter @splitbill/mobile e2e` | Playwright smoke survives the click→drag switch — phase machine still goes start → load → bill → swipe-assign → toggle → reset. |
| Mobile bundle compiles | `pnpm --filter @splitbill/mobile start --no-dev --minify` | Production-style Hermes bundle builds with the new Gesture + Animated stack. |
| iOS smoke | `pnpm --filter @splitbill/mobile ios` + step M5.6 checklist | Swipe + underlay + haptic + spring-snap all feel native on a notched device. |
| Android smoke | `pnpm --filter @splitbill/mobile android` | Same flow on Android; vertical scroll cooperates with horizontal pan. |
| Web hasn't regressed | `pnpm --filter web build && pnpm --filter web dev` + browser smoke | Snap a receipt in the browser — framer-motion drag still works on web; the M5 mobile changes don't reach `apps/web`. |
| CI green | Push, watch the workflow | `pnpm -r test` runs the new tests alongside existing suites; Vercel preview deploys from `apps/web` unchanged. |

## Risks and follow-ups (deferred to later milestones)

- **VoiceOver / TalkBack swipe equivalents (M7).** Highest-priority M7 item: `accessibilityActions={[{name:"assignYou", label:"Assign to You"}, {name:"assignThem", label:"Assign to Them"}, {name:"unassign", label:"Unassign"}]}` on each row, filtered by `item.assignee` (you don't show "Assign to You" when current = "you"). `onAccessibilityAction` dispatches the right `SWIPE` direction by inferring it from `target` via `nextAssignee`. iOS VoiceOver users hit the actions by three-finger-swiping up/down on the row.
- **Inline edit (M6).** Tap on the name or price children opens a `TextInput`. `pan.enabled(false)` while editing — gate via a `editing` shared value or a React state guard the gesture reads on `.onBegin`. The Reanimated worklet can read a JS-thread shared boolean cheaply.
- **AsyncStorage persistence (M6).** Independent of M5 — see plan-m4.md follow-ups.
- **Section-change animation (M7).** `Layout.springify()` on each `<SwipeableRow>` softens the bucket transition. The framer-motion `layoutId` cross-section shared-element morph is *not* faithfully reproducible in Reanimated; we accept fade+slide.
- **Underlay color blending.** Two stacked layers are sufficient for M5. If designers later want a single underlay whose color crossfades (more "premium" feeling), the Reanimated v4 `interpolateColor` API would do it in ~6 extra lines. Deferred.
- **Web export gesture fidelity.** `gesture-handler-web` is less battle-tested than the native implementation. The Playwright e2e is the canary — if it flakes after M5 lands, the fallback test-seam in step M5.5 is the unblock.
- **Underlay rounded corners on partial-reveal.** When dragging a row that has a 16 px border radius, the underlay needs the same radius so the curve matches. M5 styles already set `borderRadius: theme.radius.lg` on each underlay — verify visually that the corners line up at small drag offsets where ~4 px of underlay is visible. If not, tune to 17 or 18 px to compensate for stroke width.
- **Haptic on Android.** Android's `Haptics.impactAsync(Medium)` falls back to `Vibration.vibrate(15)`-equivalent — feels less crisp than the iOS Taptic Engine. Acceptable for M5; no Android-specific override.
- **Memory of mid-pan state across re-renders.** If a row's `item.assignee` changes (parent re-renders the row in a new section), the worklet's `tx.value` shared value persists but the descriptor `useMemo`s recompute. The visual jump is fine — the row visibly relocates into its new section anyway. If we add `Layout.springify()` in M7, the relocation animates and any residual `tx.value` springs back to 0 naturally.
