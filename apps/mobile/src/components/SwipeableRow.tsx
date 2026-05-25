import { formatMoney, theme, type Item } from "@splitbill/core";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { rowAccessibilityActions, swipeDescriptor } from "./swipeDescriptor";

const THRESHOLD = 70;
const CLAMP = 160;
const SPRING = { stiffness: 320, damping: 32 };

type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  onEditName?: (name: string) => void;
  onEditPrice?: (price: number) => void;
  testID?: string;
};

type Editing = "name" | "price" | null;

function clampWorklet(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

function fireHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function SwipeableRow({
  item,
  currency,
  onSwipe,
  onEditName,
  onEditPrice,
  testID,
}: Props) {
  const tx = useSharedValue(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");

  // Disable the pan while a TextInput is focused so the keyboard isn't
  // fighting the gesture and an accidental drag doesn't reassign the row.
  const pan = Gesture.Pan()
    .enabled(editing === null)
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

  // Android hardware back closes an open edit (no commit) + dismisses keyboard.
  useEffect(() => {
    if (editing === null) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setEditing(null);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  function startEditName() {
    setDraft(item.name);
    setEditing("name");
  }
  function startEditPrice() {
    setDraft(item.price.toFixed(2));
    setEditing("price");
  }
  function commitName() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.name) onEditName?.(trimmed);
    setEditing(null);
  }
  function commitPrice() {
    const parsed = parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== item.price) {
      onEditPrice?.(Math.round(parsed * 100) / 100);
    }
    setEditing(null);
  }

  const leftDir = useMemo(
    () => swipeDescriptor(item.assignee, "left"),
    [item.assignee],
  );
  const rightDir = useMemo(
    () => swipeDescriptor(item.assignee, "right"),
    [item.assignee],
  );
  const a11y = useMemo(
    () => rowAccessibilityActions(item.assignee),
    [item.assignee],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));
  const leftLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value > 0 ? Math.min(tx.value / THRESHOLD, 1) : 0,
  }));
  const rightLabelStyle = useAnimatedStyle(() => ({
    opacity: tx.value < 0 ? Math.min(-tx.value / THRESHOLD, 1) : 0,
  }));

  const assigned = item.assignee !== null;

  return (
    <Animated.View
      style={styles.wrap}
      testID={testID}
      layout={LinearTransition.springify().damping(18)}
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
    >
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
          accessibilityActions={a11y.actions}
          onAccessibilityAction={(e) => {
            const dir = a11y.directionFor[e.nativeEvent.actionName];
            if (dir) {
              onSwipe(dir);
              fireHaptic();
            }
          }}
          style={[
            styles.row,
            assigned ? styles.assignedRow : styles.unassignedRow,
            rowStyle,
          ]}
        >
          {editing === "name" ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commitName}
              onSubmitEditing={commitName}
              autoFocus
              selectTextOnFocus
              blurOnSubmit
              returnKeyType="done"
              style={styles.nameInput}
              testID={`${testID ?? "row"}-name-input`}
            />
          ) : (
            <Pressable
              onPress={startEditName}
              style={styles.namePress}
              testID={`${testID ?? "row"}-name-edit`}
            >
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}

          <View style={styles.spacer} />

          {editing === "price" ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commitPrice}
              onSubmitEditing={commitPrice}
              autoFocus
              selectTextOnFocus
              blurOnSubmit
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={styles.priceInput}
              testID={`${testID ?? "row"}-price-input`}
            />
          ) : (
            <Pressable
              onPress={startEditPrice}
              testID={`${testID ?? "row"}-price-edit`}
            >
              <Text style={styles.price}>{formatMoney(item.price, currency)}</Text>
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
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
  namePress: { flexShrink: 1 },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.color.text,
    flexShrink: 1,
  },
  nameInput: {
    flexShrink: 1,
    flexGrow: 1,
    fontSize: 15,
    fontWeight: "600",
    color: theme.color.text,
    padding: 0,
  },
  spacer: { flex: 1 },
  price: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.color.text,
    fontVariant: ["tabular-nums"],
  },
  priceInput: {
    minWidth: 72,
    fontSize: 15,
    fontWeight: "700",
    color: theme.color.text,
    textAlign: "right",
    padding: 0,
    fontVariant: ["tabular-nums"],
  },
});
