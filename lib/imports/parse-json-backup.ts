import type { BudgetPlan } from "@/lib/types/budget";
import { IMPORT_SCHEMA_VERSION } from "@/lib/types/import";

export interface JsonBackupPreview {
  ok: boolean;
  schemaVersion: number;
  plan?: BudgetPlan;
  accountCount: number;
  transactionCount: number;
  categoryCount: number;
  errors: string[];
}

export function parseJsonBackup(content: string): JsonBackupPreview {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      ok: false,
      schemaVersion: 0,
      accountCount: 0,
      transactionCount: 0,
      categoryCount: 0,
      errors: ["Invalid JSON."],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      schemaVersion: 0,
      accountCount: 0,
      transactionCount: 0,
      categoryCount: 0,
      errors: ["Backup root must be an object."],
    };
  }

  const root = parsed as Record<string, unknown>;
  const planCandidate = (root.plan ?? root) as Partial<BudgetPlan>;
  const schemaVersion =
    typeof root.schemaVersion === "number"
      ? root.schemaVersion
      : IMPORT_SCHEMA_VERSION;

  if (!Array.isArray(planCandidate.accounts)) {
    errors.push("Missing accounts array.");
  }
  if (!Array.isArray(planCandidate.transactions)) {
    errors.push("Missing transactions array.");
  }
  if (!Array.isArray(planCandidate.categories)) {
    errors.push("Missing categories array.");
  }

  const accountCount = Array.isArray(planCandidate.accounts)
    ? planCandidate.accounts.length
    : 0;
  const transactionCount = Array.isArray(planCandidate.transactions)
    ? planCandidate.transactions.length
    : 0;
  const categoryCount = Array.isArray(planCandidate.categories)
    ? planCandidate.categories.length
    : 0;

  if (errors.length > 0) {
    return {
      ok: false,
      schemaVersion,
      accountCount,
      transactionCount,
      categoryCount,
      errors,
    };
  }

  return {
    ok: true,
    schemaVersion,
    plan: planCandidate as BudgetPlan,
    accountCount,
    transactionCount,
    categoryCount,
    errors: [],
  };
}

export function serializePlanBackup(plan: BudgetPlan): string {
  // Keep legacy helper; prefer serializeFullBackup for Settings export.
  return JSON.stringify(
    {
      schemaVersion: IMPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      plan,
    },
    null,
    2,
  );
}
