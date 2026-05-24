import "react-native-gesture-handler/jestSetup";

// Reanimated ships an official mock for the JS-driven shared-value APIs.
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  // The mock returns undefined for `call`; tests don't use it but the
  // animated component fallback expects it to be callable.
  Reanimated.default.call = () => {};
  return Reanimated;
});

// expo-linear-gradient renders its native view, which jest can't resolve.
// Stub with a plain View so screenshot tests still see the children.
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

// useSafeAreaInsets returns zeroes in tests; SafeAreaProvider is a passthrough.
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
