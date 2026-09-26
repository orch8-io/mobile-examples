// The Expo quick start from engine/docs/MOBILE_SDK.md, kept here so
// `npm run typecheck` proves it compiles against the published SDK.
// It is not used by the app (the app manages its engine as a singleton, see
// src/engine/runtime.ts). Keep the two in sync.

import { useEffect } from "react";
import { Button } from "react-native";
import * as FileSystem from "expo-file-system";
import { Orch8Provider, useOrch8, useNativeEngine, useNativeWorkflow } from "@orch8.io/expo";
import sequence from "../../workflows/field-inspection-offline.json";

const dbPath = `${FileSystem.documentDirectory!.replace("file://", "")}orch8.db`;
const Ready = () => (useOrch8().engine ? <Inspect /> : null); // engine opens after first render
export default () => <Orch8Provider nativeConfig={{ dbPath }}><Ready /></Orch8Provider>;

function Inspect() {
  const engine = useNativeEngine();
  const { start, pendingSteps, completeStep } = useNativeWorkflow();
  useEffect(() => engine.loadSequenceFromJson(sequence), [engine]);
  const step = pendingSteps[0]; // a step parked on wait_for_input
  return step
    ? <Button title={`Complete ${step.stepName}`} onPress={() => completeStep(step.instanceId, step.stepName, { value: "complete" })} />
    : <Button title="Start" onPress={() => start("field-inspection-offline", { site_id: "A-12" }, "insp:A-12")} />;
}
