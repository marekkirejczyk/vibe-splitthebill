import { theme } from "@splitbill/core";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

type Props = {
  message: string;
  onRetry?: () => void;
  onStartOver: () => void;
};

export function ErrorScreen({ message, onRetry, onStartOver }: Props) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <View style={styles.warnCard}>
          <Text style={styles.icon}>⚠️</Text>
        </View>
        <Text style={styles.title}>Hmm, we hit a snag</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.flexSpacer} />

        <View style={styles.ctas}>
          {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} testID="error-retry" /> : null}
          <SecondaryButton label="Pick a different photo" onPress={onStartOver} testID="error-start-over" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xxxl,
    paddingBottom: theme.spacing.xxl,
    alignItems: "center",
  },
  warnCard: {
    backgroundColor: theme.color.warnBg,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xxl,
    marginBottom: theme.spacing.xl,
  },
  icon: { fontSize: 64, lineHeight: 70 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.color.text,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  message: {
    fontSize: 15,
    fontWeight: "500",
    color: theme.color.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  flexSpacer: { flex: 1 },
  ctas: {
    width: "100%",
    gap: theme.spacing.md,
  },
});
