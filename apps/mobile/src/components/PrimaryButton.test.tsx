import { fireEvent, render, screen } from "@testing-library/react-native";
import { PrimaryButton } from "./PrimaryButton";

test("fires onPress when tapped", () => {
  const onPress = jest.fn();
  render(<PrimaryButton label="Take photo" onPress={onPress} testID="btn" />);
  fireEvent.press(screen.getByTestId("btn"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("does not fire when disabled", () => {
  const onPress = jest.fn();
  render(<PrimaryButton label="Take photo" onPress={onPress} disabled testID="btn" />);
  fireEvent.press(screen.getByTestId("btn"));
  expect(onPress).not.toHaveBeenCalled();
});

test("exposes accessibility role and label", () => {
  render(<PrimaryButton label="Take photo" onPress={() => {}} testID="btn" />);
  const btn = screen.getByTestId("btn");
  expect(btn.props.accessibilityRole).toBe("button");
  expect(btn.props.accessibilityLabel).toBe("Take photo");
});
