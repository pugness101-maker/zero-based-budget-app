import type { BudgetPlan } from "@/lib/types/budget";
import type { BackupRecord, ImportBatch } from "@/lib/types/import";

export interface ReverseImportResult {
  ok: boolean;
  plan?: BudgetPlan;
  batch?: ImportBatch;
  error?: string;
}

/**
 * Prefer restoring the pre-import backup (full rollback).
 * Falls back to removing transactions tagged with the batch id.
 */
export function reverseImportBatch(input: {
  plan: BudgetPlan;
  batch: ImportBatch;
  backup?: BackupRecord;
}): ReverseImportResult {
  try {
    if (input.batch.status === "reversed") {
      return { ok: false, error: "Import batch was already reversed." };
    }
    if (input.batch.status !== "committed") {
      return { ok: false, error: "Only committed imports can be undone." };
    }

    if (input.backup?.planSnapshot) {
      const batch: ImportBatch = {
        ...input.batch,
        status: "reversed",
        reversedAt: new Date().toISOString(),
      };
      return {
        ok: true,
        plan: structuredClone(input.backup.planSnapshot),
        batch,
      };
    }

    // Fallback: strip batch artifacts
    const txnIds = new Set(input.batch.createdTransactionIds ?? []);
    const catIds = new Set(input.batch.createdCategoryIds ?? []);
    const acctIds = new Set(input.batch.createdAccountIds ?? []);

    const plan: BudgetPlan = {
      ...input.plan,
      transactions: input.plan.transactions.filter(
        (t) =>
          t.importBatchId !== input.batch.id && !txnIds.has(t.id),
      ),
      scheduledTransactions: (input.plan.scheduledTransactions ?? []).filter(
        (t) => t.importBatchId !== input.batch.id && !txnIds.has(t.id),
      ),
      categories: input.plan.categories.filter((c) => !catIds.has(c.id)),
      accounts: input.plan.accounts.filter((a) => !acctIds.has(a.id)),
      monthlyBudgets: input.plan.monthlyBudgets.filter(
        (b) =>
          !catIds.has(b.categoryId) &&
          !(b.source === "ynab_import" && input.batch.importType === "ynab_zip"),
      ),
      targets: input.plan.targets.filter((t) => !catIds.has(t.categoryId)),
    };

    return {
      ok: true,
      plan,
      batch: {
        ...input.batch,
        status: "reversed",
        reversedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reverse import.",
    };
  }
}
