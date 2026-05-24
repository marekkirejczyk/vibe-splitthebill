import { theme } from "@splitbill/core";
import { swipeDescriptor } from "./swipeDescriptor";

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
