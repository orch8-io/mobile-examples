// Checklist template and validation. Pure: no React Native imports, so it runs
// under `node --test` as well as in the app.

export type ItemResult = "pass" | "fail" | "na";

export interface ChecklistItem {
  id: string;
  label: string;
  result: ItemResult | null;
  note: string;
}

export interface ChecklistSummary {
  total: number;
  passed: number;
  failed: number;
  notApplicable: number;
  failedIds: string[];
}

export const CHECKLIST_TEMPLATE_ID = "site-safety-v1";

const TEMPLATE: ReadonlyArray<Pick<ChecklistItem, "id" | "label">> = [
  { id: "ppe", label: "Crew wearing required PPE" },
  { id: "exits", label: "Emergency exits clear and signed" },
  { id: "extinguishers", label: "Fire extinguishers present and in date" },
  { id: "electrical", label: "No exposed or damaged electrical wiring" },
  { id: "scaffolding", label: "Scaffolding tagged and inspected" },
  { id: "housekeeping", label: "Walkways free of trip hazards" },
];

export function newChecklist(): ChecklistItem[] {
  return TEMPLATE.map((item) => ({ ...item, result: null, note: "" }));
}

/**
 * Returns human-readable problems; empty means the checklist can be submitted.
 * Every item needs an answer, and every failed item needs a note so the
 * supervisor can act on it without calling the inspector.
 */
export function validateChecklist(items: readonly ChecklistItem[]): string[] {
  const problems: string[] = [];
  for (const item of items) {
    if (item.result === null) {
      problems.push(`Answer "${item.label}"`);
    } else if (item.result === "fail" && item.note.trim().length === 0) {
      problems.push(`Add a note for failed item "${item.label}"`);
    }
  }
  return problems;
}

export function summarize(items: readonly ChecklistItem[]): ChecklistSummary {
  const failed = items.filter((i) => i.result === "fail");
  return {
    total: items.length,
    passed: items.filter((i) => i.result === "pass").length,
    failed: failed.length,
    notApplicable: items.filter((i) => i.result === "na").length,
    failedIds: failed.map((i) => i.id),
  };
}
