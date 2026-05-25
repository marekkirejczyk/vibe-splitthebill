import { nextAssignee, theme, type Assignee } from "@splitbill/core";
import type { AccessibilityActionInfo } from "react-native";

// Describes the underlay state for one direction of swipe given the row's
// current assignee. Pulled out as a pure helper so jest can drive every
// (current × direction) cell of the nextAssignee state machine without
// touching React or Reanimated.
export type SwipeDescriptor = {
  label: string;
  color: string;
  target: Assignee;
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

// VoiceOver/TalkBack equivalents of the two swipe directions. The gesture is
// the only way to assign a row, so assistive tech needs the same affordance.
// Derived from swipeDescriptor (hence nextAssignee) so a11y can't drift from
// the visual underlay or the SWIPE reducer. Labels are spoken-language verbs,
// not the directional chrome the underlays show ("→ You").
type Target = "you" | "them" | "unassign";

const SPOKEN: Record<Target, string> = {
  you: "Assign to You",
  them: "Assign to Them",
  unassign: "Unassign",
};

export type RowA11y = {
  actions: AccessibilityActionInfo[];
  directionFor: Record<string, "left" | "right">;
};

export function rowAccessibilityActions(current: Assignee): RowA11y {
  const build = (dir: "left" | "right") => {
    const { target } = swipeDescriptor(current, dir);
    const name: Target = target === null ? "unassign" : target;
    return { name, dir };
  };
  const actions: AccessibilityActionInfo[] = [];
  const directionFor: Record<string, "left" | "right"> = {};
  const seen = new Set<string>();
  // Two directions never collapse to the same target, but de-dupe defensively.
  for (const { name, dir } of [build("left"), build("right")]) {
    if (seen.has(name)) continue;
    seen.add(name);
    actions.push({ name, label: SPOKEN[name] });
    directionFor[name] = dir;
  }
  return { actions, directionFor };
}
