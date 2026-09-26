// One NativeEngine per process, shared by the UI and background tasks.
//
// The app does not pass `nativeConfig` to <Orch8Provider>. The provider ties
// the engine's lifetime to the React tree, while background-fetch and push
// tasks also need the engine, sometimes before any screen mounts. Two
// engines on one SQLite file must never exist, so the engine lives here.

import { NativeEngine, type NativeEngineConfig, type NativeEngineEvent } from "@orch8.io/expo";
import * as Notifications from "expo-notifications";

import { INSTANCE_LIFETIME_SECS, config, serverConfigured } from "../config";
import { DEVICE_SEQUENCE, HANDLERS } from "../lib/inspection";
import deviceSequence from "../../workflows/field-inspection-offline.json";
import { getDeviceId, initStorage, paths } from "./store";

type Listener = (event: NativeEngineEvent) => void;

let enginePromise: Promise<NativeEngine> | null = null;
const listeners = new Set<Listener>();

export function nativeConfig(deviceId: string): NativeEngineConfig {
  return {
    tickIntervalMs: 500,
    maxConcurrentInstances: 20,
    maxInstanceLifetimeSecs: INSTANCE_LIFETIME_SECS,
    telemetryEnabled: false, // this app sends no engine telemetry; see STORE_LISTING.md
    environment: "production",
    deviceId,
    // Status, approval requests and server commands flow through /mobile/sync
    // only when a server is configured. Otherwise the app runs fully offline.
    ...(serverConfigured
      ? { syncUrl: `${config.serverUrl}/mobile/sync`, syncApiKey: config.apiKey }
      : {}),
  };
}

export function getEngine(): Promise<NativeEngine> {
  enginePromise ??= (async () => {
    await initStorage();
    const deviceId = await getDeviceId();
    const engine = new NativeEngine();
    engine.create(paths.engineDb, nativeConfig(deviceId));
    bootstrap(engine);
    return engine;
  })().catch((error: unknown) => {
    enginePromise = null; // allow a retry after e.g. a transient storage error
    throw error;
  });
  return enginePromise;
}

function bootstrap(engine: NativeEngine): void {
  const loaded = engine.loadedSequences().some((s) => s.name === DEVICE_SEQUENCE && s.version === deviceSequence.version);
  if (!loaded) engine.loadSequenceFromJson(JSON.stringify(deviceSequence));

  // Every handler named by the sequence must exist on the device, or the
  // engine would hand the step to an external worker queue that never runs.
  // @orch8.io/expo handlers are fire-and-forget: they return {} immediately
  // and emit `handlerInvoked`. All user input goes through wait_for_input
  // plus completeStep().
  for (const name of HANDLERS) engine.registerHandler(name);

  engine.addListener("onEngineEvent", (event) => {
    void onEngineEvent(event);
    for (const listener of listeners) listener(event);
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function onEngineEvent(event: NativeEngineEvent): Promise<void> {
  if (event.type !== "handlerInvoked") return;
  const params = safeParse(event.params);
  if (event.handlerName === "finalize_report") {
    await notifyLocal("Inspection approved", "Your supervisor approved the inspection report.");
  } else if (event.handlerName === "notify_inspector") {
    const outcome = params["outcome"] === "changes_requested" ? "Changes requested" : "Inspection rejected";
    await notifyLocal(outcome, "Open the app to see the supervisor's decision.");
  }
  // queue_evidence_upload is handled by the online sync loop (src/sync/online.ts),
  // which retries until each photo is accepted, so nothing is lost offline.
}

async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // Notifications permission denied: the status screen still shows the outcome.
  }
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
