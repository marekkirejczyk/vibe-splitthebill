import { fireEvent, render, screen } from "@testing-library/react-native";
import { SecondaryButton } from "./SecondaryButton";

test("fires onPress when tapped", () => {
  const onPress = jest.fn();
  render(<SecondaryButton label="Choose from library" onPress={onPress} testID="btn" />);
  fireEvent.press(screen.getByTestId("btn"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("does not fire when disabled", () => {
  const onPress = jest.fn();
  render(<SecondaryButton label="Choose from library" onPress={onPress} disabled testID="btn" />);
  fireEvent.press(screen.getByTestId("btn"));
  expect(onPress).not.toHaveBeenCalled();
});

test("renders label text", () => {
  render(<SecondaryButton label="↻ New bill" onPress={() => {}} small testID="btn" />);
  expect(screen.getByText("↻ New bill")).toBeTruthy();
});
