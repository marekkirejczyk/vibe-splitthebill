import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Split the Bill",
  slug: "splitbill",
  scheme: "splitbill",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  // Tie OTA-update compatibility to the app version. EAS Update isn't wired in
  // M8, but setting the policy now avoids a config migration when it is.
  runtimeVersion: { policy: "appVersion" },
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.splitbill.app",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "Take a photo of your receipt so we can split it.",
      NSPhotoLibraryUsageDescription:
        "Pick a photo of your receipt so we can split it.",
    },
  },
  android: {
    package: "com.splitbill.app",
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#f5f5f4",
      },
    ],
  ],
  extra: {
    // Defaults to the deployed Vercel URL once known; override per env via
    // EXPO_PUBLIC_API_BASE_URL. Mobile always calls the hosted /api/extract
    // so the Anthropic key stays server-side.
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      "https://vibe-splitthebill.vercel.app",
    // Shared secret sent as x-splitbill-key to the gated /api/extract. Set per
    // build via an EAS secret (EXPO_PUBLIC_API_SECRET), never committed; unset
    // in dev, where the server gate is also off.
    apiSecret: process.env.EXPO_PUBLIC_API_SECRET,
  },
};

export default config;
