import { APP_VERSION } from "@/lib/brand";
import { IMPORT_SCHEMA_VERSION } from "@/lib/types/import";
import type { BudgetPlan } from "@/lib/types/budget";
import type { AuditEvent, BackupRecord, ImportBatch } from "@/lib/types/import";

export const FULL_BACKUP_SCHEMA_VERSION = IMPORT_SCHEMA_VERSION;

export interface FullBackupPayload {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  plan: BudgetPlan;
  preferences: BudgetPlan["preferences"];
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
  importBatches: ImportBatch[];
  auditEvents: AuditEvent[];
  /** Optional local backup metadata (not secrets) */
  backupMeta?: Array<{
    id: string;
    label: string;
    reason: BackupRecord["reason"];
    createdAt: string;
    schemaVersion: number;
    recordCount?: number;
  }>;
}

export interface FullBackupBundle {
  plan: BudgetPlan;
  payeeAliasRules?: Record<string, string>;
  categoryImportRules?: Record<string, string>;
  importBatches?: ImportBatch[];
  auditEvents?: AuditEvent[];
  backups?: BackupRecord[];
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[_-]/g, "");
  return (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("apikey") ||
    lower.includes("authorization") ||
    lower.includes("credential")
  );
}

function stripSecretsDeep(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretsDeep(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) continue;
    out[key] = stripSecretsDeep(child);
  }
  return out;
}

function stripSecrets<T>(value: T): T {
  return stripSecretsDeep(structuredClone(value)) as T;
}

export function countBackupRecords(plan: BudgetPlan): number {
  return (
    plan.accounts.length +
    plan.transactions.length +
    plan.categories.length +
    plan.categoryGroups.length +
    plan.targets.length +
    plan.payees.length +
    plan.monthlyBudgets.length +
    (plan.scheduledTransactions?.length ?? 0)
  );
}

export function serializeFullBackup(bundle: FullBackupBundle): string {
  const payload: FullBackupPayload = {
    schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    plan: stripSecrets(structuredClone(bundle.plan)),
    preferences: stripSecrets(
      structuredClone(bundle.plan.preferences ?? {}),
    ) as BudgetPlan["preferences"],
    payeeAliasRules: { ...(bundle.payeeAliasRules ?? {}) },
    categoryImportRules: { ...(bundle.categoryImportRules ?? {}) },
    importBatches: structuredClone(bundle.importBatches ?? []).map((b) => {
      const { ...rest } = b;
      return rest;
    }),
    auditEvents: structuredClone(bundle.auditEvents ?? []).slice(0, 100),
    backupMeta: (bundle.backups ?? []).slice(0, 10).map((b) => ({
      id: b.id,
      label: b.label,
      reason: b.reason,
      createdAt: b.createdAt,
      schemaVersion: b.schemaVersion,
      recordCount: b.recordCount ?? countBackupRecords(b.planSnapshot),
    })),
  };

  // Ensure no accidental credential fields
  return JSON.stringify(stripSecrets(payload), null, 2);
}

export function parseFullBackup(content: string): {
  ok: boolean;
  payload?: FullBackupPayload;
  plan?: BudgetPlan;
  errors: string[];
  accountCount: number;
  transactionCount: number;
  categoryCount: number;
  goalCount: number;
  schemaVersion: number;
} {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      ok: false,
      errors: ["Invalid JSON."],
      accountCount: 0,
      transactionCount: 0,
      categoryCount: 0,
      goalCount: 0,
      schemaVersion: 0,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      errors: ["Backup root must be an object."],
      accountCount: 0,
      transactionCount: 0,
      categoryCount: 0,
      goalCount: 0,
      schemaVersion: 0,
    };
  }

  const root = parsed as Record<string, unknown>;
  const planCandidate = (root.plan ?? root) as Partial<BudgetPlan>;
  const schemaVersion =
    typeof root.schemaVersion === "number"
      ? root.schemaVersion
      : FULL_BACKUP_SCHEMA_VERSION;

  if (!Array.isArray(planCandidate.accounts)) errors.push("Missing accounts array.");
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
  const goalCount = Array.isArray(planCandidate.targets)
    ? planCandidate.targets.length
    : 0;

  if (errors.length) {
    return {
      ok: false,
      errors,
      accountCount,
      transactionCount,
      categoryCount,
      goalCount,
      schemaVersion,
    };
  }

  const payload: FullBackupPayload = {
    schemaVersion,
    exportedAt:
      typeof root.exportedAt === "string"
        ? root.exportedAt
        : new Date().toISOString(),
    appVersion:
      typeof root.appVersion === "string" ? root.appVersion : APP_VERSION,
    plan: planCandidate as BudgetPlan,
    preferences:
      (root.preferences as BudgetPlan["preferences"]) ??
      (planCandidate.preferences as BudgetPlan["preferences"]),
    payeeAliasRules:
      (root.payeeAliasRules as Record<string, string>) ?? {},
    categoryImportRules:
      (root.categoryImportRules as Record<string, string>) ?? {},
    importBatches: Array.isArray(root.importBatches)
      ? (root.importBatches as ImportBatch[])
      : [],
    auditEvents: Array.isArray(root.auditEvents)
      ? (root.auditEvents as AuditEvent[])
      : [],
  };

  return {
    ok: true,
    payload,
    plan: payload.plan,
    errors: [],
    accountCount,
    transactionCount,
    categoryCount,
    goalCount,
    schemaVersion,
  };
}
