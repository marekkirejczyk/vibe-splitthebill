import { theme } from "@splitbill/core";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
  testID?: string;
};

export function SecondaryButton({ label, icon, onPress, disabled, small, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.wrap,
        small ? styles.small : styles.regular,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        {icon}
        <Text style={[styles.label, small && styles.smallLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.border,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  regular: {
    height: 56,
    paddingHorizontal: theme.spacing.xxl,
  },
  small: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.color.text,
    fontSize: 17,
    fontWeight: "600",
  },
  smallLabel: {
    fontSize: 13,
    color: theme.color.muted,
  },
});
