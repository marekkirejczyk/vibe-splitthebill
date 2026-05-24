import { theme } from "@splitbill/core";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

export function PrimaryButton({ label, icon, onPress, disabled, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [styles.wrap, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <LinearGradient
        colors={[theme.gradient.start, theme.gradient.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.row}>
          {icon}
          <Text style={styles.label}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.pill,
    ...theme.shadow.cta,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  gradient: {
    height: 56,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xxl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  label: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
});
