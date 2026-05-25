import type { Item } from "@splitbill/core";
import { fireEvent, render, screen } from "@testing-library/react-native";
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

// --- M7 accessibility actions (VoiceOver / TalkBack swipe equivalents) ---

test("accessibilityActions track the assignee", () => {
  const { rerender } = render(
    <SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />,
  );
  let row = screen.getByLabelText(/Margherita pizza/);
  expect(
    (row.props.accessibilityActions as { name: string }[]).map((a) => a.name),
  ).toEqual(["you", "them"]);

  rerender(
    <SwipeableRow
      item={item({ assignee: "you" })}
      currency="$"
      onSwipe={() => {}}
      testID="row"
    />,
  );
  row = screen.getByLabelText(/Margherita pizza/);
  expect(
    (row.props.accessibilityActions as { name: string }[]).map((a) => a.name),
  ).toEqual(["unassign", "them"]);
});

test("firing an accessibility action dispatches onSwipe with the mapped direction + haptic", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow
      item={item({ assignee: "you" })}
      currency="$"
      onSwipe={onSwipe}
      testID="row"
    />,
  );
  const row = screen.getByLabelText(/Margherita pizza/);
  fireEvent(row, "accessibilityAction", {
    nativeEvent: { actionName: "them" },
  });
  expect(onSwipe).toHaveBeenCalledWith("right"); // you + "them" → swipe right
  expect(Haptics.impactAsync).toHaveBeenCalledWith("medium");
});

// --- M6 inline edit ---

test("tapping the name opens a TextInput pre-filled with the current name", () => {
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />,
  );
  fireEvent.press(screen.getByTestId("row-name-edit"));
  const input = screen.getByTestId("row-name-input");
  expect(input.props.value).toBe("Margherita pizza");
});

test("editing the name then blurring commits via onEditName", () => {
  const onEditName = jest.fn();
  render(
    <SwipeableRow
      item={item()}
      currency="$"
      onSwipe={() => {}}
      onEditName={onEditName}
      testID="row"
    />,
  );
  fireEvent.press(screen.getByTestId("row-name-edit"));
  const input = screen.getByTestId("row-name-input");
  fireEvent.changeText(input, "Margherita Reale");
  fireEvent(input, "blur");
  expect(onEditName).toHaveBeenCalledWith("Margherita Reale");
});

test("blurring an empty name discards (no onEditName)", () => {
  const onEditName = jest.fn();
  render(
    <SwipeableRow
      item={item()}
      currency="$"
      onSwipe={() => {}}
      onEditName={onEditName}
      testID="row"
    />,
  );
  fireEvent.press(screen.getByTestId("row-name-edit"));
  const input = screen.getByTestId("row-name-input");
  fireEvent.changeText(input, "   ");
  fireEvent(input, "blur");
  expect(onEditName).not.toHaveBeenCalled();
  expect(screen.getByText("Margherita pizza")).toBeTruthy();
});

test("tapping the price opens a decimal-pad TextInput pre-filled with toFixed(2)", () => {
  render(
    <SwipeableRow item={item()} currency="$" onSwipe={() => {}} testID="row" />,
  );
  fireEvent.press(screen.getByTestId("row-price-edit"));
  const input = screen.getByTestId("row-price-input");
  expect(input.props.value).toBe("14.00");
  expect(input.props.keyboardType).toBe("decimal-pad");
});

test("committing a comma-decimal price parses to a number", () => {
  const onEditPrice = jest.fn();
  render(
    <SwipeableRow
      item={item()}
      currency="$"
      onSwipe={() => {}}
      onEditPrice={onEditPrice}
      testID="row"
    />,
  );
  fireEvent.press(screen.getByTestId("row-price-edit"));
  const input = screen.getByTestId("row-price-input");
  fireEvent.changeText(input, "14,5");
  fireEvent(input, "blur");
  expect(onEditPrice).toHaveBeenCalledWith(14.5);
});

test("committing an invalid price does not dispatch", () => {
  const onEditPrice = jest.fn();
  render(
    <SwipeableRow
      item={item()}
      currency="$"
      onSwipe={() => {}}
      onEditPrice={onEditPrice}
      testID="row"
    />,
  );
  fireEvent.press(screen.getByTestId("row-price-edit"));
  const input = screen.getByTestId("row-price-input");
  fireEvent.changeText(input, "abc");
  fireEvent(input, "blur");
  expect(onEditPrice).not.toHaveBeenCalled();
});
