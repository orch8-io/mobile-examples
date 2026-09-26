import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { newChecklist, summarize, validateChecklist } from "./checklist.ts";
import {
  HANDLERS,
  STEPS,
  artifactRefFor,
  attestationOutput,
  buildReviewContext,
  checklistOutput,
  deriveStage,
  photosOutput,
  stepForStage,
} from "./inspection.ts";

type Block = {
  type: string;
  id: string;
  handler?: string;
  wait_for_input?: { choices?: Array<{ value: string }>; store_as?: string };
  routes?: Array<{ blocks: Block[] }>;
  default?: Block[];
};

const sequence = JSON.parse(
  readFileSync(new URL("../../workflows/field-inspection-offline.json", import.meta.url), "utf8"),
) as { name: string; blocks: Block[] };

function allSteps(blocks: Block[]): Block[] {
  return blocks.flatMap((b) =>
    b.type === "router" ? [...(b.routes ?? []).flatMap((r) => allSteps(r.blocks)), ...allSteps(b.default ?? [])] : [b],
  );
}

test("every handler in the sequence is registered by the app", () => {
  const used = new Set(allSteps(sequence.blocks).map((b) => b.handler));
  assert.deepEqual([...used].sort(), [...HANDLERS].sort());
});

test("completion payloads use a declared choice for each gated step", () => {
  const byId = new Map(allSteps(sequence.blocks).map((b) => [b.id, b]));
  const choices = (id: string) => byId.get(id)?.wait_for_input?.choices?.map((c) => c.value) ?? [];
  const items = newChecklist().map((i) => ({ ...i, result: "pass" as const }));
  assert.ok(choices(STEPS.checklist).includes(checklistOutput(items, summarize(items)).value));
  assert.ok(choices(STEPS.photos).includes(photosOutput([]).value));
  assert.ok(choices(STEPS.attestation).includes(attestationOutput("Dana").value));
  assert.deepEqual(choices(STEPS.supervisor), ["approved", "changes_requested", "rejected"]);
});

test("checklist validation requires answers and notes on failures", () => {
  const items = newChecklist();
  assert.equal(validateChecklist(items).length, items.length);
  items.forEach((i) => (i.result = "pass"));
  items[0].result = "fail";
  assert.deepEqual(validateChecklist(items), [`Add a note for failed item "${items[0].label}"`]);
  items[0].note = "Two workers without hard hats";
  assert.deepEqual(validateChecklist(items), []);
  assert.equal(summarize(items).failed, 1);
});

test("stage follows stored step outputs", () => {
  assert.equal(deriveStage("waiting", {}), "checklist");
  assert.equal(deriveStage("waiting", { checklist_status: "complete" }), "photos");
  assert.equal(deriveStage("waiting", { checklist_status: "complete", evidence_status: "none" }), "attestation");
  const submitted = { checklist_status: "complete", evidence_status: "attached", attestation: "submitted" };
  assert.equal(deriveStage("running", submitted), "submitting");
  assert.equal(deriveStage("waiting", submitted), "awaiting_supervisor");
  assert.equal(deriveStage("completed", { ...submitted, supervisor_decision: "approved" }), "approved");
  assert.equal(deriveStage("failed", submitted), "failed");
  assert.equal(stepForStage("photos"), STEPS.photos);
  assert.equal(stepForStage("awaiting_supervisor"), null);
});

test("photo payload keeps local paths on the device", () => {
  const sha = "a".repeat(64);
  const out = photosOutput([
    { ref: artifactRefFor(sha), sha256: sha, mime: "image/jpeg", bytes: 10, capturedAt: "t", localUri: "file:///x.jpg" },
  ]);
  assert.equal(out.value, "attached");
  assert.equal(JSON.stringify(out).includes("file://"), false);
  assert.throws(() => artifactRefFor("not-a-hash"));
});

test("review context carries refs and counts, never bytes or paths", () => {
  const sha = "b".repeat(64);
  const ctx = buildReviewContext({
    deviceId: "dev-1",
    deviceInstanceId: "inst-1",
    supervisorId: "sup-1",
    data: {
      site_id: "A-12",
      attested_by: "Dana",
      checklist: {
        summary: { total: 6, passed: 5, failed: 1, notApplicable: 0, failedIds: ["ppe"] },
        items: [{ id: "ppe", result: "fail", note: "No hard hats" }],
      },
      evidence: [{ ref: artifactRefFor(sha), sha256: sha, mime: "image/jpeg", bytes: 10, capturedAt: "t" }],
    },
  });
  assert.equal(ctx.failed_count, 1);
  assert.equal(ctx.photo_count, 1);
  assert.deepEqual(ctx.evidence_refs, [`artifact://sha256/${sha}`]);
  assert.equal(JSON.stringify(ctx).includes("file://"), false);
});
