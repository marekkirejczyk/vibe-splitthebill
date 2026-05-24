module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/", "/e2e/", "/web-dist/"],
  // Reanimated v4 pulls in react-native-worklets, whose .native.ts modules
  // crash under node. The package ships a custom resolver that strips the
  // .native extension when resolving anything under react-native-worklets.
  resolver: "react-native-worklets/jest/resolver",
};
