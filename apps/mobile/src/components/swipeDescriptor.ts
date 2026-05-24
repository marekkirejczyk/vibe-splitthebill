import { nextAssignee, theme, type Assignee } from "@splitbill/core";

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
