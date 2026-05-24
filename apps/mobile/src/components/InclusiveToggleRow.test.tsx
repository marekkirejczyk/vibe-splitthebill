import { fireEvent, render, screen } from "@testing-library/react-native";
import { InclusiveToggleRow } from "./InclusiveToggleRow";

test("renders label, value, and reflects on/off", () => {
  render(
    <InclusiveToggleRow
      label="Tax already in prices"
      value="$5.30"
      on={false}
      onValueChange={() => {}}
      testID="row"
    />,
  );
  expect(screen.getByText("Tax already in prices")).toBeTruthy();
  expect(screen.getByText("$5.30")).toBeTruthy();
});

test("emits onValueChange when the Switch flips", () => {
  const onValueChange = jest.fn();
  render(
    <InclusiveToggleRow
      label="Tip already in prices"
      value="$9.00"
      on={false}
      onValueChange={onValueChange}
      testID="row"
    />,
  );
  const sw = screen.getByLabelText("Tip already in prices toggle");
  fireEvent(sw, "valueChange", true);
  expect(onValueChange).toHaveBeenCalledWith(true);
});
