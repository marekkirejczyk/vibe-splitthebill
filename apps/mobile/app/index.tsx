import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { BillReview } from "../src/components/BillReview";
import { ErrorScreen } from "../src/components/ErrorScreen";
import { LoadingScreen } from "../src/components/LoadingScreen";
import { StartScreen } from "../src/components/StartScreen";
import { delayedExtract } from "../src/fixtures/mockBill";
import { useBillStore } from "../src/hooks/useBillStore";
import {
  extractFromPicker,
  PermissionDeniedError,
  PickerCancelledError,
  type PickerSource,
} from "../src/lib/extractFromPicker";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function Index() {
  const [state, dispatch] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function loadReceipt(source: PickerSource) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "loading" });
    try {
      // Web export has no native picker; keep the M3 mock reachable so the
      // Playwright smoke (apps/mobile/e2e/smoke.spec.ts) keeps exercising the
      // loading / bill / error visual states. Native always hits the real flow.
      const receipt =
        Platform.OS === "web"
          ? await delayedExtract()
          : await extractFromPicker(source, { signal: ctrl.signal });
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (err) {
      if (err instanceof PickerCancelledError) {
        setPhase({ kind: "idle" });
        return;
      }
      if (err instanceof Error && err.name === "AbortError") {
        setPhase({ kind: "idle" });
        return;
      }
      if (err instanceof PermissionDeniedError) {
        setPhase({ kind: "idle" });
        const isCamera = err.source === "camera";
        Alert.alert(
          isCamera ? "Camera access needed" : "Photo library access needed",
          isCamera
            ? "Enable camera access in Settings to snap a receipt."
            : "Enable photo library access in Settings to pick a receipt.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  function requestCancel() {
    Alert.alert(
      "Stop reading receipt?",
      "We'll stop the upload and you can pick another photo.",
      [
        { text: "Keep reading", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: () => abortRef.current?.abort(),
        },
      ],
    );
  }

  if (phase.kind === "loading") {
    return <LoadingScreen onCancel={requestCancel} />;
  }

  if (phase.kind === "error") {
    // M4: retry kicks back to Start because the picked asset's temp URI may
    // have been cleaned up. M5 swap to a stale-URI retry would need the
    // orchestrator to expose the URI; not worth it pre-AsyncStorage.
    return (
      <ErrorScreen
        message={phase.message}
        onRetry={undefined}
        onStartOver={() => setPhase({ kind: "idle" })}
      />
    );
  }

  if (state.bill) {
    return (
      <BillReview
        bill={state.bill}
        dispatch={dispatch}
        onReset={() => dispatch({ type: "RESET" })}
      />
    );
  }

  return (
    <StartScreen
      onTakePhoto={() => loadReceipt("camera")}
      onChooseLibrary={() => loadReceipt("library")}
    />
  );
}
