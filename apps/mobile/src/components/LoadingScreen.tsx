import { theme } from "@splitbill/core";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = { onCancel: () => void };

export function LoadingScreen({ onCancel }: Props) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
    );
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.skeleton}>
          <View style={[styles.bar, { width: 160, height: 14 }]} />
          <View style={[styles.bar, { width: 90, height: 10, backgroundColor: "#eef0f2" }]} />
          <View style={styles.divider} />
          {[180, 140, 200, 130, 170].map((w, i) => (
            <View key={i} style={styles.skelRow}>
              <View style={[styles.bar, { width: w, height: 12 }]} />
              <View style={styles.flex} />
              <View style={[styles.bar, { width: 48, height: 12, backgroundColor: "#d1d5db" }]} />
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.skelRow}>
            <View style={[styles.bar, { width: 70, height: 14, backgroundColor: "#9ca3af" }]} />
            <View style={styles.flex} />
            <View style={[styles.bar, { width: 72, height: 16, backgroundColor: "#9ca3af" }]} />
          </View>
        </View>

        <View style={styles.spinWrap}>
          <Animated.View style={[styles.spinner, spinStyle]} testID="loading-spinner">
            <View style={styles.spinnerRing} />
            <View style={styles.spinnerCap} />
          </Animated.View>
          <Text style={styles.title}>Reading your receipt…</Text>
          <Text style={styles.subtitle}>Claude is identifying items and prices.</Text>
        </View>

        <View style={styles.flexSpacer} />

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          testID="loading-cancel"
          style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: {
    // SafeAreaView already insets the top edge; keep this pad modest so the
    // two don't stack into an oversized gap on notched / Dynamic Island devices.
    flex: 1,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    alignItems: "center",
    gap: theme.spacing.xxl,
  },
  skeleton: {
    width: "100%",
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  bar: {
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
  },
  divider: { height: 1, backgroundColor: "#f3f4f6", marginVertical: theme.spacing.xs },
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  flex: { flex: 1 },
  spinWrap: {
    alignItems: "center",
    gap: theme.spacing.md,
  },
  spinner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 5,
    borderColor: theme.color.youFaint,
    borderTopColor: theme.gradient.start,
    borderRightColor: theme.gradient.end,
  },
  spinnerCap: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.gradient.end,
    position: "absolute",
    top: 0,
    left: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.color.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.color.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  flexSpacer: { flex: 1 },
  cancel: {
    width: "100%",
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  cancelPressed: { opacity: 0.5 },
  cancelLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.color.muted,
  },
});
