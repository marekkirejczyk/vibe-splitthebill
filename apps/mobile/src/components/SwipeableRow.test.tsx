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
