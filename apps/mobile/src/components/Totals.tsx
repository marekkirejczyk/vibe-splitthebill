import { formatMoney, theme, type Totals as TotalsValue } from "@splitbill/core";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  totals: TotalsValue;
  currency: string;
};

export function Totals({ totals, currency }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: insets.bottom + theme.spacing.lg },
      ]}
      testID="totals-footer"
    >
      <LinearGradient
        colors={[theme.gradient.start, theme.gradient.end]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.hairline}
      />

      {totals.unassigned > 0 ? (
        <View style={styles.warnPill} testID="totals-warn-pill">
          <Text style={styles.warnIcon}>⚠️</Text>
          <Text style={styles.warnText}>
            {formatMoney(totals.unassigned, currency)} still unassigned
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>You</Text>
          <Text style={[styles.money, { color: theme.color.you }]} testID="totals-you">
            {formatMoney(totals.you, currency)}
          </Text>
        </View>
        <View style={[styles.col, styles.colRight]}>
          <Text style={styles.label}>Them</Text>
          <Text style={[styles.money, { color: theme.color.them }]} testID="totals-them">
            {formatMoney(totals.them, currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.card,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xxl,
    gap: theme.spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 12,
  },
  hairline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  warnPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.lg,
  },
  warnIcon: { fontSize: 14 },
  warnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.color.warnText,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  col: { gap: 2 },
  colRight: { alignItems: "flex-end" },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.color.muted,
  },
  money: {
    fontSize: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
