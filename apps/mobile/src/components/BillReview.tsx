import {
  computeTotals,
  theme,
  type Action,
  type Bill,
  type InclusiveFlags,
} from "@splitbill/core";
import type { Dispatch } from "react";
import { useMemo } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Chip } from "./Chip";
import { InclusiveToggleRow } from "./InclusiveToggleRow";
import { SecondaryButton } from "./SecondaryButton";
import { SwipeableRow } from "./SwipeableRow";
import { Totals } from "./Totals";

type Props = {
  bill: Bill;
  dispatch: Dispatch<Action>;
  onReset: () => void;
};

const FOOTER_RESERVE = 168;

function formatPrice(price: number, currency: string) {
  return `${currency}${price.toFixed(2)}`;
}

export function BillReview({ bill, dispatch, onReset }: Props) {
  const insets = useSafeAreaInsets();
  const totals = useMemo(() => computeTotals(bill), [bill]);

  const unassigned = bill.items.filter((it) => it.assignee === null);
  const you = bill.items.filter((it) => it.assignee === "you");
  const them = bill.items.filter((it) => it.assignee === "them");

  const subYou = you.reduce((a, it) => a + it.price, 0);
  const subThem = them.reduce((a, it) => a + it.price, 0);
  const subU = unassigned.reduce((a, it) => a + it.price, 0);

  const togglesVisible =
    bill.extras.tax > 0 || bill.extras.tip > 0 || bill.extras.service > 0;

  // Confirm before clearing only if work would be lost — a fresh, untouched
  // bill resets immediately (no thumb-fumble guard needed).
  function handleReset() {
    const hasAssignment = bill.items.some((it) => it.assignee !== null);
    if (!hasAssignment) {
      onReset();
      return;
    }
    Alert.alert("Start over?", "This clears your bill.", [
      { text: "Cancel", style: "cancel" },
      { text: "Start over", style: "destructive", onPress: onReset },
    ]);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Split the bill</Text>
        <SecondaryButton label="↻ New bill" small onPress={handleReset} testID="bill-reset" />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: FOOTER_RESERVE + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {togglesVisible ? (
          <View style={styles.togglesSection}>
            <Text style={styles.toggleCaption}>CHARGES ALREADY IN PRICES</Text>
            <View style={styles.togglesStack}>
              {(["tax", "tip", "service"] as (keyof InclusiveFlags)[]).map((kind) =>
                bill.extras[kind] > 0 ? (
                  <InclusiveToggleRow
                    key={kind}
                    label={`${kind[0].toUpperCase()}${kind.slice(1)} already in prices`}
                    value={formatPrice(bill.extras[kind], bill.currency)}
                    on={bill.inclusive[kind]}
                    onValueChange={(value) =>
                      dispatch({ type: "SET_INCLUSIVE", kind, value })
                    }
                    testID={`toggle-${kind}`}
                  />
                ) : null,
              )}
            </View>
          </View>
        ) : null}

        {unassigned.length > 0 ? (
          <Animated.View style={styles.section} testID="section-unassigned" entering={FadeIn} exiting={FadeOut}>
            <Chip
              label="Unassigned"
              count={unassigned.length}
              total={formatPrice(subU, bill.currency)}
              tone="neutral"
            />
            <View style={styles.itemList}>
              {unassigned.map((item) => (
                <SwipeableRow
                  key={item.id}
                  item={item}
                  currency={bill.currency}
                  onSwipe={(direction) => dispatch({ type: "SWIPE", id: item.id, direction })}
                  onEditName={(name) => dispatch({ type: "EDIT_NAME", id: item.id, name })}
                  onEditPrice={(price) => dispatch({ type: "EDIT_PRICE", id: item.id, price })}
                  testID={`row-${item.id}`}
                />
              ))}
            </View>
          </Animated.View>
        ) : null}

        {you.length > 0 ? (
          <Animated.View style={styles.section} testID="section-you" entering={FadeIn} exiting={FadeOut}>
            <Chip
              label="You"
              count={you.length}
              total={formatPrice(subYou, bill.currency)}
              tone="you"
            />
            <View style={styles.itemList}>
              {you.map((item) => (
                <SwipeableRow
                  key={item.id}
                  item={item}
                  currency={bill.currency}
                  onSwipe={(direction) => dispatch({ type: "SWIPE", id: item.id, direction })}
                  onEditName={(name) => dispatch({ type: "EDIT_NAME", id: item.id, name })}
                  onEditPrice={(price) => dispatch({ type: "EDIT_PRICE", id: item.id, price })}
                  testID={`row-${item.id}`}
                />
              ))}
            </View>
          </Animated.View>
        ) : null}

        {them.length > 0 ? (
          <Animated.View style={styles.section} testID="section-them" entering={FadeIn} exiting={FadeOut}>
            <Chip
              label="Them"
              count={them.length}
              total={formatPrice(subThem, bill.currency)}
              tone="them"
            />
            <View style={styles.itemList}>
              {them.map((item) => (
                <SwipeableRow
                  key={item.id}
                  item={item}
                  currency={bill.currency}
                  onSwipe={(direction) => dispatch({ type: "SWIPE", id: item.id, direction })}
                  onEditName={(name) => dispatch({ type: "EDIT_NAME", id: item.id, name })}
                  onEditPrice={(price) => dispatch({ type: "EDIT_PRICE", id: item.id, price })}
                  testID={`row-${item.id}`}
                />
              ))}
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      <Totals totals={totals} currency={bill.currency} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.color.text,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  togglesSection: {
    gap: theme.spacing.sm,
  },
  toggleCaption: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.color.muted,
    letterSpacing: 0.8,
  },
  togglesStack: {
    gap: theme.spacing.sm,
  },
  section: {
    gap: theme.spacing.sm,
  },
  itemList: {
    gap: theme.spacing.sm,
  },
});
