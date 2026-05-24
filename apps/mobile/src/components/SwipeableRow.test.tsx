import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Item } from "@splitbill/core";
import { cycleDirection, SwipeableRow } from "./SwipeableRow";

const item = (overrides: Partial<Item> = {}): Item => ({
  id: "i1",
  name: "Margherita pizza",
  price: 14,
  assignee: null,
  ...overrides,
});

describe("cycleDirection (walks null → you → them → null)", () => {
  test("null → left (nextAssignee = you)", () => {
    expect(cycleDirection(null)).toBe("left");
  });
  test("you → right (nextAssignee = them)", () => {
    expect(cycleDirection("you")).toBe("right");
  });
  test("them → right (nextAssignee = null)", () => {
    expect(cycleDirection("them")).toBe("right");
  });
});

test("renders item name and money-formatted price", () => {
  render(<SwipeableRow item={item()} currency="$" onSwipe={() => {}} />);
  expect(screen.getByText("Margherita pizza")).toBeTruthy();
  expect(screen.getByText("$14.00")).toBeTruthy();
});

test("tap dispatches the cycling direction for an unassigned row", () => {
  const onSwipe = jest.fn();
  render(<SwipeableRow item={item()} currency="$" onSwipe={onSwipe} testID="row" />);
  fireEvent.press(screen.getByTestId("row"));
  expect(onSwipe).toHaveBeenCalledWith("left");
});

test("tap dispatches the cycling direction for an assigned-to-you row", () => {
  const onSwipe = jest.fn();
  render(
    <SwipeableRow item={item({ assignee: "you" })} currency="$" onSwipe={onSwipe} testID="row" />,
  );
  fireEvent.press(screen.getByTestId("row"));
  expect(onSwipe).toHaveBeenCalledWith("right");
});
