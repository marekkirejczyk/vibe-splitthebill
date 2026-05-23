import {
  computeTotals,
  formatMoney,
  theme,
  type Bill,
} from "@splitbill/core";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// M2 smoke screen: proves Metro resolves @splitbill/core across the workspace
// (color swatches read from `theme`, totals computed by the pure reducer that
// the web app also uses). Real screens land in M3.
const sampleBill: Bill = {
  currency: "₹",
  items: [
    { id: "1", name: "Pav Bhaji", price: 235, assignee: "them" },
    { id: "2", name: "Butter Naan", price: 1595, assignee: "you" },
  ],
  extras: { tax: 91.5, tip: 0, service: 0 },
  inclusive: { tax: true, tip: false, service: false },
};

export default function Index() {
  const totals = computeTotals(sampleBill);
  const swatches = Object.entries(theme.color);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Split the Bill</Text>
        <Text style={styles.subtitle}>
          M2 smoke screen · @splitbill/core wired
        </Text>

        <Text style={styles.section}>Totals (from core)</Text>
        <View style={styles.row}>
          <Text style={[styles.money, { color: theme.color.you }]}>
            You {formatMoney(totals.you, sampleBill.currency)}
          </Text>
          <Text style={[styles.money, { color: theme.color.them }]}>
            Them {formatMoney(totals.them, sampleBill.currency)}
          </Text>
        </View>

        <Text style={styles.section}>Theme palette</Text>
        <View style={styles.palette}>
          {swatches.map(([name, hex]) => (
            <View key={name} style={styles.swatchRow}>
              <View style={[styles.swatch, { backgroundColor: hex }]} />
              <Text style={styles.swatchLabel}>{name}</Text>
              <Text style={styles.swatchHex}>{hex}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: theme.spacing.xxl, gap: theme.spacing.lg },
  h1: { ...theme.type.h1, color: theme.color.text },
  subtitle: { ...theme.type.label, color: theme.color.muted },
  section: {
    ...theme.type.label,
    color: theme.color.muted,
    marginTop: theme.spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: theme.color.card,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
  },
  money: { ...theme.type.moneyLg },
  palette: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  swatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  swatchLabel: { ...theme.type.body, color: theme.color.text, flex: 1 },
  swatchHex: { ...theme.type.label, color: theme.color.muted },
});
