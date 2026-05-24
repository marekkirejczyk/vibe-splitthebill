import { render, screen } from "@testing-library/react-native";
import { Chip } from "./Chip";

test("singular item label", () => {
  render(<Chip label="You" count={1} tone="you" />);
  expect(screen.getByText("1 item")).toBeTruthy();
});

test("plural item label and total", () => {
  render(<Chip label="Them" count={3} total="$33.00" tone="them" />);
  expect(screen.getByText("3 items")).toBeTruthy();
  expect(screen.getByText("$33.00")).toBeTruthy();
});

test("omits the total when not provided", () => {
  render(<Chip label="Unassigned" count={2} tone="neutral" />);
  expect(screen.queryByText("$0.00")).toBeNull();
});
