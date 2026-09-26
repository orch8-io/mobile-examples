// App-level operations on the device workflow. Every write goes through the
// on-device engine first, so it works offline and survives app restarts.

import * as Crypto from "expo-crypto";

import type { ChecklistItem } from "../lib/checklist";
import { summarize } from "../lib/checklist";
import {
  DEVICE_SEQUENCE,
  STEPS,
  attestationOutput,
  checklistOutput,
  deriveStage,
  photosOutput,
  type ArtifactRef,
  type Stage,
} from "../lib/inspection";
import { getEngine } from "./runtime";
import { listRecords, patchRecord, updateRecords, type InspectionRecord } from "./store";

export interface InspectionView {
  record: InspectionRecord;
  stage: Stage;
  engineState: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

export async function startInspection(site: { id: string; name: string }): Promise<string> {
  const engine = await getEngine();
  const inspectionId = Crypto.randomUUID();
  const instanceId = engine.start(
    DEVICE_SEQUENCE,
    { inspection_id: inspectionId, site_id: site.id, site_name: site.name },
    `inspection:${inspectionId}`,
  );
  await updateRecords((records) => [
    {
      instanceId,
      siteId: site.id,
      siteName: site.name,
      createdAt: new Date().toISOString(),
      artifacts: [],
      uploaded: [],
    },
    ...records,
  ]);
  return instanceId;
}

export async function loadInspection(record: InspectionRecord): Promise<InspectionView> {
  const engine = await getEngine();
  try {
    const snapshot = engine.getInstanceParsed(record.instanceId);
    return {
      record,
      stage: deriveStage(snapshot.state, snapshot.parsedContext),
      engineState: snapshot.state,
      data: snapshot.parsedContext,
      updatedAt: snapshot.updatedAt,
    };
  } catch {
    // Instance garbage-collected by the engine after its lifetime expired.
    return { record, stage: "cancelled", engineState: "cancelled", data: {}, updatedAt: record.createdAt };
  }
}

export async function loadAllInspections(): Promise<InspectionView[]> {
  return Promise.all((await listRecords()).map(loadInspection));
}

export async function submitChecklist(instanceId: string, items: readonly ChecklistItem[]): Promise<void> {
  const engine = await getEngine();
  engine.completeStep(instanceId, STEPS.checklist, checklistOutput(items, summarize(items)));
}

export async function addPhoto(instanceId: string, artifact: ArtifactRef): Promise<void> {
  await patchRecord(instanceId, (r) =>
    r.artifacts.some((a) => a.sha256 === artifact.sha256) ? r : { ...r, artifacts: [...r.artifacts, artifact] },
  );
}

export async function removePhoto(instanceId: string, sha256: string): Promise<void> {
  await patchRecord(instanceId, (r) => ({ ...r, artifacts: r.artifacts.filter((a) => a.sha256 !== sha256) }));
}

export async function submitPhotos(instanceId: string): Promise<void> {
  const engine = await getEngine();
  const record = (await listRecords()).find((r) => r.instanceId === instanceId);
  engine.completeStep(instanceId, STEPS.photos, photosOutput(record?.artifacts ?? []));
}

export async function submitAttestation(instanceId: string, inspector: string): Promise<void> {
  const engine = await getEngine();
  engine.completeStep(instanceId, STEPS.attestation, attestationOutput(inspector));
}

export async function cancelInspection(instanceId: string): Promise<void> {
  const engine = await getEngine();
  engine.cancelInstance(instanceId);
}
