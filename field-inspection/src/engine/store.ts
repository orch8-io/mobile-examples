// Small file-backed index of the inspections started on this device. The
// engine lists only non-terminal instances, so the app keeps its own index to
// show history (approved/rejected) and the per-photo upload queue.

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";

import type { ArtifactRef } from "../lib/inspection";

export interface InspectionRecord {
  instanceId: string;
  siteId: string;
  siteName: string;
  createdAt: string;
  /** Photos captured for this inspection, including local file paths (never synced). */
  artifacts: ArtifactRef[];
  /** sha256 of photos already accepted by the evidence store. */
  uploaded: string[];
  /** Set once the server-side review instance was created (idempotent anyway). */
  reviewRequestedAt?: string;
}

const ROOT = `${FileSystem.documentDirectory}field-inspection/`;
const INDEX = `${ROOT}inspections.json`;
const DEVICE = `${ROOT}device-id`;

export const paths = {
  root: ROOT,
  evidenceDir: `${ROOT}evidence/`,
  /** Plain filesystem path (no file:// scheme) for the engine's SQLite file. */
  engineDb: `${ROOT}orch8.db`.replace(/^file:\/\//, ""),
};

let cache: InspectionRecord[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function ensureDirs(): Promise<void> {
  for (const dir of [ROOT, paths.evidenceDir]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function initStorage(): Promise<void> {
  await ensureDirs();
}

/** Random per-install id. Not derived from hardware; reset by reinstalling. */
export async function getDeviceId(): Promise<string> {
  await ensureDirs();
  const info = await FileSystem.getInfoAsync(DEVICE);
  if (info.exists) {
    const id = (await FileSystem.readAsStringAsync(DEVICE)).trim();
    if (id) return id;
  }
  const id = `fi-${Crypto.randomUUID()}`;
  await FileSystem.writeAsStringAsync(DEVICE, id);
  return id;
}

export async function listRecords(): Promise<InspectionRecord[]> {
  if (cache) return cache;
  await ensureDirs();
  const info = await FileSystem.getInfoAsync(INDEX);
  if (!info.exists) {
    cache = [];
    return cache;
  }
  try {
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(INDEX));
    cache = Array.isArray(parsed) ? (parsed as InspectionRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Serialized read-modify-write so concurrent updates never lose each other. */
export function updateRecords(mutate: (records: InspectionRecord[]) => InspectionRecord[]): Promise<void> {
  writeChain = writeChain.then(async () => {
    const next = mutate([...(await listRecords())]);
    const tmp = `${INDEX}.tmp`;
    await FileSystem.writeAsStringAsync(tmp, JSON.stringify(next));
    await FileSystem.moveAsync({ from: tmp, to: INDEX });
    cache = next;
  });
  return writeChain;
}

export function patchRecord(instanceId: string, patch: (r: InspectionRecord) => InspectionRecord): Promise<void> {
  return updateRecords((records) => records.map((r) => (r.instanceId === instanceId ? patch(r) : r)));
}
