import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StorageAdapter } from "@splitbill/core";

// The mobile implementation of the shared StorageAdapter contract. Web uses
// localStorage (apps/web/src/lib/useBillStore.ts); mobile uses AsyncStorage,
// which survives app kill + restart and is cleared on uninstall.
export const asyncStorageAdapter: StorageAdapter = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
