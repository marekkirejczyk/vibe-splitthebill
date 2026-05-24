import { formatMoney, theme, type Item } from "@splitbill/core";
import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { swipeDescriptor } from "./swipeDescriptor";

const THRESHOLD = 70;
const CLAMP = 160;
const SPRING = { stiffness: 320, damping: 32 };

type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  // M6 wires these to TextInput swap-in on tap-of-name / tap-of-price.
  onEditName?: (name: string) => void;
  onEditPrice?: (price: number) => void;
  testID?: string;
};

function clampWorklet(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function fireHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function SwipeableRow({ item, currency, onSwipe, testID }: Props) {
  const tx = useSharedValue(0);

  // Pre-compute both underlay descriptors outside the worklet — they only
  // depend on item.assignee, and the worklet shouldn't snapshot React props.
  const leftDir = useMemo(
    () => swipeDescriptor(item.assignee, "left"),
    [item.assignee],
  );
  const rightDir = useMemo(
    () => swipeDescriptor(item.assignee, "right"),
    [item.assignee],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .withTestId(`${testID ?? "row"}-pan`)
    .onUpdate((e) => {
      tx.value = clampWorklet(e.translationX, -CLAMP, CLAMP);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > THRESHOLD) {
        const dir = e.translationX < 0 ? "left" : "right";
        runOnJS(onSwipe)(dir);
        runOnJS(fireHaptic)();
      }
      tx.value = withSpring(0, SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  // Left-aligned underlay shows when dragging RIGHT (tx > 0) — describes
  // what a right-commit would do. Right-aligned underlay shows when
  // dragging LEFT (tx < 0). Opacity ramps 0 → 1 over [0, THRESHOLD].
  const leftLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value > 0 ? Math.min(tx.value / THRESHOLD, 1) : 0,
  }));
  const rightLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value < 0 ? Math.min(-tx.value / THRESHOLD, 1) : 0,
  }));

  const assigned = item.assignee !== null;

  return (
    <View style={styles.wrap} testID={testID}>
      <Animated.View
        style={[
          styles.underlay,
          styles.underlayLeft,
          { backgroundColor: rightDir.color },
          leftLabelStyle,
        ]}
        pointerEvents="none"
      >
        <Text style={styles.underlayLabel}>{rightDir.label}</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.underlay,
          styles.underlayRight,
          { backgroundColor: leftDir.color },
          rightLabelStyle,
        ]}
        pointerEvents="none"
      >
        <Text style={styles.underlayLabel}>{leftDir.label}</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${formatMoney(item.price, currency)}, ${item.assignee ?? "unassigned"}`}
          style={[
            styles.row,
            assigned ? styles.assignedRow : styles.unassignedRow,
            rowStyle,
          ]}
        >
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.spacer} />
          <Text style={styles.price}>{formatMoney(item.price, currency)}</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  underlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: theme.radius.lg,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  underlayLeft: { alignItems: "flex-start" },
  underlayRight: { alignItems: "flex-end" },
  underlayLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  unassignedRow: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.border,
  },
  assignedRow: {
    backgroundColor: theme.color.assignBg,
    borderColor: theme.color.assignBorder,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.color.text,
    flexShrink: 1,
  },
  spacer: { flex: 1 },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.color.text,
    fontVariant: ["tabular-nums"],
  },
});
