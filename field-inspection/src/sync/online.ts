// Everything that needs the network. Each task is idempotent, so it is safe
// to run on every reconnect, foreground, push and background window.
//
// 1. Device registration (with the native push token) -> POST /mobile/devices/register
// 2. Evidence upload -> PUT {evidenceUploadUrl}/{sha256}
// 3. Supervisor review request -> server `field-inspection-review` instance
//    (idempotency key = device instance id)
//
// Status updates and the on-device approval request itself are sent by the
// engine's built-in SyncReporter over /mobile/sync (outbox, retried).

import { Orch8Client } from "@orch8.io/expo";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

import { config, serverConfigured } from "../config";
import { getEngine } from "../engine/runtime";
import { listRecords, patchRecord, getDeviceId } from "../engine/store";
import { loadInspection } from "../engine/inspections";
import { SERVER_REVIEW_SEQUENCE, buildReviewContext, reviewIdempotencyKey } from "../lib/inspection";
import { getPushToken } from "./push";

let client: Orch8Client | null = null;
let running: Promise<void> | null = null;
let registeredToken: string | null = null;

function orch8(): Orch8Client | null {
  if (!serverConfigured) return null;
  client ??= new Orch8Client({
    baseUrl: config.serverUrl,
    tenantId: config.tenantId,
    headers: { "X-API-Key": config.apiKey },
    retry: { maxAttempts: 3, baseDelayMs: 500 },
  });
  return client;
}

/** Run one sync pass; concurrent callers share the in-flight pass. */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) return;
      await registerDevice();
      await uploadEvidence();
      await requestSupervisorReviews();
    } finally {
      running = null;
    }
  })();
  return running;
}

async function registerDevice(): Promise<void> {
  const api = orch8();
  if (!api) return;
  const pushToken = await getPushToken();
  const key = pushToken ?? "none";
  if (registeredToken === key) return;
  await api.request("POST", "/mobile/devices/register", {
    device_id: await getDeviceId(),
    push_token: pushToken ?? undefined,
    platform: Platform.OS,
    app_version: "0.1.0",
  });
  registeredToken = key;
}

async function uploadEvidence(): Promise<void> {
  if (!config.evidenceUploadUrl) return;
  for (const record of await listRecords()) {
    for (const artifact of record.artifacts) {
      if (record.uploaded.includes(artifact.sha256)) continue;
      const res = await FileSystem.uploadAsync(`${config.evidenceUploadUrl}/${artifact.sha256}`, artifact.localUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": artifact.mime, "X-API-Key": config.apiKey },
      });
      if (res.status >= 200 && res.status < 300) {
        await patchRecord(record.instanceId, (r) => ({ ...r, uploaded: [...r.uploaded, artifact.sha256] }));
      }
    }
  }
}

async function requestSupervisorReviews(): Promise<void> {
  const api = orch8();
  if (!api) return;
  const deviceId = await getDeviceId();
  let sequenceId: string | null = null;
  for (const record of await listRecords()) {
    if (record.reviewRequestedAt) continue;
    const view = await loadInspection(record);
    if (view.stage !== "awaiting_supervisor") continue;
    sequenceId ??= (await api.getSequenceByName(config.tenantId, "default", SERVER_REVIEW_SEQUENCE)).id;
    await api.createInstance({
      sequence_id: sequenceId,
      tenant_id: config.tenantId,
      namespace: "default",
      context: {
        data: buildReviewContext({
          deviceId,
          deviceInstanceId: record.instanceId,
          supervisorId: config.supervisorId,
          data: view.data,
        }),
      },
      idempotency_key: reviewIdempotencyKey(record.instanceId),
    });
    await patchRecord(record.instanceId, (r) => ({ ...r, reviewRequestedAt: new Date().toISOString() }));
  }
}

/** Kick the engine and the sync loop, e.g. after a push or on foreground. */
export async function wakeAndSync(): Promise<void> {
  const engine = await getEngine();
  await engine.runUntilIdle(10, 5_000);
  await syncNow().catch(() => undefined);
}

export function startConnectivitySync(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncNow().catch(() => undefined);
  });
}
