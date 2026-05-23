module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimated/plugin MUST stay last in the plugin array.
    plugins: ["react-native-reanimated/plugin"],
  };
};
