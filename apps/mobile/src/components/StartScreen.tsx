import { theme } from "@splitbill/core";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

type Props = {
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
  onSimulateError?: () => void; // dev-only hatch so designers can reach ErrorScreen; removed in M4
};

export function StartScreen({ onTakePhoto, onChooseLibrary, onSimulateError }: Props) {
  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.blobWrap} pointerEvents="none">
        <LinearGradient
          colors={["rgba(251, 146, 60, 0.55)", "rgba(236, 72, 153, 0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.blob}
        />
      </View>

      <View style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🧾</Text>
        </View>
        <Text style={styles.title}>Split the bill</Text>
        <Text style={styles.subtitle}>
          Snap your receipt, swipe each item to assign it, and watch the per-person totals settle.
        </Text>
      </View>

      <View style={styles.ctaStack}>
        <PrimaryButton
          label="📷  Take photo"
          onPress={onTakePhoto}
          testID="start-take-photo"
        />
        <SecondaryButton
          label="🖼  Choose from library"
          onPress={onChooseLibrary}
          testID="start-choose-library"
        />
        <Text style={styles.privacy}>
          Photo sent to Anthropic to read line items, then discarded.
        </Text>
        {onSimulateError ? (
          <Pressable onPress={onSimulateError} style={styles.devHatch} testID="start-show-error">
            <Text style={styles.devHatchLabel}>Show error state (dev)</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.color.bg,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xxxl,
    paddingBottom: theme.spacing.xxl,
  },
  blobWrap: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    height: 360,
    alignItems: "center",
  },
  blob: {
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  hero: {
    alignItems: "center",
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: 44,
    ...theme.shadow.card,
  },
  emoji: { fontSize: 96, lineHeight: 100 },
  title: {
    fontSize: 38,
    fontWeight: "700",
    color: theme.color.text,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.color.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  ctaStack: {
    marginTop: "auto",
    gap: theme.spacing.md,
  },
  privacy: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.color.muted,
    textAlign: "center",
    lineHeight: 16,
    marginTop: theme.spacing.xs,
  },
  devHatch: {
    alignItems: "center",
    paddingTop: theme.spacing.sm,
  },
  devHatchLabel: {
    fontSize: 11,
    color: theme.color.muted,
    textDecorationLine: "underline",
  },
});
