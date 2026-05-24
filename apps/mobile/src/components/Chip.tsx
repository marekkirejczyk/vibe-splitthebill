import { theme } from "@splitbill/core";
import { StyleSheet, Text, View } from "react-native";

export type ChipTone = "neutral" | "you" | "them";

type Props = {
  label: string;
  count: number;
  total?: string;
  tone: ChipTone;
  testID?: string;
};

const tones: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: "#e5e7eb", fg: "#4b5563" },
  you: { bg: theme.color.youFaint, fg: theme.color.you },
  them: { bg: theme.color.themFaint, fg: theme.color.them },
};

export function Chip({ label, count, total, tone, testID }: Props) {
  const palette = tones[tone];
  const itemsLabel = `${count} ${count === 1 ? "item" : "items"}`;
  return (
    <View
      testID={testID}
      style={[styles.chip, { backgroundColor: palette.bg }]}
    >
      <Text style={[styles.text, styles.bold, { color: palette.fg }]}>{label}</Text>
      <Text style={[styles.text, { color: palette.fg }]}>·</Text>
      <Text style={[styles.text, { color: palette.fg }]}>{itemsLabel}</Text>
      {total ? (
        <>
          <Text style={[styles.text, { color: palette.fg }]}>·</Text>
          <Text style={[styles.text, styles.bold, { color: palette.fg }]}>{total}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
  bold: {
    fontWeight: "700",
  },
});
