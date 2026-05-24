import { theme, type Assignee, type Item } from "@splitbill/core";
import { Pressable, StyleSheet, Text, View } from "react-native";

// M3 placeholder: tap to cycle assignment (null → you → them → null).
// M5 swaps the Pressable wrapper for GestureDetector + Reanimated Pan
// with an underlay and haptic feedback. Public props are designed for M5,
// so the swap doesn't ripple into callers.
type Props = {
  item: Item;
  currency: string;
  onSwipe: (direction: "left" | "right") => void;
  onEditName?: (name: string) => void; // wired in M6
  onEditPrice?: (price: number) => void; // wired in M6
  testID?: string;
};

// Picks the swipe direction that walks the assignee state machine forward
// one step in the cycle null → you → them → null. Reuses the existing
// nextAssignee transitions from @splitbill/core via the SWIPE action, so
// the M3 stand-in stays bit-identical with the gesture-driven version.
export function cycleDirection(assignee: Assignee): "left" | "right" {
  if (assignee === null) return "left"; // null + left → you
  if (assignee === "you") return "right"; // you + right → them
  return "right"; // them + right → null
}

function formatPrice(price: number, currency: string) {
  return `${currency}${price.toFixed(2)}`;
}

export function SwipeableRow({ item, currency, onSwipe, testID }: Props) {
  const assigned = item.assignee !== null;
  return (
    <Pressable
      onPress={() => onSwipe(cycleDirection(item.assignee))}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatPrice(item.price, currency)}, ${item.assignee ?? "unassigned"}`}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        assigned ? styles.assignedRow : styles.unassignedRow,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>
      <View style={styles.spacer} />
      <Text style={styles.price}>{formatPrice(item.price, currency)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  pressed: { opacity: 0.7 },
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
