import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Split the Bill",
  slug: "splitbill",
  scheme: "splitbill",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
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
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f5f5f4",
    },
  },
  plugins: ["expo-router"],
  extra: {
    // Defaults to the deployed Vercel URL once known; override per env via
    // EXPO_PUBLIC_API_BASE_URL. Mobile always calls the hosted /api/extract
    // so the Anthropic key stays server-side.
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      "https://vibe-splitthebill.vercel.app",
  },
};

export default config;
