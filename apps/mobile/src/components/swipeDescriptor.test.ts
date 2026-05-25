import { theme } from "@splitbill/core";
import { rowAccessibilityActions, swipeDescriptor } from "./swipeDescriptor";

// Six cells of the nextAssignee state machine, exhaustively. The descriptor
// must stay bit-identical with the SWIPE reducer in @splitbill/core (web
// shares the same nextAssignee), so this table doubles as a regression
// guard if anyone tweaks the cycle.

test("null + left → you (assign green)", () => {
  expect(swipeDescriptor(null, "left")).toEqual({
    label: "→ You",
    color: theme.color.action,
    target: "you",
  });
});

test("null + right → them (assign green)", () => {
  expect(swipeDescriptor(null, "right")).toEqual({
    label: "Them ←",
    color: theme.color.action,
    target: "them",
  });
});

test("you + left → null (unassign warn)", () => {
  expect(swipeDescriptor("you", "left")).toEqual({
    label: "Unassign",
    color: theme.color.warn,
    target: null,
  });
});

test("you + right → them (assign green)", () => {
  expect(swipeDescriptor("you", "right")).toEqual({
    label: "Them ←",
    color: theme.color.action,
    target: "them",
  });
});

test("them + left → you (assign green)", () => {
  expect(swipeDescriptor("them", "left")).toEqual({
    label: "→ You",
    color: theme.color.action,
    target: "you",
  });
});

test("them + right → null (unassign warn)", () => {
  expect(swipeDescriptor("them", "right")).toEqual({
    label: "Unassign",
    color: theme.color.warn,
    target: null,
  });
});

// rowAccessibilityActions — the VoiceOver/TalkBack equivalents. Derived from
// nextAssignee (via swipeDescriptor), so these assertions double as a guard
// that the spoken actions can't drift from the gesture.

test("unassigned row → assign-to-You (left) + assign-to-Them (right)", () => {
  const { actions, directionFor } = rowAccessibilityActions(null);
  expect(actions).toEqual([
    { name: "you", label: "Assign to You" },
    { name: "them", label: "Assign to Them" },
  ]);
  expect(directionFor).toEqual({ you: "left", them: "right" });
});

test("you row → unassign (left) + assign-to-Them (right)", () => {
  const { actions, directionFor } = rowAccessibilityActions("you");
  expect(actions).toEqual([
    { name: "unassign", label: "Unassign" },
    { name: "them", label: "Assign to Them" },
  ]);
  expect(directionFor).toEqual({ unassign: "left", them: "right" });
});

test("them row → assign-to-You (left) + unassign (right)", () => {
  const { actions, directionFor } = rowAccessibilityActions("them");
  expect(actions).toEqual([
    { name: "you", label: "Assign to You" },
    { name: "unassign", label: "Unassign" },
  ]);
  expect(directionFor).toEqual({ you: "left", unassign: "right" });
});

test("action names are unique and match the directionFor keys", () => {
  for (const current of [null, "you", "them"] as const) {
    const { actions, directionFor } = rowAccessibilityActions(current);
    const names = actions.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(directionFor).sort()).toEqual([...names].sort());
  }
});
