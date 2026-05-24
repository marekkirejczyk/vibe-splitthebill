import { render, screen } from "@testing-library/react-native";
import { Totals } from "./Totals";

test("renders You and Them totals in the given currency", () => {
  render(
    <Totals
      totals={{ you: 26.31, them: 39.47, unassigned: 0, extras: 14.3 }}
      currency="$"
    />,
  );
  expect(screen.getByTestId("totals-you")).toHaveTextContent("$26.31");
  expect(screen.getByTestId("totals-them")).toHaveTextContent("$39.47");
});

test("hides the warn pill when nothing is unassigned", () => {
  render(
    <Totals
      totals={{ you: 50, them: 50, unassigned: 0, extras: 0 }}
      currency="$"
    />,
  );
  expect(screen.queryByTestId("totals-warn-pill")).toBeNull();
});

test("shows the warn pill with the unassigned amount when > 0", () => {
  render(
    <Totals
      totals={{ you: 0, them: 0, unassigned: 21.52, extras: 0 }}
      currency="$"
    />,
  );
  expect(screen.getByTestId("totals-warn-pill")).toBeTruthy();
  expect(screen.getByText("$21.52 still unassigned")).toBeTruthy();
});
