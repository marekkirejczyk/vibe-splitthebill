import { billFromReceipt, STORAGE_KEY, type State } from "@splitbill/core";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { mockReceipt } from "../fixtures/mockBill";

// Back the adapter with an in-memory map. The adapter itself is three
// passthrough calls to AsyncStorage; the logic worth testing lives in the
// hook (hydration ordering, save-after-hydrate, corrupted-JSON fallback,
// legacy migration), so we mock at the adapter boundary.
const mockStore = new Map<string, string>();
jest.mock("../lib/asyncStorageAdapter", () => ({
  asyncStorageAdapter: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(mockStore.has(key) ? mockStore.get(key)! : null),
    ),
    setItem: jest.fn((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    }),
  },
}));

import { asyncStorageAdapter } from "../lib/asyncStorageAdapter";
import { useBillStore } from "./useBillStore";

const setItemSpy = asyncStorageAdapter.setItem as jest.Mock;

beforeEach(() => {
  mockStore.clear();
  setItemSpy.mockClear();
  (asyncStorageAdapter.getItem as jest.Mock).mockClear();
});

test("cold start with empty storage: hydrates to null bill, no early write", async () => {
  const { result } = renderHook(() => useBillStore());
  // hydrated starts false.
  expect(result.current[2]).toBe(false);
  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0].bill).toBeNull();
  // After hydration the save effect runs once, persisting the unchanged
  // initialState ({ bill: null }). The pre-hydration write guard is covered
  // separately below.
  await waitFor(() => {
    const raw = mockStore.get(STORAGE_KEY);
    expect(raw && (JSON.parse(raw) as State).bill).toBeNull();
  });
});

test("cold start with a persisted bill: rehydrates it", async () => {
  const bill = billFromReceipt(mockReceipt);
  mockStore.set(STORAGE_KEY, JSON.stringify({ bill } as State));

  const { result } = renderHook(() => useBillStore());
  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0].bill).not.toBeNull();
  expect(result.current[0].bill?.items.length).toBe(bill.items.length);
  expect(result.current[0].bill?.currency).toBe(bill.currency);
});

test("dispatch after hydration writes the new state to storage", async () => {
  const { result } = renderHook(() => useBillStore());
  await waitFor(() => expect(result.current[2]).toBe(true));
  setItemSpy.mockClear();

  act(() => {
    result.current[1]({ type: "LOAD_RECEIPT", receipt: mockReceipt });
  });

  await waitFor(() => {
    expect(setItemSpy).toHaveBeenCalled();
  });
  const lastWrite = JSON.parse(
    setItemSpy.mock.calls[setItemSpy.mock.calls.length - 1][1],
  ) as State;
  expect(lastWrite.bill).not.toBeNull();
  expect(lastWrite.bill?.items.length).toBeGreaterThan(0);
});

test("no write happens before hydration completes", async () => {
  // Seed storage so hydration would dispatch REHYDRATE; assert that during
  // the very first render (hydrated false) we never call setItem — otherwise
  // we'd clobber the persisted bill with initialState.
  mockStore.set(STORAGE_KEY, JSON.stringify({ bill: billFromReceipt(mockReceipt) }));
  const { result } = renderHook(() => useBillStore());
  expect(result.current[2]).toBe(false);
  expect(setItemSpy).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current[2]).toBe(true));
});

test("corrupted JSON in storage falls back to initialState without crashing", async () => {
  mockStore.set(STORAGE_KEY, "not-json{{{");
  const { result } = renderHook(() => useBillStore());
  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0].bill).toBeNull();
});

test("legacy taxIncluded shape is migrated on REHYDRATE", async () => {
  const bill = billFromReceipt(mockReceipt);
  // Simulate a pre-inclusive-flags persisted bill: drop `inclusive`, set the
  // old single boolean. The core REHYDRATE migration should fold it in.
  const legacy = { ...bill, taxIncluded: true } as Record<string, unknown>;
  delete legacy.inclusive;
  mockStore.set(STORAGE_KEY, JSON.stringify({ bill: legacy }));

  const { result } = renderHook(() => useBillStore());
  await waitFor(() => expect(result.current[2]).toBe(true));
  expect(result.current[0].bill?.inclusive.tax).toBe(true);
});
