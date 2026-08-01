import type { BudgetPlan } from "@/lib/types/budget";
import type { FullBackupPayload } from "@/lib/exports/full-backup";
import type { MergeMode } from "@/lib/types/import";

export interface RestoreConflict {
  type:
    | "account"
    | "category"
    | "transaction"
    | "target"
    | "payee"
    | "group";
  id: string;
  name: string;
  detail: string;
}

export interface RestorePreview {
  accountCount: number;
  transactionCount: number;
  categoryCount: number;
  goalCount: number;
  payeeCount: number;
  groupCount: number;
  monthlyBudgetCount: number;
  scheduledCount: number;
  conflicts: RestoreConflict[];
}

export function buildRestorePreview(
  current: BudgetPlan,
  incoming: BudgetPlan,
): RestorePreview {
  const conflicts: RestoreConflict[] = [];

  for (const a of incoming.accounts) {
    const existing = current.accounts.find((x) => x.id === a.id);
    if (existing && existing.name !== a.name) {
      conflicts.push({
        type: "account",
        id: a.id,
        name: a.name,
        detail: `Same id as “${existing.name}” — merge keeps current`,
      });
    }
  }
  for (const c of incoming.categories) {
    const existing = current.categories.find((x) => x.id === c.id);
    if (existing && existing.name !== c.name) {
      conflicts.push({
        type: "category",
        id: c.id,
        name: c.name,
        detail: `Same id as “${existing.name}” — merge keeps current`,
      });
    }
  }
  for (const t of incoming.transactions) {
    if (current.transactions.some((x) => x.id === t.id)) {
      conflicts.push({
        type: "transaction",
        id: t.id,
        name: t.payeeName || t.id,
        detail: "Duplicate transaction id — merge skips incoming",
      });
    }
  }
  for (const g of incoming.targets) {
    if (current.targets.some((x) => x.id === g.id)) {
      conflicts.push({
        type: "target",
        id: g.id,
        name: g.id,
        detail: "Duplicate goal id — merge keeps current",
      });
    }
  }

  return {
    accountCount: incoming.accounts.length,
    transactionCount: incoming.transactions.length,
    categoryCount: incoming.categories.length,
    goalCount: incoming.targets.length,
    payeeCount: incoming.payees.length,
    groupCount: incoming.categoryGroups.length,
    monthlyBudgetCount: incoming.monthlyBudgets.length,
    scheduledCount: incoming.scheduledTransactions?.length ?? 0,
    conflicts: conflicts.slice(0, 50),
  };
}

function byIdMerge<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  const ids = new Set(current.map((x) => x.id));
  return [...current, ...incoming.filter((x) => !ids.has(x.id))];
}

/** Merge by stable IDs; current wins on conflict. */
export function mergePlans(current: BudgetPlan, incoming: BudgetPlan): BudgetPlan {
  const monthlyKey = (b: { categoryId: string; monthKey: string }) =>
    `${b.categoryId}:${b.monthKey}`;
  const budgetKeys = new Set(current.monthlyBudgets.map(monthlyKey));

  return {
    ...current,
    accounts: byIdMerge(current.accounts, incoming.accounts),
    categoryGroups: byIdMerge(current.categoryGroups, incoming.categoryGroups),
    categories: byIdMerge(current.categories, incoming.categories),
    transactions: [
      ...incoming.transactions.filter(
        (t) => !current.transactions.some((x) => x.id === t.id),
      ),
      ...current.transactions,
    ],
    targets: byIdMerge(current.targets, incoming.targets),
    payees: byIdMerge(current.payees, incoming.payees),
    monthlyBudgets: [
      ...current.monthlyBudgets,
      ...incoming.monthlyBudgets.filter((b) => !budgetKeys.has(monthlyKey(b))),
    ],
    scheduledTransactions: byIdMerge(
      current.scheduledTransactions ?? [],
      incoming.scheduledTransactions ?? [],
    ),
    preferences: {
      ...incoming.preferences,
      ...current.preferences,
    },
  };
}

export function applyRestoreMode(
  current: BudgetPlan,
  incoming: BudgetPlan,
  mode: MergeMode,
): BudgetPlan {
  if (mode === "replace") {
    return structuredClone(incoming);
  }
  return mergePlans(current, incoming);
}

export function mergeRestoreExtras(
  current: {
    payeeAliasRules: Record<string, string>;
    categoryImportRules: Record<string, string>;
  },
  payload: FullBackupPayload,
  mode: MergeMode,
): {
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
} {
  if (mode === "replace") {
    return {
      payeeAliasRules: { ...(payload.payeeAliasRules ?? {}) },
      categoryImportRules: { ...(payload.categoryImportRules ?? {}) },
    };
  }
  return {
    payeeAliasRules: {
      ...payload.payeeAliasRules,
      ...current.payeeAliasRules,
    },
    categoryImportRules: {
      ...payload.categoryImportRules,
      ...current.categoryImportRules,
    },
  };
}
