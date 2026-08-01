import type {
  Account,
  AccountType,
  BudgetPlan,
  Category,
  MonthlyCategoryBudget,
  Transaction,
} from "@/lib/types/budget";
import type {
  DestinationConfig,
  DuplicateHandling,
  ImportBatch,
  ImportCommitResult,
  ImportRow,
  MergeMode,
} from "@/lib/types/import";
import { csvRowsToErrorCsv } from "@/lib/imports/parse-csv";
import { ensureImportedGroup, normalizeCategoryName } from "@/lib/imports/map-categories";
import { normalizeMoneyToCents } from "@/lib/imports/normalize-money";
import { toMonthKey } from "@/lib/dates";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface ImportCommitInput {
  plan: BudgetPlan;
  batch: ImportBatch;
  rows: ImportRow[];
  destination: DestinationConfig;
  duplicateHandling: DuplicateHandling;
  mergeMode: MergeMode;
  categoriesToCreate: Array<{ name: string; groupId: string }>;
}

export interface ImportCommitSuccess {
  ok: true;
  plan: BudgetPlan;
  batch: ImportBatch;
  rows: ImportRow[];
  errorCsv: string;
}

export interface ImportCommitFailure {
  ok: false;
  error: string;
  batch: ImportBatch;
  rows: ImportRow[];
  errorCsv: string;
}

/**
 * Pure commit of an import batch. Caller wraps with backup + audit.
 * On any thrown error, caller must discard the returned plan (rollback).
 */
export function commitImport(input: ImportCommitInput): ImportCommitSuccess | ImportCommitFailure {
  const snapshotBatch = { ...input.batch };
  try {
    return commitImportUnsafe(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    const errorRows = input.rows.filter((r) => r.status === "invalid" || r.errors.length);
    return {
      ok: false,
      error: message,
      batch: {
        ...snapshotBatch,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorRows: errorRows.length,
      },
      rows: input.rows,
      errorCsv: csvRowsToErrorCsv(errorRows),
    };
  }
}

function commitImportUnsafe(input: ImportCommitInput): ImportCommitSuccess {
  const { destination, duplicateHandling, mergeMode, categoriesToCreate } = input;
  let plan: BudgetPlan = structuredClone(input.plan);
  let rows = input.rows.map((r) => ({ ...r }));
  const createdCategoryIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdTransactionIds: string[] = [];

  if (mergeMode === "replace") {
    // Explicit replace only — wipe transactions for destination account
    const accountId =
      destination.accountId ??
      (destination.createAccount ? "__pending__" : undefined);
    if (accountId && accountId !== "__pending__") {
      plan = {
        ...plan,
        transactions: plan.transactions.filter((t) => t.accountId !== accountId),
      };
    }
  }

  // Ensure destination account
  let accountId = destination.accountId;
  if (!accountId && destination.createAccount) {
    const created = createAccount(plan, destination.createAccount);
    plan = created.plan;
    accountId = created.account.id;
    createdAccountIds.push(accountId);
  }
  if (!accountId) {
    throw new Error("Destination account is required.");
  }

  // Starting balance file overrides are handled by account balance import path.

  // Create categories
  const group = ensureImportedGroup(plan);
  if (!plan.categoryGroups.some((g) => g.id === group.id)) {
    plan = {
      ...plan,
      categoryGroups: [...plan.categoryGroups, group],
    };
  }

  const categoryIdByName = new Map(
    plan.categories.map((c) => [normalizeCategoryName(c.name), c.id]),
  );

  for (const spec of categoriesToCreate) {
    const key = normalizeCategoryName(spec.name);
    if (categoryIdByName.has(key)) continue;
    const category: Category = {
      id: newId("cat"),
      groupId: spec.groupId || group.id,
      name: spec.name,
      sortOrder: plan.categories.filter((c) => c.groupId === (spec.groupId || group.id))
        .length,
      hidden: false,
      rollover: true,
    };
    plan = { ...plan, categories: [...plan.categories, category] };
    categoryIdByName.set(key, category.id);
    createdCategoryIds.push(category.id);
  }

  // Resolve needs_category leave-as-uncategorized when include=true
  rows = rows.map((row) => {
    if (row.status === "needs_category" && row.include) {
      return { ...row, categoryId: null, status: "ready" as const };
    }
    if (row.categoryName && row.categoryId == null) {
      const id = categoryIdByName.get(normalizeCategoryName(row.categoryName));
      if (id) return { ...row, categoryId: id };
    }
    return row;
  });

  let importedRows = 0;
  let duplicateRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let balanceEffect = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  const nextTransactions: Transaction[] = [...plan.transactions];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    if (row.status === "invalid") {
      errorRows++;
      rows[i] = { ...row, include: false };
      continue;
    }

    if (row.status === "duplicate") {
      duplicateRows++;
      if (duplicateHandling === "skip" || !row.include) {
        skippedRows++;
        rows[i] = { ...row, include: false, status: "skipped" };
        continue;
      }
      // import_anyway or review with include=true
    }

    if (!row.include) {
      skippedRows++;
      rows[i] = { ...row, status: "skipped" };
      continue;
    }

    if (!row.parsedDate || row.parsedAmountCents == null) {
      errorRows++;
      rows[i] = {
        ...row,
        status: "invalid",
        errors: [...row.errors, "Missing date or amount at commit."],
        include: false,
      };
      continue;
    }

    const txnId = newId("txn");
    const txn: Transaction = {
      id: txnId,
      accountId,
      date: row.parsedDate,
      payeeName: row.payeeName || "Imported",
      categoryId: row.categoryId ?? null,
      memo: row.memo,
      amountCents: row.parsedAmountCents,
      cleared: row.cleared ?? "uncleared",
      approved: true,
      isTransfer: false,
      flag: row.flag,
      importId: row.importId || `imp-${input.batch.id}-${row.rowIndex}`,
      importBatchId: input.batch.id,
    };

    nextTransactions.unshift(txn);
    createdTransactionIds.push(txnId);
    importedRows++;
    balanceEffect += txn.amountCents;
    minDate = !minDate || txn.date < minDate ? txn.date : minDate;
    maxDate = !maxDate || txn.date > maxDate ? txn.date : maxDate;
    rows[i] = { ...row, status: "imported", accountId, include: true };
  }

  plan = { ...plan, transactions: nextTransactions };

  const batch: ImportBatch = {
    ...input.batch,
    status: "committed",
    destinationAccountId: accountId,
    totalRows: rows.length,
    importedRows,
    duplicateRows,
    skippedRows,
    errorRows,
    completedAt: new Date().toISOString(),
    dateRangeStart: minDate,
    dateRangeEnd: maxDate,
    balanceEffectCents: balanceEffect,
    createdCategoryIds,
    createdAccountIds,
    createdTransactionIds,
  };

  const errorCsv = csvRowsToErrorCsv(
    rows.filter((r) => r.status === "invalid" || r.errors.length > 0),
  );

  return { ok: true, plan, batch, rows, errorCsv };
}

function createAccount(
  plan: BudgetPlan,
  input: {
    name: string;
    type: AccountType;
    startingBalanceCents: number;
  },
): { plan: BudgetPlan; account: Account } {
  const kind =
    input.type === "credit_card" || input.type === "line_of_credit"
      ? "credit"
      : input.type.includes("tracking")
        ? "tracking"
        : "on_budget";

  const account: Account = {
    id: newId("acct"),
    name: input.name,
    type: input.type,
    kind,
    startingBalanceCents: input.startingBalanceCents,
    currency: plan.currency,
    closed: false,
    sortOrder: plan.accounts.length,
  };

  return {
    plan: { ...plan, accounts: [...plan.accounts, account] },
    account,
  };
}

export function commitBudgetHistoryImport(input: {
  plan: BudgetPlan;
  batch: ImportBatch;
  rows: ImportRow[];
  monthKey?: string;
  createMissingCategories: boolean;
}): ImportCommitSuccess | ImportCommitFailure {
  try {
    let plan = structuredClone(input.plan);
    const createdCategoryIds: string[] = [];
    const group = ensureImportedGroup(plan);
    if (!plan.categoryGroups.some((g) => g.id === group.id)) {
      plan = { ...plan, categoryGroups: [...plan.categoryGroups, group] };
    }

    const categoryIdByName = new Map(
      plan.categories.map((c) => [normalizeCategoryName(c.name), c.id]),
    );

    let importedRows = 0;
    let errorRows = 0;
    const rows = input.rows.map((row) => ({ ...row }));
    let monthlyBudgets: MonthlyCategoryBudget[] = [...plan.monthlyBudgets];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.include || row.status === "invalid") {
        if (row.status === "invalid") errorRows++;
        continue;
      }
      const name = row.categoryName;
      if (!name || row.parsedAmountCents == null) {
        errorRows++;
        rows[i] = { ...row, status: "invalid", errors: ["Missing category or amount."] };
        continue;
      }

      let categoryId = categoryIdByName.get(normalizeCategoryName(name));
      if (!categoryId && input.createMissingCategories) {
        const category: Category = {
          id: newId("cat"),
          groupId: group.id,
          name,
          sortOrder: plan.categories.length,
          hidden: false,
          rollover: true,
        };
        plan = { ...plan, categories: [...plan.categories, category] };
        categoryId = category.id;
        categoryIdByName.set(normalizeCategoryName(name), categoryId);
        createdCategoryIds.push(categoryId);
      }
      if (!categoryId) {
        errorRows++;
        rows[i] = { ...row, status: "needs_category", include: false };
        continue;
      }

      const monthKey =
        input.monthKey ||
        (row.parsedDate ? toMonthKey(row.parsedDate) : plan.workingMonthKey);

      const existing = monthlyBudgets.find(
        (b) => b.categoryId === categoryId && b.monthKey === monthKey,
      );
      if (existing) {
        monthlyBudgets = monthlyBudgets.map((b) =>
          b === existing
            ? { ...b, assignedCents: Math.abs(row.parsedAmountCents!) }
            : b,
        );
      } else {
        monthlyBudgets.push({
          categoryId,
          monthKey,
          assignedCents: Math.abs(row.parsedAmountCents),
        });
      }
      importedRows++;
      rows[i] = { ...row, status: "imported", categoryId };
    }

    plan = { ...plan, monthlyBudgets };
    const batch: ImportBatch = {
      ...input.batch,
      status: "committed",
      importedRows,
      errorRows,
      skippedRows: rows.length - importedRows - errorRows,
      totalRows: rows.length,
      completedAt: new Date().toISOString(),
      createdCategoryIds,
    };

    return {
      ok: true,
      plan,
      batch,
      rows,
      errorCsv: csvRowsToErrorCsv(rows.filter((r) => r.status === "invalid")),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Budget import failed.",
      batch: { ...input.batch, status: "failed" },
      rows: input.rows,
      errorCsv: "",
    };
  }
}

export function commitAccountBalanceImport(input: {
  plan: BudgetPlan;
  batch: ImportBatch;
  rows: ImportRow[];
}): ImportCommitSuccess | ImportCommitFailure {
  try {
    let plan = structuredClone(input.plan);
    let importedRows = 0;
    let errorRows = 0;
    const rows = input.rows.map((r) => ({ ...r }));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (!row.include) continue;
      const name = row.accountName || row.payeeName;
      const amount =
        row.parsedAmountCents ??
        normalizeMoneyToCents(Object.values(row.raw)[1] ?? "");
      if (!name || amount == null) {
        errorRows++;
        rows[i] = { ...row, status: "invalid", errors: ["Missing account or balance."] };
        continue;
      }
      const existing = plan.accounts.find(
        (a) => normalizeCategoryName(a.name) === normalizeCategoryName(name),
      );
      if (existing) {
        plan = {
          ...plan,
          accounts: plan.accounts.map((a) =>
            a.id === existing.id ? { ...a, startingBalanceCents: amount } : a,
          ),
        };
      } else {
        const created = createAccount(plan, {
          name,
          type: "checking",
          startingBalanceCents: amount,
        });
        plan = created.plan;
      }
      importedRows++;
      rows[i] = { ...row, status: "imported" };
    }

    return {
      ok: true,
      plan,
      batch: {
        ...input.batch,
        status: "committed",
        importedRows,
        errorRows,
        totalRows: rows.length,
        skippedRows: rows.length - importedRows - errorRows,
        completedAt: new Date().toISOString(),
      },
      rows,
      errorCsv: csvRowsToErrorCsv(rows.filter((r) => r.status === "invalid")),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Balance import failed.",
      batch: { ...input.batch, status: "failed" },
      rows: input.rows,
      errorCsv: "",
    };
  }
}

export function toCommitResult(
  result: ImportCommitSuccess | ImportCommitFailure,
): ImportCommitResult {
  return {
    ok: result.ok,
    batch: result.batch,
    rows: result.rows,
    error: result.ok ? undefined : result.error,
    errorCsv: result.errorCsv,
  };
}
