// Workflow contract for workflows/field-inspection-offline.json. Pure: no
// React Native imports, so it runs under `node --test` as well as in the app.
//
// The engine only accepts `completeStep` payloads whose `value` is one of the
// step's `wait_for_input.choices`. The chosen value is stored under
// `store_as`, and every other top-level key is merged into `context.data`.

import type { ChecklistItem, ChecklistSummary } from "./checklist";

export const DEVICE_SEQUENCE = "field-inspection-offline";
export const SERVER_REVIEW_SEQUENCE = "field-inspection-review";

/** Step ids (block ids) of the device sequence that wait for this app. */
export const STEPS = {
  checklist: "capture_checklist",
  photos: "capture_photos",
  attestation: "inspector_attestation",
  supervisor: "supervisor_approval",
} as const;

/** Every handler named in the device sequence; all must be registered. */
export const HANDLERS = [
  "inspection_form",
  "queue_evidence_upload",
  "human_review",
  "finalize_report",
  "notify_inspector",
] as const;

/**
 * A photo kept on the device. Only this reference (never the bytes) enters
 * the workflow context, the sync channel or the supervisor request. Bytes
 * go to your evidence store separately, keyed by sha256 so uploads are idempotent.
 */
export interface ArtifactRef {
  ref: string; // artifact://sha256/<hex>
  sha256: string;
  mime: string;
  bytes: number;
  capturedAt: string;
  localUri: string; // file:// path inside the app sandbox; never synced
}

export type Stage =
  | "checklist"
  | "photos"
  | "attestation"
  | "submitting"
  | "awaiting_supervisor"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "failed"
  | "cancelled";

export type EngineState =
  | "scheduled"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

type Data = Record<string, unknown>;

/**
 * Where an instance is, derived only from the engine state and
 * `context.data`. The engine does not expose the current step id through
 * `getInstance`, and `stepPending` events are not replayed after a restart,
 * so the app derives the stage from what the steps have stored.
 */
export function deriveStage(state: EngineState, data: Data): Stage {
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  const decision = data["supervisor_decision"];
  if (decision === "approved" || decision === "changes_requested" || decision === "rejected") {
    return decision;
  }
  if (data["checklist_status"] !== "complete") return "checklist";
  if (data["evidence_status"] !== "attached" && data["evidence_status"] !== "none") return "photos";
  if (data["attestation"] !== "submitted") return "attestation";
  return state === "waiting" ? "awaiting_supervisor" : "submitting";
}

/** The step this app must complete for a stage, or null if the app has nothing to do. */
export function stepForStage(stage: Stage): string | null {
  switch (stage) {
    case "checklist":
      return STEPS.checklist;
    case "photos":
      return STEPS.photos;
    case "attestation":
      return STEPS.attestation;
    default:
      return null;
  }
}

export function checklistOutput(items: readonly ChecklistItem[], summary: ChecklistSummary) {
  return {
    value: "complete",
    checklist: {
      template: "site-safety-v1",
      items: items.map(({ id, result, note }) => ({ id, result, note })),
      summary,
    },
  };
}

export function photosOutput(artifacts: readonly ArtifactRef[]) {
  return {
    value: artifacts.length > 0 ? "attached" : "none",
    // localUri stays on the device: it is stripped before entering the context.
    evidence: artifacts.map(({ ref, sha256, mime, bytes, capturedAt }) => ({ ref, sha256, mime, bytes, capturedAt })),
  };
}

export function attestationOutput(inspector: string, now: Date = new Date()) {
  return { value: "submitted", attested_by: inspector, attested_at: now.toISOString() };
}

export function artifactRefFor(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("sha256 must be 64 lowercase hex characters");
  }
  return `artifact://sha256/${sha256}`;
}

/**
 * Context for the server-side `field-inspection-review` sequence. It carries
 * only what a supervisor needs to decide: counts, failed item ids, notes and
 * artifact refs. It does not carry photo bytes, local file paths or location.
 */
export function buildReviewContext(input: {
  deviceId: string;
  deviceInstanceId: string;
  supervisorId: string;
  data: Data;
}) {
  const { deviceId, deviceInstanceId, supervisorId, data } = input;
  const checklist = (data["checklist"] ?? {}) as {
    summary?: ChecklistSummary;
    items?: Array<{ id: string; result: string; note: string }>;
  };
  const evidence = Array.isArray(data["evidence"]) ? (data["evidence"] as Array<{ ref?: unknown }>) : [];
  const failedNotes = (checklist.items ?? [])
    .filter((i) => i.result === "fail")
    .map((i) => ({ id: i.id, note: i.note }));
  return {
    device_id: deviceId,
    device_instance_id: deviceInstanceId,
    supervisor_id: supervisorId,
    inspection_id: String(data["inspection_id"] ?? deviceInstanceId),
    site_id: String(data["site_id"] ?? "unknown"),
    inspector: String(data["attested_by"] ?? data["inspector"] ?? "unknown"),
    failed_count: checklist.summary?.failed ?? failedNotes.length,
    photo_count: evidence.length,
    summary: { checklist: checklist.summary ?? null, failed_items: failedNotes },
    evidence_refs: evidence.map((e) => e.ref).filter((r): r is string => typeof r === "string"),
  };
}

export function reviewIdempotencyKey(deviceInstanceId: string): string {
  return `field-inspection-review:${deviceInstanceId}`;
}
