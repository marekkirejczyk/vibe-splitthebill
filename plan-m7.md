# React Native migration — Phase 7 (M7, polish: icon + splash, a11y swipe actions, section animation, safe-area sweep)

## Context

M1 turned the repo into a pnpm workspace and extracted `@splitbill/core`. M2 stood up `apps/mobile` (Expo SDK 56) with shared theme tokens + the Figma file. M3 shipped the static screens against a mock bill. M4 wired the real `expo-image-picker` → `expo-image-manipulator` → multipart `fetch` to `/api/extract` (+ cancel / permission / success-haptic flows). M5 replaced tap-to-cycle with `Gesture.Pan()` + Reanimated translateX + two stacked underlay layers + medium haptic. M6 landed inline edit (`TextInput` swap-in + `KeyboardAvoidingView`), `AsyncStorage` persistence, the "New bill" confirm, and `expo-splash-screen` **auto-hide masking** (the gate that holds the splash through cold-start rehydration).

M7 is the **polish** milestone. Behaviour is frozen — every interaction shipped in M3–M6. M7 only changes how the app *looks at the edges and to assistive tech*:

1. **App icon + splash visual (Figma-first).** M6 wired `SplashScreen.preventAutoHideAsync()` / `hideAsync()` but never customised the *art* — the splash falls back to Expo's default, and the icon is still a placeholder. M7 **designs the icon + splash (+ the platform asset variants) in Figma first, for approval**, then exports and wires them. This step also fixes two latent config bugs found during the survey (below).
2. **VoiceOver / TalkBack swipe equivalents (the M5 follow-up).** M5 removed tap-to-cycle, so assistive-tech users currently have **no way to assign a row** — the only affordance is a pan gesture they can't perform. M7 adds `accessibilityActions` to each row, dispatching the same `SWIPE` the gesture does.
3. **Section-change animation.** Soften the jump when an item moves between Unassigned / You / Them, using Reanimated layout animations.
4. **Safe-area sweep.** Audit every screen against notch / Dynamic Island / home indicator / landscape insets and close any gaps.

Scope decisions (confirmed with the user):
- **Icon/splash are designed in Figma first and approved before any asset is exported or wired** — M7.1 is a design-and-approval gate, not placeholder art.
- **Accessibility scope is the row swipe actions only** — the M5 regression. A broader label/hint/role audit across all screens is explicitly *out* of M7.

After M7 the app is store-submittable on chrome and accessibility. M8 lands EAS Build + TestFlight / Play internal + the shared-secret auth on `/api/extract` (the M4/M8 follow-up).

## Survey findings (current state, verified)

- **Safe areas are already in good shape.** `app/_layout.tsx` wraps everything in `SafeAreaProvider`. `BillReview` uses `SafeAreaView edges={["top","left","right"]}` and the absolutely-anchored `Totals` footer adds `insets.bottom` itself. `StartScreen` uses all four edges. `LoadingScreen` + `ErrorScreen` use a bare `SafeAreaView` (defaults to all edges). The sweep is therefore a *verification* pass plus two small refinements, not a rebuild (see M7.5).
- **Config bug #1 — broken adaptive-icon path.** `app.config.ts:26` sets `android.adaptiveIcon.foregroundImage: "./assets/adaptive-icon.png"`, but **no `adaptive-icon.png` exists**. The assets dir actually holds `android-icon-foreground.png` (512×512), `android-icon-background.png` (512×512), and `android-icon-monochrome.png` (432×432). The Android adaptive icon is currently mis-wired.
- **Config bug #2 — splash art never configured.** `splash-icon.png` (1024×1024) sits in `assets/` but nothing references it: there is **no `expo-splash-screen` plugin block and no `splash` key** in `app.config.ts`. M6 wired the *auto-hide gate* but the *visual* defaults to Expo's blank splash. Both bugs get fixed as part of M7.2.
- **Reanimated version gotcha.** `react-native-reanimated@4.3.1`. `Layout` (named in `plan-m6.md`'s follow-up and `doc/mobile.md` §12/§13) is now **a deprecated alias for `LinearTransition`** (`export declare const Layout: typeof LinearTransition`). The current API is `LinearTransition.springify()`, with `FadeIn` / `FadeOut` for entering/exiting. The plan uses the modern names.
- **The row already has a base a11y label.** `SwipeableRow`'s gesture-wrapped `Animated.View` has `accessibilityRole="button"` + an `accessibilityLabel` (`"<name>, <price>, <assignee|unassigned>"`). M7 adds `accessibilityActions` + `onAccessibilityAction` to *that same node* — no new wrapper.
- **`swipeDescriptor.ts` already encapsulates the state machine.** `swipeDescriptor(assignee, direction)` returns `{label, color, target}` off `nextAssignee`. The a11y actions reuse this so VoiceOver labels and the visual underlay labels can't drift apart.

## Decisions baked in

- **Figma-first, single approval gate.** All M7 visual assets (icon, adaptive-icon foreground/background/monochrome, splash) are designed in the existing *Split the Bill — Mobile* file (https://www.figma.com/design/yDOs60DEcPKCIvBEbMPtRD) on a new **"App Icon & Splash"** page before any file on disk changes. The user reviews the Figma frames; only after approval do we export + wire (M7.2). No code-side asset churn happens speculatively.
- **Brand direction reuses the existing theme.** The app's visual language is already set: the warm orange→pink gradient (`#fb923c` → `#ec4899`, from `StartScreen`'s hero blob and `theme.gradient`), the receipt glyph 🧾, the stone-`#f5f5f4` background, the "Split the bill" wordmark. The icon proposal builds on these rather than inventing a new mark, so icon ↔ in-app chrome stay coherent.
- **Splash = centred mark on a solid brand background, `resizeMode: "contain"`.** Matches the Expo SDK 56 splash model (a single icon image centred over a background colour, *not* a full-bleed image). `splash-icon.png` is the mark; background is the brand stone or a flat brand tint chosen in Figma. This is the modern config-plugin approach — no legacy full-screen splash image.
- **Accessibility actions are derived from `swipeDescriptor`, not hard-coded.** A new pure helper `rowAccessibilityActions(assignee)` returns the list of `{ name, label }` plus a `name → direction` map, computed from `swipeDescriptor(assignee, "left")` and `swipeDescriptor(assignee, "right")`. `onAccessibilityAction` looks up the direction and calls the **existing** `onSwipe(direction)` — so a11y and gesture share one dispatch path and one source of truth. Putting it next to `swipeDescriptor` keeps it unit-testable without React/Reanimated (same rationale §13/`swipeDescriptor.test.ts` already use).
- **Two distinct actions per row, labelled by destination.** For any current assignee, the two swipe directions yield two distinct targets among {you, them, unassign}. The VoiceOver action labels read as plain verbs — `"Assign to You"`, `"Assign to Them"`, `"Unassign"` — *not* the terse visual underlay labels (`"→ You"`, `"Them ←"`, `"Unassign"`), because screen-reader output should be spoken-language, not directional chrome. The visual labels in `swipeDescriptor` stay unchanged; the a11y helper maps `target → spoken label`.
- **`onAccessibilityAction` fires the same haptic + dispatch as a gesture commit.** Reuse `onSwipe`; the host's `onSwipe` already dispatches `SWIPE`. The medium haptic currently fires inside the gesture's `onEnd`; for a11y we fire it from the row's `onAccessibilityAction` handler too, so the confirmation feel is identical.
- **Layout animation goes on the row's *outer* `wrap`, not the inner translateX view.** `SwipeableRow` has two Animated layers: the inner row carries the gesture `translateX`. Adding `layout` / `entering` / `exiting` to that inner view would fight the pan transform. Instead, convert the **outer** `<View style={styles.wrap}>` to `Animated.View` and attach `layout={LinearTransition.springify()}`, `entering={FadeIn}`, `exiting={FadeOut}`. The two animation systems then operate on separate nodes.
- **Sections themselves animate in/out.** When a bucket goes empty→non-empty (e.g. first item assigned to "You"), the section `<View testID="section-you">` mounts. Wrap each section container as `Animated.View` with `entering={FadeIn}` / `exiting={FadeOut}` so the chip + list fade rather than pop. `LinearTransition` on the rows handles the reflow as items leave one list and join another.
- **No core changes.** `nextAssignee`, `SWIPE`, all actions already exist. M7 is wiring + assets + config + docs.
- **No web changes.** Web keeps framer-motion's `layoutId` shared-element morph; mobile's `LinearTransition` fade+slide is the documented native-idiom tradeoff (`doc/mobile.md` §13).
- **Tests stay offline.** The a11y helper is pure (unit-tested in `swipeDescriptor.test.ts`'s sibling). The row's `onAccessibilityAction` is exercised by firing the RN `accessibilityAction` event in `@testing-library/react-native`. No new fixtures, no live API.

## M7 — Polish

### Step M7.1 — Figma: design icon + splash (+ variants), then **approval gate**

In the existing *Split the Bill — Mobile* Figma file, add an **"App Icon & Splash"** page with these frames, designed from the brand direction above:

| Frame | Size | Purpose |
|---|---|---|
| `Icon — master` | 1024×1024 | iOS app icon + the source all other sizes derive from. Full-bleed art (no transparency for iOS). |
| `Adaptive — foreground` | 1024×1024 (mark within the 66%-diameter safe circle) | Android adaptive-icon foreground layer; transparent outside the mark. |
| `Adaptive — background` | 1024×1024 | Android adaptive-icon background layer (flat brand tint or subtle gradient). |
| `Adaptive — monochrome` | 1024×1024 | Android 13+ themed-icon silhouette (single-colour, transparent bg). |
| `Splash` | 1242×2688 preview | Centred mark on the brand background — for visual approval only; the exported asset is just the centred `splash-icon` mark. |
| `Favicon` | 256×256 (downscales to 48) | Web tab icon. |

Round-trip via the Figma MCP (`get_screenshot` for review images, `get_variable_defs` to keep colours in lockstep with `theme.ts`).

**Gate:** present the frames (screenshots) to the user. **Do not proceed to M7.2 until the design is approved.** If the user requests changes, iterate in Figma and re-present.

### Step M7.2 — Export approved assets + fix `app.config.ts`

Export from Figma into `apps/mobile/assets/`, replacing the placeholders at the sizes the survey confirmed (`icon.png` 1024², the three `android-icon-*.png`, `splash-icon.png` 1024², `favicon.png` 48²).

Then fix both config bugs in `apps/mobile/app.config.ts`:

```ts
icon: "./assets/icon.png",
android: {
  package: "com.splitbill.app",
  adaptiveIcon: {
    foregroundImage: "./assets/android-icon-foreground.png",   // was the missing adaptive-icon.png
    backgroundImage: "./assets/android-icon-background.png",
    monochromeImage: "./assets/android-icon-monochrome.png",
  },
},
plugins: [
  "expo-router",
  [
    "expo-splash-screen",
    {
      image: "./assets/splash-icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "<approved brand bg, e.g. #f5f5f4>",
    },
  ],
],
```

(The `expo-splash-screen` config-plugin props were verified against `node_modules/expo-splash-screen/plugin/build/types.d.ts`: `image`, `imageWidth`, `resizeMode: "contain"|"cover"|"native"`, `backgroundColor`, plus optional `dark`.) Add a `favicon` reference under a `web` key only if web export needs it (currently `favicon.png` is unreferenced; wiring it is optional polish).

### Step M7.3 — `rowAccessibilityActions` helper + `SwipeableRow` a11y

`apps/mobile/src/components/swipeDescriptor.ts` — add a pure helper:

```ts
import type { AccessibilityActionInfo } from "react-native";

const SPOKEN: Record<"you" | "them" | "unassign", string> = {
  you: "Assign to You",
  them: "Assign to Them",
  unassign: "Unassign",
};

export type RowA11y = {
  actions: AccessibilityActionInfo[];           // { name, label } per reachable target
  directionFor: Record<string, "left" | "right">;
};

export function rowAccessibilityActions(current: Assignee): RowA11y {
  const left = swipeDescriptor(current, "left");
  const right = swipeDescriptor(current, "right");
  const entry = (d: SwipeDescriptor, dir: "left" | "right") => {
    const key = d.target === null ? "unassign" : d.target; // "you" | "them" | "unassign"
    return { name: key, label: SPOKEN[key], dir };
  };
  const built = [entry(left, "left"), entry(right, "right")];
  // De-dupe by name (two directions never map to the same target, but be safe).
  const seen = new Set<string>();
  const actions: AccessibilityActionInfo[] = [];
  const directionFor: Record<string, "left" | "right"> = {};
  for (const e of built) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    actions.push({ name: e.name, label: e.label });
    directionFor[e.name] = e.dir;
  }
  return { actions, directionFor };
}
```

`apps/mobile/src/components/SwipeableRow.tsx` — on the existing gesture-wrapped `Animated.View` (the one already carrying `accessibilityRole="button"` + `accessibilityLabel`):

```tsx
const a11y = useMemo(() => rowAccessibilityActions(item.assignee), [item.assignee]);
// ...
<Animated.View
  accessibilityRole="button"
  accessibilityLabel={`${item.name}, ${formatMoney(item.price, currency)}, ${item.assignee ?? "unassigned"}`}
  accessibilityActions={a11y.actions}
  onAccessibilityAction={(e) => {
    const dir = a11y.directionFor[e.nativeEvent.actionName];
    if (dir) {
      onSwipe(dir);
      fireHaptic();
    }
  }}
  style={[styles.row, assigned ? styles.assignedRow : styles.unassignedRow, rowStyle]}
>
```

No new imports beyond `rowAccessibilityActions`; `useMemo` + `fireHaptic` already exist in the file.

### Step M7.4 — Section + row layout animations

`apps/mobile/src/components/SwipeableRow.tsx`: convert the outer wrapper to an Animated node and attach layout/enter/exit:

```tsx
import Animated, { FadeIn, FadeOut, LinearTransition, /* existing… */ } from "react-native-reanimated";
// ...
return (
  <Animated.View
    style={styles.wrap}
    testID={testID}
    layout={LinearTransition.springify().damping(18)}
    entering={FadeIn.duration(180)}
    exiting={FadeOut.duration(120)}
  >
    {/* underlays + GestureDetector unchanged */}
  </Animated.View>
);
```

`apps/mobile/src/components/BillReview.tsx`: wrap each of the three section containers as `Animated.View` with `entering={FadeIn}` / `exiting={FadeOut}` (import once at top). The `ScrollView` and `KeyboardAvoidingView` are untouched. No layout-prop on the sections themselves — `LinearTransition` on the rows handles inter-section reflow; the sections only fade.

> Reanimated 4.x: use `LinearTransition`, **not** `Layout` (deprecated alias). Verified against `node_modules/react-native-reanimated/lib/typescript/index.d.ts`.

### Step M7.5 — Safe-area sweep

The survey showed safe areas are mostly correct. Two refinements + a verification pass:

1. **`LoadingScreen` / `ErrorScreen` double top-padding.** Both use a bare `SafeAreaView` (all edges) *and* a `content` style with `paddingTop: theme.spacing.xxxl`. On notched devices this stacks the inset under an already-large pad. Set explicit `edges={["left","right","bottom"]}` on these two (top handled by the content pad), or trim the content `paddingTop` — decide visually in the simulator. Low-risk cosmetic.
2. **Landscape inset check.** `orientation: "portrait"` is locked in `app.config.ts`, so left/right insets only matter on landscape-capable tablets (`ios.supportsTablet: true`). Confirm `edges` include `"left","right"` everywhere they should (they do today). No code change expected — just verify on an iPad simulator.
3. **Verification pass** (manual, Step M7.7 checklist): Dynamic Island (iPhone 15 Pro), home indicator (footer already adds `insets.bottom`), notch (older iPhone), Android gesture nav bar.

### Step M7.6 — Tests

- **`apps/mobile/src/components/swipeDescriptor.test.ts`** — add a `rowAccessibilityActions` block:
  1. `current === null` (unassigned) → actions are exactly `[{name:"you",label:"Assign to You"}, {name:"them",label:"Assign to Them"}]` (the two directions assign), `directionFor` maps each to the right `"left"`/`"right"` per `nextAssignee`.
  2. `current === "you"` → one action assigns to "them", the other "unassign"; labels are the spoken forms; `directionFor` correct.
  3. `current === "them"` → symmetric to (2).
  4. No duplicate `name` in any case; `directionFor` keys === action names.
  These assert against `nextAssignee` directly so they can't drift from the gesture's behaviour.
- **`apps/mobile/src/components/SwipeableRow.test.tsx`** — add ~2 cases on top of M6's:
  1. **`accessibilityActions` reflect the assignee** → render an unassigned row, query the node, assert `accessibilityActions` names are `["you","them"]`; render a `you` row, assert `["them","unassign"]`.
  2. **Firing an action calls `onSwipe` with the mapped direction** → `fireEvent(node, "accessibilityAction", { nativeEvent: { actionName: "them" } })`, assert `onSwipe` called with the direction `rowAccessibilityActions` maps `"them"` to. (Haptics already mocked in the suite.)
  Layout animations are visual; assert only that the row still renders (the existing render/underlay/edit cases stay green) — `LinearTransition`/`FadeIn` need no behavioural test.

### Step M7.7 — Manual smoke matrix

iOS Simulator + Android emulator + ≥1 physical device:

1. **Icon** — home-screen icon shows the designed mark on iOS *and* the adaptive icon on Android (long-press wiggle, themed-icon mode on Android 13+ shows the monochrome silhouette).
2. **Splash** — cold start shows the designed splash (mark centred on brand bg), holds through rehydration (M6 gate), hides on first paint. No blank/white default splash, no black flash.
3. **VoiceOver (iOS)** — enable VoiceOver, focus a row → it reads `"<name>, <price>, unassigned, button"` → rotor/three-finger to actions → hear "Assign to You" / "Assign to Them" → activate → row moves to the You section, medium haptic fires, totals update.
4. **TalkBack (Android)** — focus a row → local context menu (actions) lists the same verbs → activate → same result.
5. **Action set changes with state** — a row already in "You" offers "Assign to Them" + "Unassign" (not "Assign to You").
6. **Section animation** — assign the first item to an empty bucket → the You section fades in, the row springs from Unassigned into it (no instant jump). Unassign the last item in a bucket → section fades out.
7. **Safe areas** — Dynamic Island device: title clears the island; footer clears the home indicator; Loading/Error screens have balanced top spacing (no doubled pad). Android gesture-nav: footer clears the nav pill.

### Step M7.8 — Verify (automated)

```
pnpm -r lint
pnpm -r test                                              # core + web unchanged; mobile = M6 baseline + ~6 new
pnpm --filter web build
pnpm --filter @splitbill/mobile e2e                       # existing Playwright legs still green
pnpm --filter @splitbill/mobile start --no-dev --minify   # Hermes bundle compiles with new config + LinearTransition
```

The new `app.config.ts` (adaptive icon paths + splash plugin) is exercised by `expo export` / prebuild during EAS in M8; for M7, `expo start` resolving the config + a successful icon/splash render in the simulator is the proof.

### Step M7.9 — Update `doc/mobile.md`

- **§5 (Figma source of truth):** add the "App Icon & Splash" page + the six frames to the inventory.
- **§11 (App configuration):** document the (now-correct) `android.adaptiveIcon` three-layer config and the `expo-splash-screen` plugin block; note `icon.png` / `favicon.png`.
- **§12 (Migration phases):** flip **M7 → ✅ shipped**; replace `Layout.springify()` with `LinearTransition.springify()` in the M7 row; M8 becomes "next".
- **§13 (Risks):** resolve the VoiceOver/TalkBack bullet (shipped in M7.3); update the "Section-change animation fidelity" bullet to name `LinearTransition` instead of `Layout`.

## Critical files modified or created

- `apps/mobile/assets/{icon,android-icon-foreground,android-icon-background,android-icon-monochrome,splash-icon,favicon}.png` (replace placeholders with Figma exports — M7.2)
- `apps/mobile/app.config.ts` (fix adaptive-icon paths; add `expo-splash-screen` plugin config — M7.2)
- `apps/mobile/src/components/swipeDescriptor.ts` (add pure `rowAccessibilityActions` + spoken-label map — M7.3)
- `apps/mobile/src/components/swipeDescriptor.test.ts` (add `rowAccessibilityActions` cases — M7.6)
- `apps/mobile/src/components/SwipeableRow.tsx` (a11y actions on the gesture view; outer `wrap` → `Animated.View` with `LinearTransition`/`FadeIn`/`FadeOut` — M7.3 + M7.4)
- `apps/mobile/src/components/SwipeableRow.test.tsx` (add 2 a11y cases — M7.6)
- `apps/mobile/src/components/BillReview.tsx` (sections → `Animated.View` enter/exit — M7.4)
- `apps/mobile/src/components/LoadingScreen.tsx`, `ErrorScreen.tsx` (safe-area `edges` refinement — M7.5; cosmetic, decide in sim)
- `doc/mobile.md` (§5, §11, §12, §13 — M7.9)

**Reused as-is from `@splitbill/core`:** `nextAssignee`, `Assignee`, `SWIPE`, `theme`, `formatMoney` — the a11y actions are a thin spoken-language wrapper over the existing state machine.

**Reused as-is from prior milestones:** M5 gesture + underlay + `swipeDescriptor`; M6 inline edit + persistence + splash auto-hide gate (this milestone adds the *visual*, the gate already works).

**Untouched on web:** zero web changes.

## Verification (end-to-end)

| Check | Command | What it proves |
|---|---|---|
| Core untouched | `pnpm --filter @splitbill/core test` | M7 wires existing primitives; the state machine is unchanged. |
| Web untouched | `pnpm --filter web test && pnpm --filter web build` | No web regression; framer-motion path intact. |
| a11y helper | `pnpm --filter @splitbill/mobile test swipeDescriptor` | `rowAccessibilityActions` matches `nextAssignee` for all three current states; spoken labels + direction map correct; no dupes. |
| Row a11y + animation render | `pnpm --filter @splitbill/mobile test SwipeableRow` | M6 cases still green; `accessibilityActions` track the assignee; firing an action dispatches the mapped `onSwipe`. |
| All mobile tests | `pnpm --filter @splitbill/mobile test` | M6 baseline + ~6 net new, all green. |
| E2E | `pnpm --filter @splitbill/mobile e2e` | Playwright phase-machine + swipe + edit + reset legs survive the section/row Animated.View swap. |
| Bundle compiles | `pnpm --filter @splitbill/mobile start --no-dev --minify` | Hermes bundle builds with new `app.config.ts` + `LinearTransition`. |
| iOS smoke | `pnpm --filter @splitbill/mobile ios` + M7.7 checklist | Designed icon + splash; VoiceOver assigns rows; sections animate; safe areas clean on Dynamic Island. |
| Android smoke | `pnpm --filter @splitbill/mobile android` + M7.7 | Adaptive + monochrome icon; TalkBack assigns rows; gesture-nav safe area clean. |

## Risks and follow-ups (deferred)

- **EAS Build + store metadata (M8).** Icon/splash only *render* correctly once prebuilt. M7 verifies in Expo Go / dev client + simulator; M8's EAS prebuild is the real cross-check (and where store-listing icon assets get finalised).
- **Shared-secret auth on `/api/extract` (M8).** Unchanged from the M4 follow-up.
- **Broader a11y audit (post-M7).** M7 fixes only the row-assignment regression. A full pass — labels/hints on every button, `accessibilityLiveRegion` on the totals footer so VoiceOver announces total changes, focus order, contrast — is a worthwhile follow-up but explicitly out of M7 scope (user decision).
- **`LinearTransition` + gesture interplay on rapid swipes.** Layout animation on the outer `wrap` while the inner view springs back from a pan should be independent, but watch for a visual "double move" if an item reassigns mid-spring. If it reads badly, gate `layout` off during an active gesture (a shared-value flag) — decide at implementation from the simulator.
- **Dark mode.** `userInterfaceStyle: "light"` is locked, so the splash/icon dark variants (`dark` props on the plugin, `ios.icon` dark layer) are unnecessary now. If we ever unlock dark mode, design the dark splash + tinted iOS icon then.
- **Monochrome icon legibility.** Android 13 themed icons tint the monochrome layer to the user's wallpaper palette — verify the mark stays recognisable as a flat silhouette (no gradient reliance). Caught in M7.1 design review.
</content>
</invoke>
