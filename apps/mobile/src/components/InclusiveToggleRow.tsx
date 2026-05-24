import { theme } from "@splitbill/core";
import { StyleSheet, Switch, Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
  on: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
};

export function InclusiveToggleRow({ label, value, on, onValueChange, testID }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        <Text style={styles.value}>{value}</Text>
        <Switch
          value={on}
          onValueChange={onValueChange}
          trackColor={{ true: theme.color.assignBorder, false: theme.color.border }}
          accessibilityLabel={`${label} toggle`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.color.card,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.color.text,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  value: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.color.muted,
  },
});
