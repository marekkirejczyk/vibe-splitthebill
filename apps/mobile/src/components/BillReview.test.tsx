import {
  billFromReceipt,
  reducer,
  type Action,
  type Bill,
  type State,
} from "@splitbill/core";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useReducer } from "react";
import { Alert } from "react-native";
import { State as GestureState } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";
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

test("swiping an unassigned row left moves it into the You section", () => {
  const bill = billFromReceipt(mockReceipt);
  const firstUnassigned = bill.items[0];
  render(<Harness initialBill={bill} />);
  act(() => {
    fireGestureHandler(getByGestureTestId(`row-${firstUnassigned.id}-pan`), [
      { state: GestureState.BEGAN, translationX: 0 },
      { state: GestureState.ACTIVE, translationX: -100 },
      { state: GestureState.END, translationX: -100 },
    ]);
  });
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

test("editing a row's name dispatches EDIT_NAME for that item", () => {
  const bill = billFromReceipt(mockReceipt);
  const first = bill.items[0];
  let lastAction: Action | undefined;
  const spy = jest.fn((action: Action) => {
    lastAction = action;
  });
  render(<BillReview bill={bill} dispatch={spy} onReset={() => {}} />);
  fireEvent.press(screen.getByTestId(`row-${first.id}-name-edit`));
  const input = screen.getByTestId(`row-${first.id}-name-input`);
  fireEvent.changeText(input, "Renamed item");
  fireEvent(input, "blur");
  expect(lastAction).toEqual({
    type: "EDIT_NAME",
    id: first.id,
    name: "Renamed item",
  });
});

test("New bill on a clean (all-unassigned) bill resets immediately, no Alert", () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const bill = billFromReceipt(mockReceipt); // all items unassigned
  const onReset = jest.fn();
  render(<Harness initialBill={bill} onReset={onReset} />);
  fireEvent.press(screen.getByTestId("bill-reset"));
  expect(alertSpy).not.toHaveBeenCalled();
  expect(onReset).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});

test("New bill on a dirty bill shows a confirm Alert; confirming calls onReset", () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const base = billFromReceipt(mockReceipt);
  const dirty: Bill = {
    ...base,
    items: base.items.map((it, i) =>
      i === 0 ? { ...it, assignee: "you" } : it,
    ),
  };
  const onReset = jest.fn();
  render(<BillReview bill={dirty} dispatch={() => {}} onReset={onReset} />);

  fireEvent.press(screen.getByTestId("bill-reset"));
  expect(alertSpy).toHaveBeenCalledTimes(1);
  // onReset not called until the destructive button fires.
  expect(onReset).not.toHaveBeenCalled();

  // Walk the buttons array the component passed and invoke "Start over".
  const buttons = alertSpy.mock.calls[0][2] as
    | { text?: string; onPress?: () => void }[]
    | undefined;
  const confirm = buttons?.find((b) => b.text === "Start over");
  confirm?.onPress?.();
  expect(onReset).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});
