import { useState } from "react";
import { BillReview } from "../src/components/BillReview";
import { ErrorScreen } from "../src/components/ErrorScreen";
import { LoadingScreen } from "../src/components/LoadingScreen";
import { StartScreen } from "../src/components/StartScreen";
import { delayedExtract } from "../src/fixtures/mockBill";
import { useBillStore } from "../src/hooks/useBillStore";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export default function Index() {
  const [state, dispatch] = useBillStore();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function loadMock() {
    setPhase({ kind: "loading" });
    try {
      const receipt = await delayedExtract();
      dispatch({ type: "LOAD_RECEIPT", receipt });
      setPhase({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setPhase({ kind: "error", message });
    }
  }

  if (phase.kind === "loading") {
    return <LoadingScreen onCancel={() => setPhase({ kind: "idle" })} />;
  }

  if (phase.kind === "error") {
    return (
      <ErrorScreen
        message={phase.message}
        onRetry={loadMock}
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
      onTakePhoto={loadMock}
      onChooseLibrary={loadMock}
      onSimulateError={() =>
        setPhase({ kind: "error", message: "Mock error for design review." })
      }
    />
  );
}
