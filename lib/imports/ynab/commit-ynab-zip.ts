import type {
  Account,
  BudgetPlan,
  Category,
  CategoryGroup,
  MonthlyCategoryBudget,
  Payee,
  ScheduledTransaction,
  Transaction,
} from "@/lib/types/budget";
import type {
  ImportBatch,
  ImportCommitResult,
  MergeMode,
} from "@/lib/types/import";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import {
  resolveCategoryNames,
} from "@/lib/imports/ynab/preview";
import {
  isCreditCardPaymentsGroup,
  toAppAccountKind,
  toAppAccountType,
  type YnabAccountTypeChoice,
} from "@/lib/imports/ynab/suggest-account-type";
import { normalizeCategoryName } from "@/lib/imports/map-categories";
import { detectDuplicates } from "@/lib/imports/detect-duplicates";
import { csvRowsToErrorCsv } from "@/lib/imports/parse-csv";
import type { ImportRow } from "@/lib/types/import";

export type FutureRowHandling =
  | "import_as_scheduled"
  | "import_as_transactions"
  | "skip";

export interface YnabAccountMapping {
  accountName: string;
  type: YnabAccountTypeChoice;
  kindOverride?: "on_budget" | "credit" | "tracking";
  existingAccountId?: string;
}

export interface YnabCategoryMergeDecision {
  /** Keep both, or merge sourceKey into keepKey */
  sourceKey: string;
  keepKey: string;
  merge: boolean;
}

export interface YnabZipCommitInput {
  plan: BudgetPlan;
  batch: ImportBatch;
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  accountMappings: YnabAccountMapping[];
  categoryMerges: YnabCategoryMergeDecision[];
  futureHandling: FutureRowHandling;
  mergeMode: MergeMode;
  importDateIso: string;
  duplicateHandling: "skip" | "import_anyway";
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function toImportRow(row: YnabRegisterRow, batchId: string): ImportRow {
  return {
    id: `${batchId}-reg-${row.rowIndex}`,
    batchId,
    rowIndex: row.rowIndex,
    raw: row.raw,
    parsedDate: row.date ?? undefined,
    parsedAmountCents: row.amountCents ?? undefined,
    payeeName: row.payeeName,
    memo: row.memo,
    categoryName: row.category ?? row.categoryGroupCategory,
    accountName: row.accountName,
    cleared: row.cleared,
    flag: row.flag,
    importId: `ynab-${row.accountName}-${row.date}-${row.payeeName}-${row.amountCents}-${row.rowIndex}`,
    status: row.errors.length ? "invalid" : "ready",
    errors: [...row.errors],
    include: row.errors.length === 0,
  };
}

/**
 * Full YNAB ZIP commit in required order.
 * Pure function — caller creates backup and persists result.
 */
export type YnabZipCommitResult = ImportCommitResult & {
  plan?: BudgetPlan;
};

export function commitYnabZipImport(
  input: YnabZipCommitInput,
): YnabZipCommitResult {
  try {
    return commitYnabZipImportUnsafe(input);
  } catch (err) {
    return {
      ok: false,
      batch: {
        ...input.batch,
        status: "failed",
        completedAt: new Date().toISOString(),
      },
      rows: input.registerRows.map((r) => toImportRow(r, input.batch.id)),
      error: err instanceof Error ? err.message : "YNAB import failed.",
      errorCsv: "",
    };
  }
}

function commitYnabZipImportUnsafe(
  input: YnabZipCommitInput,
): YnabZipCommitResult {
  let plan = structuredClone(input.plan);
  const createdAccountIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdTransactionIds: string[] = [];
  const createdScheduledIds: string[] = [];
  const importRows: ImportRow[] = [];

  // 1. Backup is caller's responsibility (already done)

  // 2. Account mapping
  const accountIdByName = new Map<string, string>();
  for (const acct of plan.accounts) {
    accountIdByName.set(normalizeCategoryName(acct.name), acct.id);
  }

  for (const mapping of input.accountMappings) {
    const key = normalizeCategoryName(mapping.accountName);
    if (mapping.existingAccountId) {
      accountIdByName.set(key, mapping.existingAccountId);
      continue;
    }
    const existing = accountIdByName.get(key);
    if (existing) continue;

    const type = toAppAccountType(mapping.type);
    const kind = mapping.kindOverride ?? toAppAccountKind(mapping.type);
    const account: Account = {
      id: newId("acct"),
      name: mapping.accountName,
      type,
      kind,
      startingBalanceCents: 0,
      currency: plan.currency,
      closed: false,
      sortOrder: plan.accounts.length,
    };
    plan = { ...plan, accounts: [...plan.accounts, account] };
    accountIdByName.set(key, account.id);
    createdAccountIds.push(account.id);
  }

  // Ensure any register accounts not in mappings still get created as checking
  for (const row of input.registerRows) {
    const key = normalizeCategoryName(row.accountName);
    if (!accountIdByName.has(key) && row.accountName) {
      const account: Account = {
        id: newId("acct"),
        name: row.accountName,
        type: "checking",
        kind: "on_budget",
        startingBalanceCents: 0,
        currency: plan.currency,
        closed: false,
        sortOrder: plan.accounts.length,
      };
      plan = { ...plan, accounts: [...plan.accounts, account] };
      accountIdByName.set(key, account.id);
      createdAccountIds.push(account.id);
    }
    if (row.transferTargetAccount) {
      const tKey = normalizeCategoryName(row.transferTargetAccount);
      if (!accountIdByName.has(tKey)) {
        const account: Account = {
          id: newId("acct"),
          name: row.transferTargetAccount,
          type: "checking",
          kind: "on_budget",
          startingBalanceCents: 0,
          currency: plan.currency,
          closed: false,
          sortOrder: plan.accounts.length,
        };
        plan = { ...plan, accounts: [...plan.accounts, account] };
        accountIdByName.set(tKey, account.id);
        createdAccountIds.push(account.id);
      }
    }
  }

  // 3–4. Category groups + categories
  const groupIdByName = new Map<string, string>();
  for (const g of plan.categoryGroups) {
    groupIdByName.set(normalizeCategoryName(g.name), g.id);
  }

  const categoryIdByKey = new Map<string, string>();
  for (const c of plan.categories) {
    const group = plan.categoryGroups.find((g) => g.id === c.groupId);
    const key = `${normalizeCategoryName(group?.name ?? "")}::${normalizeCategoryName(c.name)}`;
    categoryIdByKey.set(key, c.id);
    categoryIdByKey.set(normalizeCategoryName(c.name), c.id);
  }

  // Apply merge decisions: sourceKey merges into keepKey
  const mergeRedirect = new Map<string, string>();
  for (const m of input.categoryMerges) {
    if (m.merge) mergeRedirect.set(m.sourceKey, m.keepKey);
  }

  function ensureGroup(name: string): string {
    const key = normalizeCategoryName(name);
    const existing = groupIdByName.get(key);
    if (existing) return existing;
    const group: CategoryGroup = {
      id: newId("grp"),
      name,
      sortOrder: plan.categoryGroups.length,
      hidden: false,
    };
    plan = { ...plan, categoryGroups: [...plan.categoryGroups, group] };
    groupIdByName.set(key, group.id);
    return group.id;
  }

  function ensureCategory(groupName: string, categoryName: string): string {
    let key = `${normalizeCategoryName(groupName)}::${normalizeCategoryName(categoryName)}`;
    if (mergeRedirect.has(key)) key = mergeRedirect.get(key)!;
    const existing = categoryIdByKey.get(key);
    if (existing) return existing;

    const groupId = ensureGroup(groupName);
    const category: Category = {
      id: newId("cat"),
      groupId,
      name: categoryName,
      sortOrder: plan.categories.filter((c) => c.groupId === groupId).length,
      hidden: false,
      rollover: true,
      notes: isCreditCardPaymentsGroup(groupName)
        ? "Credit card payment category"
        : undefined,
    };
    plan = { ...plan, categories: [...plan.categories, category] };
    categoryIdByKey.set(key, category.id);
    categoryIdByKey.set(normalizeCategoryName(categoryName), category.id);
    createdCategoryIds.push(category.id);
    return category.id;
  }

  // Collect all categories from register + plan
  for (const row of [...input.registerRows, ...input.planRows]) {
    const resolved = resolveCategoryNames(row);
    if (resolved) ensureCategory(resolved.groupName, resolved.categoryName);
  }

  // Credit Card Payments → try match payment categories to CC accounts
  for (const cat of plan.categories) {
    const group = plan.categoryGroups.find((g) => g.id === cat.groupId);
    if (!group || !isCreditCardPaymentsGroup(group.name)) continue;
    const matchAcct = plan.accounts.find(
      (a) =>
        a.kind === "credit" &&
        (normalizeCategoryName(a.name).includes(
          normalizeCategoryName(cat.name),
        ) ||
          normalizeCategoryName(cat.name).includes(
            normalizeCategoryName(a.name),
          )),
    );
    if (matchAcct) {
      plan = {
        ...plan,
        categories: plan.categories.map((c) =>
          c.id === cat.id
            ? {
                ...c,
                notes: `Payment category for ${matchAcct.name}`,
              }
            : c,
        ),
      };
    }
  }

  // 5. Plan history — preserve YNAB values, do not recalculate
  const monthlyBudgets: MonthlyCategoryBudget[] = [...plan.monthlyBudgets];
  let planImported = 0;
  for (const row of input.planRows) {
    if (row.errors.length || !row.monthKey) continue;
    const resolved = resolveCategoryNames(row);
    if (!resolved || row.assignedCents == null) continue;
    const categoryId = ensureCategory(
      resolved.groupName,
      resolved.categoryName,
    );
    const existingIdx = monthlyBudgets.findIndex(
      (b) => b.categoryId === categoryId && b.monthKey === row.monthKey,
    );
    const record: MonthlyCategoryBudget = {
      categoryId,
      monthKey: row.monthKey,
      assignedCents: row.assignedCents,
      activityCents: row.activityCents ?? undefined,
      availableCents: row.availableCents ?? undefined,
      source: "ynab_import",
    };
    if (existingIdx >= 0) {
      if (input.mergeMode === "replace" || monthlyBudgets[existingIdx]!.source === "ynab_import") {
        monthlyBudgets[existingIdx] = record;
      } else if (input.mergeMode === "merge") {
        // Keep existing app values for current engine months; still store YNAB if empty
        monthlyBudgets[existingIdx] = {
          ...monthlyBudgets[existingIdx]!,
          ...record,
        };
      }
    } else {
      monthlyBudgets.push(record);
    }
    planImported++;
  }
  plan = { ...plan, monthlyBudgets };

  // 6. Payees
  const payeeIdByName = new Map(
    plan.payees.map((p) => [normalizeCategoryName(p.name), p.id]),
  );
  for (const row of input.registerRows) {
    if (!row.payeeName || row.isTransfer) continue;
    const key = normalizeCategoryName(row.payeeName);
    if (payeeIdByName.has(key)) continue;
    const payee: Payee = { id: newId("pay"), name: row.payeeName };
    plan = { ...plan, payees: [...plan.payees, payee] };
    payeeIdByName.set(key, payee.id);
  }

  // 7–9. Transactions, transfers, scheduled
  let importedRows = 0;
  let duplicateRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let scheduledRows = 0;
  let balanceEffect = 0;
  let minDate: string | undefined;
  let maxDate: string | undefined;

  const nextTxns: Transaction[] = [...plan.transactions];
  const nextScheduled: ScheduledTransaction[] = [
    ...(plan.scheduledTransactions ?? []),
  ];

  // Pre-mark duplicates per account
  const rowsByAccount = new Map<string, YnabRegisterRow[]>();
  for (const row of input.registerRows) {
    const list = rowsByAccount.get(row.accountName) ?? [];
    list.push(row);
    rowsByAccount.set(row.accountName, list);
  }

  const duplicateRowIndexes = new Set<number>();
  for (const [accountName, rows] of rowsByAccount) {
    const accountId = accountIdByName.get(normalizeCategoryName(accountName));
    if (!accountId) continue;
    const asImportRows = rows.map((r) => toImportRow(r, input.batch.id));
    const detected = detectDuplicates(
      asImportRows,
      plan.transactions,
      accountId,
    );
    for (const r of detected.rows) {
      if (r.status === "duplicate") duplicateRowIndexes.add(r.rowIndex);
    }
  }

  // Pair transfers: match Transfer : X outflows with counterpart inflows
  const transferPairs = new Map<number, number>();
  const registerByIndex = new Map(
    input.registerRows.map((r) => [r.rowIndex, r]),
  );

  for (const row of input.registerRows) {
    if (!row.isTransfer || !row.transferTargetAccount || !row.date) continue;
    const rowAmount = row.amountCents;
    if (rowAmount == null || rowAmount >= 0) continue;
    const counterpart = input.registerRows.find(
      (other) =>
        other.rowIndex !== row.rowIndex &&
        other.isTransfer &&
        other.date === row.date &&
        other.amountCents === -rowAmount &&
        normalizeCategoryName(other.accountName) ===
          normalizeCategoryName(row.transferTargetAccount!) &&
        !transferPairs.has(other.rowIndex),
    );
    if (counterpart) {
      transferPairs.set(row.rowIndex, counterpart.rowIndex);
      transferPairs.set(counterpart.rowIndex, row.rowIndex);
    }
  }

  const processedTransfer = new Set<number>();

  for (const row of input.registerRows) {
    const baseRow = toImportRow(row, input.batch.id);

    if (row.errors.length) {
      errorRows++;
      importRows.push({ ...baseRow, status: "invalid", include: false });
      continue;
    }

    // Zero amount: only keep future uncleared as scheduled candidates
    if (row.isZeroAmount) {
      if (!(row.isFuture && row.cleared === "uncleared")) {
        skippedRows++;
        importRows.push({
          ...baseRow,
          status: "skipped",
          include: false,
          errors: [...baseRow.errors, "Zero-amount row skipped."],
        });
        continue;
      }
    }

    if (duplicateRowIndexes.has(row.rowIndex)) {
      duplicateRows++;
      if (input.duplicateHandling === "skip") {
        skippedRows++;
        importRows.push({
          ...baseRow,
          status: "duplicate",
          include: false,
        });
        continue;
      }
    }

    // Future row handling — do not silently mix into historical spending
    if (row.isFuture) {
      if (input.futureHandling === "skip") {
        skippedRows++;
        importRows.push({
          ...baseRow,
          status: "skipped",
          include: false,
          errors: ["Future row skipped."],
        });
        continue;
      }
      if (input.futureHandling === "import_as_scheduled") {
        const accountId = accountIdByName.get(
          normalizeCategoryName(row.accountName),
        )!;
        const resolved = resolveCategoryNames(row);
        const categoryId = resolved
          ? ensureCategory(resolved.groupName, resolved.categoryName)
          : null;
        const schedId = newId("sched");
        const scheduled: ScheduledTransaction = {
          id: schedId,
          accountId,
          date: row.date!,
          payeeName: row.payeeName,
          categoryId,
          memo: row.memo,
          amountCents: row.amountCents ?? 0,
          flag: row.flag,
          importBatchId: input.batch.id,
          importId: baseRow.importId,
          status: "pending",
        };
        nextScheduled.push(scheduled);
        createdScheduledIds.push(schedId);
        scheduledRows++;
        importedRows++;
        importRows.push({ ...baseRow, status: "imported", accountId });
        continue;
      }
      // import_as_transactions — fall through as ordinary txn
    }

    if (processedTransfer.has(row.rowIndex)) {
      importRows.push({ ...baseRow, status: "imported" });
      continue;
    }

    const accountId = accountIdByName.get(
      normalizeCategoryName(row.accountName),
    );
    if (!accountId) {
      errorRows++;
      importRows.push({
        ...baseRow,
        status: "invalid",
        errors: ["Account not mapped."],
        include: false,
      });
      continue;
    }

    const pairIndex = transferPairs.get(row.rowIndex);
    if (row.isTransfer && pairIndex != null) {
      const other = registerByIndex.get(pairIndex)!;
      const otherAccountId = accountIdByName.get(
        normalizeCategoryName(other.accountName),
      )!;
      const transferId = newId("xfer");
      const outId = newId("txn");
      const inId = newId("txn");

      const outIsThis = (row.amountCents ?? 0) < 0;
      const fromRow = outIsThis ? row : other;
      const toRow = outIsThis ? other : row;
      const fromAccountId = outIsThis ? accountId : otherAccountId;
      const toAccountId = outIsThis ? otherAccountId : accountId;

      const outTxn: Transaction = {
        id: outId,
        accountId: fromAccountId,
        date: fromRow.date!,
        payeeName: fromRow.payeeName,
        categoryId: null,
        memo: fromRow.memo,
        amountCents: -Math.abs(fromRow.amountCents ?? 0),
        cleared: fromRow.cleared,
        approved: true,
        isTransfer: true,
        transferId,
        transferPairId: inId,
        flag: fromRow.flag,
        importId: `ynab-xfer-out-${fromRow.rowIndex}`,
        importBatchId: input.batch.id,
      };
      const inTxn: Transaction = {
        id: inId,
        accountId: toAccountId,
        date: toRow.date!,
        payeeName: toRow.payeeName,
        categoryId: null,
        memo: toRow.memo,
        amountCents: Math.abs(toRow.amountCents ?? 0),
        cleared: toRow.cleared,
        approved: true,
        isTransfer: true,
        transferId,
        transferPairId: outId,
        flag: toRow.flag,
        importId: `ynab-xfer-in-${toRow.rowIndex}`,
        importBatchId: input.batch.id,
      };
      nextTxns.unshift(outTxn, inTxn);
      createdTransactionIds.push(outId, inId);
      processedTransfer.add(row.rowIndex);
      processedTransfer.add(pairIndex);
      importedRows += 2;
      // Transfers between on-budget do not affect spending; still affect balances
      balanceEffect += outTxn.amountCents + inTxn.amountCents;
      minDate = !minDate || outTxn.date < minDate ? outTxn.date : minDate;
      maxDate = !maxDate || outTxn.date > maxDate ? outTxn.date : maxDate;
      importRows.push(
        { ...baseRow, status: "imported", accountId },
        {
          ...toImportRow(other, input.batch.id),
          status: "imported",
          accountId: otherAccountId,
        },
      );
      continue;
    }

    // Ordinary transaction (including unpaired transfers)
    const resolved = resolveCategoryNames(row);
    const categoryId =
      row.isTransfer
        ? null
        : resolved
          ? ensureCategory(resolved.groupName, resolved.categoryName)
          : null;

    const txnId = newId("txn");
    const txn: Transaction = {
      id: txnId,
      accountId,
      date: row.date!,
      payeeName: row.payeeName,
      categoryId,
      memo: row.memo,
      amountCents: row.amountCents ?? 0,
      cleared: row.cleared,
      approved: true,
      isTransfer: row.isTransfer,
      flag: row.flag,
      importId: baseRow.importId,
      importBatchId: input.batch.id,
    };
    nextTxns.unshift(txn);
    createdTransactionIds.push(txnId);
    importedRows++;
    balanceEffect += txn.amountCents;
    minDate = !minDate || txn.date < minDate ? txn.date : minDate;
    maxDate = !maxDate || txn.date > maxDate ? txn.date : maxDate;
    importRows.push({ ...baseRow, status: "imported", accountId, categoryId });
  }

  plan = {
    ...plan,
    transactions: nextTxns,
    scheduledTransactions: nextScheduled,
  };

  // 10. Recalculate current balances — starting balances unchanged;
  // working balances derive from transactions (engine). Optionally nudge working month.
  if (maxDate) {
    plan = {
      ...plan,
      workingMonthKey: maxDate.slice(0, 7),
    };
  }

  // 11. Data Health checks (lightweight)
  const healthIssues: string[] = [];
  const orphanTransfers = plan.transactions.filter(
    (t) => t.isTransfer && t.transferPairId &&
      !plan.transactions.some((x) => x.id === t.transferPairId),
  );
  if (orphanTransfers.length) {
    healthIssues.push(`${orphanTransfers.length} orphaned transfer links`);
  }

  // 12. Commit batch
  const batch: ImportBatch = {
    ...input.batch,
    status: "committed",
    importType: "ynab_zip",
    totalRows: input.registerRows.length + input.planRows.length,
    importedRows: importedRows + planImported,
    duplicateRows,
    skippedRows,
    errorRows,
    completedAt: new Date().toISOString(),
    dateRangeStart: minDate,
    dateRangeEnd: maxDate,
    balanceEffectCents: balanceEffect,
    createdAccountIds,
    createdCategoryIds,
    createdTransactionIds: [
      ...createdTransactionIds,
      ...createdScheduledIds,
    ],
    mappingJson: input.batch.mappingJson ?? {},
    metadata: {
      format: "ynab_zip",
      health: healthIssues.join("; ") || "ok",
      scheduled: String(scheduledRows),
      planRows: String(planImported),
    },
  };

  return {
    ok: true,
    plan,
    batch,
    rows: importRows,
    errorCsv: csvRowsToErrorCsv(
      importRows.filter((r) => r.status === "invalid" || r.errors.length > 0),
    ),
  };
}
