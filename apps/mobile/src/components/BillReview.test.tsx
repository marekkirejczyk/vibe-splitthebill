import {
  billFromReceipt,
  reducer,
  type Action,
  type Bill,
  type State,
} from "@splitbill/core";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useReducer } from "react";
import { mockReceipt } from "../fixtures/mockBill";
import { BillReview } from "./BillReview";

function Harness({ initialBill, onReset = () => {} }: { initialBill: Bill; onReset?: () => void }) {
  const [state, dispatch] = useReducer(reducer, { bill: initialBill } as State);
  if (!state.bill) return null;
  return <BillReview bill={state.bill} dispatch={dispatch} onReset={onReset} />;
}

test("loads the mock receipt with all items unassigned and total visible", () => {
  const bill = billFromReceipt(mockReceipt);
  render(<Harness initialBill={bill} />);
  expect(screen.getByTestId("section-unassigned")).toBeTruthy();
  expect(screen.queryByTestId("section-you")).toBeNull();
  expect(screen.queryByTestId("section-them")).toBeNull();
});

test("tapping an unassigned row moves it into the You section", () => {
  const bill = billFromReceipt(mockReceipt);
  const firstUnassigned = bill.items[0];
  render(<Harness initialBill={bill} />);
  fireEvent.press(screen.getByTestId(`row-${firstUnassigned.id}`));
  expect(screen.getByTestId("section-you")).toBeTruthy();
});

test("toggling the Tax switch updates inclusive flag via dispatch", () => {
  const bill = billFromReceipt(mockReceipt);
  let lastAction: Action | undefined;
  const spy = jest.fn((action: Action) => {
    lastAction = action;
  });
  render(<BillReview bill={bill} dispatch={spy} onReset={() => {}} />);
  const sw = screen.getByLabelText("Tax already in prices toggle");
  fireEvent(sw, "valueChange", true);
  expect(lastAction).toEqual({ type: "SET_INCLUSIVE", kind: "tax", value: true });
});

test("renders the New bill action and dispatches onReset when tapped", () => {
  const bill = billFromReceipt(mockReceipt);
  const onReset = jest.fn();
  render(<Harness initialBill={bill} onReset={onReset} />);
  fireEvent.press(screen.getByTestId("bill-reset"));
  expect(onReset).toHaveBeenCalledTimes(1);
});
