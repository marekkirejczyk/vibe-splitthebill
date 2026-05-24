module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
};
