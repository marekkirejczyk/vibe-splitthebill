import type { Item } from "@splitbill/core";
import { render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { State } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
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
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />,
  );
  expect(screen.getByText("Margherita pizza")).toBeTruthy();
  expect(screen.getByText("$14.00")).toBeTruthy();
});

test("unassigned row renders both swipe underlays: '→ You' (left) and 'Them ←' (right)", () => {
  // Both underlays are always in the tree (opacity is animated 0→1 as you
  // drag). left + right of an unassigned row resolve via nextAssignee.
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />,
  );
  expect(screen.getByText("→ You")).toBeTruthy(); // null + left  → you
  expect(screen.getByText("Them ←")).toBeTruthy(); // null + right → them
});

test("you-assigned row renders 'Unassign' + 'Them ←' underlays", () => {
  render(
    <SwipeableRow
      item={item({ assignee: "you" })}
      currency="$"
      onSwipe={() => {}}
      testID="row"
    />,
  );
  expect(screen.getByText("Unassign")).toBeTruthy(); // you + left  → null
  expect(screen.getByText("Them ←")).toBeTruthy(); // you + right → them
});

test("them-assigned row renders '→ You' + 'Unassign' underlays", () => {
  render(
    <SwipeableRow
      item={item({ assignee: "them" })}
      currency="$"
      onSwipe={() => {}}
      testID="row"
    />,
  );
  expect(screen.getByText("→ You")).toBeTruthy(); // them + left  → you
  expect(screen.getByText("Unassign")).toBeTruthy(); // them + right → null
});

test("swipe past threshold (-80 px) commits 'left' and fires medium haptic", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireGestureHandler(getByGestureTestId("row-pan"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: -80 },
    { state: State.END, translationX: -80 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("left");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

test("swipe past threshold (+80 px) commits 'right'", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireGestureHandler(getByGestureTestId("row-pan"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: 80 },
    { state: State.END, translationX: 80 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

test("swipe below threshold (40 px) does NOT commit; no haptic", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireGestureHandler(getByGestureTestId("row-pan"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: 40 },
    { state: State.END, translationX: 40 },
  ]);
  expect(onSwipe).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});

test("you-state swipe right commits 'right' (→ them); haptic fires", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow
      item={item({ assignee: "you" })}
      currency="$"
      onSwipe={onSwipe}
      testID="row"
    />,
  );
  fireGestureHandler(getByGestureTestId("row-pan"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: 100 },
    { state: State.END, translationX: 100 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

test("them-state swipe right commits 'right' (→ unassigned)", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow
      item={item({ assignee: "them" })}
      currency="$"
      onSwipe={onSwipe}
      testID="row"
    />,
  );
  fireGestureHandler(getByGestureTestId("row-pan"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: 100 },
    { state: State.END, translationX: 100 },
  ]);
  expect(onSwipe).toHaveBeenCalledWith("right");
});
