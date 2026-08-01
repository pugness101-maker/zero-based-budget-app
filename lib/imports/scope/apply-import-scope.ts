import { UNCATEGORIZED_ID } from "@/lib/categories/deletion";
import { normalizeCategoryName } from "@/lib/imports/map-categories";
import { categoryKey } from "@/lib/imports/scope/candidates";
import {
  doesPlanMonthOverlapRange,
  formatImportDateRangeLabel,
  isRegisterDateInScope,
} from "@/lib/imports/scope/date-scope";
import type {
  ImportScopeSelection,
  ImportScopeSummary,
  ScopedRegisterDisposition,
  ScopedRegisterRowMeta,
  TransferHandlingMode,
  UnselectedCategoryHandlingMode,
} from "@/lib/imports/scope/types";
import { resolveCategoryNames } from "@/lib/imports/ynab/preview";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { Cents } from "@/lib/money";

export interface ApplyImportScopeResult {
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  effectiveAccountNames: string[];
  effectiveCategoryKeys: string[];
  rowMeta: Map<number, ScopedRegisterRowMeta>;
  summary: ImportScopeSummary;
  annotatedRegister: Array<
    YnabRegisterRow & { scopeDisposition: ScopedRegisterDisposition }
  >;
}

function norm(name: string): string {
  return normalizeCategoryName(name);
}

function isAccountIn(
  name: string,
  selected: Set<string>,
  mode: ImportScopeSelection["accountScopeMode"],
): boolean {
  if (mode === "all") return true;
  return selected.has(norm(name));
}

function isCategoryIn(
  key: string,
  selected: Set<string>,
  mode: ImportScopeSelection["categoryScopeMode"],
): boolean {
  if (mode === "all") return true;
  return selected.has(key);
}

function transferModeFor(
  rowIndex: number,
  scope: ImportScopeSelection,
): TransferHandlingMode {
  if (scope.transferHandlingMode === "review_one_by_one") {
    return scope.transferRowDecisions[rowIndex] ?? "review_one_by_one";
  }
  return scope.transferHandlingMode;
}

function categoryModeFor(
  rowIndex: number,
  scope: ImportScopeSelection,
): UnselectedCategoryHandlingMode {
  if (scope.unselectedCategoryHandlingMode === "review_one_by_one") {
    return scope.categoryRowDecisions[rowIndex] ?? "review_one_by_one";
  }
  return scope.unselectedCategoryHandlingMode;
}

function findTransferCounterpart(
  row: YnabRegisterRow,
  rows: YnabRegisterRow[],
): YnabRegisterRow | undefined {
  if (!row.isTransfer || !row.transferTargetAccount || row.amountCents == null) {
    return undefined;
  }
  const abs = Math.abs(row.amountCents);
  return rows.find((other) => {
    if (other.rowIndex === row.rowIndex || !other.isTransfer || !other.date) {
      return false;
    }
    if (other.date !== row.date || other.amountCents == null) return false;
    if (norm(other.accountName) !== norm(row.transferTargetAccount!)) {
      return false;
    }
    // Prefer perfect opposite signs; also accept same absolute amount
    // (some YNAB CSV exports mis-place inflow/outflow on one leg).
    return (
      other.amountCents === -row.amountCents! ||
      Math.abs(other.amountCents) === abs
    );
  });
}

/**
 * Apply account / category / date scope filters.
 * Pure — commit path must call this again (never trust UI-only filtering).
 */
export function applyImportScope(input: {
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  scope: ImportScopeSelection;
  duplicateRowIndexes?: Set<number>;
}): ApplyImportScopeResult {
  const { scope } = input;
  const selectedAccounts = new Set(scope.selectedAccountNames.map(norm));
  const selectedCategories = new Set(scope.selectedCategoryKeys);
  const effectiveAccounts = new Set(selectedAccounts);
  const effectiveCategories = new Set(selectedCategories);

  const registerBeforeDate = input.registerRows.length;
  const planBeforeDate = input.planRows.length;

  const inDateRegister = input.registerRows.filter((r) =>
    isRegisterDateInScope(r.date, scope.dateRange),
  );
  const inDatePlan = input.planRows.filter((r) =>
    doesPlanMonthOverlapRange(r.monthKey, scope.dateRange),
  );

  // Expand category selection for "add_to_selection" on selected-account rows
  for (const row of inDateRegister) {
    if (!isAccountIn(row.accountName, selectedAccounts, scope.accountScopeMode)) {
      continue;
    }
    if (row.isTransfer) continue;
    const resolved = resolveCategoryNames(row);
    if (!resolved) continue;
    const key = categoryKey(resolved.groupName, resolved.categoryName);
    if (isCategoryIn(key, selectedCategories, scope.categoryScopeMode)) continue;
    if (categoryModeFor(row.rowIndex, scope) === "add_to_selection") {
      effectiveCategories.add(key);
    }
  }

  const rowMeta = new Map<number, ScopedRegisterRowMeta>();
  const annotatedRegister: ApplyImportScopeResult["annotatedRegister"] = [];
  const included: YnabRegisterRow[] = [];
  const includeIndexes = new Set<number>();

  let transfersNeedingReview = 0;
  let uncategorizedMappings = 0;
  let historical = 0;
  let future = 0;
  let invalid = 0;
  let balanceEffect = 0;

  function annotate(
    row: YnabRegisterRow,
    disposition: ScopedRegisterDisposition,
    extra: Partial<ScopedRegisterRowMeta> = {},
  ) {
    const meta: ScopedRegisterRowMeta = {
      rowIndex: row.rowIndex,
      disposition,
      ...extra,
    };
    rowMeta.set(row.rowIndex, meta);
    annotatedRegister.push({ ...row, scopeDisposition: disposition });
  }

  function includeRow(
    row: YnabRegisterRow,
    disposition: ScopedRegisterDisposition,
    extra: Partial<ScopedRegisterRowMeta> = {},
  ) {
    if (includeIndexes.has(row.rowIndex)) return;
    includeIndexes.add(row.rowIndex);
    included.push(row);
    if (row.isFuture) future++;
    else historical++;
    if (row.amountCents != null) balanceEffect += row.amountCents;
    effectiveAccounts.add(norm(row.accountName));
    annotate(row, disposition, extra);
  }

  // Date-excluded rows (for preview)
  for (const row of input.registerRows) {
    if (!isRegisterDateInScope(row.date, scope.dateRange)) {
      annotate(row, "excluded_by_date");
    }
  }

  const pendingRelatedAccounts = new Set<string>();

  for (const row of inDateRegister) {
    if (row.errors.length) {
      invalid++;
      annotate(row, "invalid");
      continue;
    }

    const accountOk = isAccountIn(
      row.accountName,
      selectedAccounts,
      scope.accountScopeMode,
    );
    if (!accountOk) {
      annotate(row, "excluded_by_account");
      continue;
    }

    let working = row;
    let forceOrdinary = false;
    let includedRelatedAccount: string | undefined;

    const targetUnselected =
      row.isTransfer &&
      row.transferTargetAccount &&
      !isAccountIn(
        row.transferTargetAccount,
        selectedAccounts,
        scope.accountScopeMode,
      );

    if (targetUnselected) {
      const mode = transferModeFor(row.rowIndex, scope);
      if (mode === "review_one_by_one") {
        transfersNeedingReview++;
        annotate(row, "transfer_review");
        continue;
      }
      if (mode === "skip") {
        annotate(row, "skipped_transfer");
        continue;
      }
      if (mode === "import_as_normal") {
        forceOrdinary = true;
        working = {
          ...row,
          isTransfer: false,
          transferTargetAccount: undefined,
          payeeName: row.payeeName.replace(
            /^Transfer\s*:\s*/i,
            "Transfer involving ",
          ),
        };
      }
      if (mode === "include_related_account" && row.transferTargetAccount) {
        pendingRelatedAccounts.add(norm(row.transferTargetAccount));
        effectiveAccounts.add(norm(row.transferTargetAccount));
        includedRelatedAccount = row.transferTargetAccount;
      }
    }

    let categoryIdOverride: string | null | undefined;
    if (!working.isTransfer) {
      const resolved = resolveCategoryNames(working);
      if (resolved) {
        const key = categoryKey(resolved.groupName, resolved.categoryName);
        const catOk = isCategoryIn(
          key,
          effectiveCategories,
          scope.categoryScopeMode,
        );
        if (!catOk) {
          const mode = categoryModeFor(row.rowIndex, scope);
          if (mode === "review_one_by_one") {
            annotate(row, "category_review");
            continue;
          }
          if (mode === "skip") {
            annotate(row, "skipped_category");
            continue;
          }
          if (mode === "add_to_selection") {
            effectiveCategories.add(key);
          } else if (mode === "map_to_existing") {
            const mapped = scope.categoryMappings[key];
            if (!mapped) {
              annotate(row, "category_review");
              continue;
            }
            categoryIdOverride = mapped;
          } else if (mode === "import_uncategorized") {
            categoryIdOverride = UNCATEGORIZED_ID;
            uncategorizedMappings++;
          }
        } else {
          effectiveCategories.add(key);
        }
      }
    }

    const disposition: ScopedRegisterDisposition =
      input.duplicateRowIndexes?.has(row.rowIndex)
        ? "duplicate"
        : working.isFuture
          ? "future_scheduled"
          : "included";

    includeRow(working, disposition, {
      categoryIdOverride,
      forceOrdinary,
      includedRelatedAccount,
    });
  }

  // Pull transfer counterparts for related accounts
  for (const row of inDateRegister) {
    if (includeIndexes.has(row.rowIndex)) continue;
    if (!pendingRelatedAccounts.has(norm(row.accountName))) continue;

    // Only include if paired with an already-included transfer
    const paired = included.some((inc) => {
      if (!inc.isTransfer || !inc.transferTargetAccount) return false;
      if (norm(inc.transferTargetAccount) !== norm(row.accountName)) return false;
      const counterpart = findTransferCounterpart(inc, inDateRegister);
      return counterpart?.rowIndex === row.rowIndex;
    });
    if (!paired) continue;

    // Replace prior excluded_by_account annotation
    const priorIdx = annotatedRegister.findIndex(
      (a) => a.rowIndex === row.rowIndex,
    );
    if (priorIdx >= 0) annotatedRegister.splice(priorIdx, 1);
    rowMeta.delete(row.rowIndex);

    includeRow(row, row.isFuture ? "future_scheduled" : "included");
  }

  const includedPlan = inDatePlan.filter((row) => {
    const resolved = resolveCategoryNames(row);
    if (!resolved) return false;
    const key = categoryKey(resolved.groupName, resolved.categoryName);
    const ok = isCategoryIn(key, effectiveCategories, scope.categoryScopeMode);
    if (ok) effectiveCategories.add(key);
    return ok;
  });

  const groupsAffected = new Set(
    [...effectiveCategories].map((k) => k.split("::")[0] ?? ""),
  );

  const nameByNorm = new Map<string, string>();
  for (const row of input.registerRows) {
    if (row.accountName) nameByNorm.set(norm(row.accountName), row.accountName);
    if (row.transferTargetAccount) {
      nameByNorm.set(
        norm(row.transferTargetAccount),
        row.transferTargetAccount,
      );
    }
  }

  const summary: ImportScopeSummary = {
    accountsSelected:
      scope.accountScopeMode === "all"
        ? new Set(input.registerRows.map((r) => norm(r.accountName))).size
        : selectedAccounts.size,
    categoriesSelected:
      scope.categoryScopeMode === "all"
        ? effectiveCategories.size
        : selectedCategories.size,
    categoryGroupsAffected: [...groupsAffected].filter(Boolean).length,
    registerIncluded: included.length,
    registerExcluded: input.registerRows.length - included.length,
    planIncluded: includedPlan.length,
    planExcluded: input.planRows.length - includedPlan.length,
    historicalCount: historical,
    futureScheduledCount: future,
    transfersNeedingReview,
    uncategorizedMappings,
    duplicateCandidates: input.duplicateRowIndexes?.size ?? 0,
    invalidCount: invalid,
    dateRangeLabel: formatImportDateRangeLabel(scope.dateRange),
    dateRangeStart: scope.dateRange.startDate,
    dateRangeEnd: scope.dateRange.endDate,
    balanceEffectCents: balanceEffect as Cents,
    registerBeforeDateFilter: registerBeforeDate,
    registerAfterDateFilter: inDateRegister.length,
    planBeforeDateFilter: planBeforeDate,
    planAfterDateFilter: inDatePlan.length,
  };

  return {
    registerRows: included,
    planRows: includedPlan,
    effectiveAccountNames: [...effectiveAccounts]
      .map((n) => nameByNorm.get(n) ?? n)
      .sort((a, b) => a.localeCompare(b)),
    effectiveCategoryKeys: [...effectiveCategories].sort(),
    rowMeta,
    summary,
    annotatedRegister,
  };
}

export function buildDefaultScopeFromRows(input: {
  accountNames: string[];
  categoryKeys: string[];
}): ImportScopeSelection {
  return {
    selectedAccountNames: [...input.accountNames],
    selectedCategoryKeys: [...input.categoryKeys],
    dateRange: { preset: "all_dates", startDate: null, endDate: null },
    accountScopeMode: "selected",
    categoryScopeMode: "selected",
    // Transfers to unselected accounts go to review — never auto-add accounts
    transferHandlingMode: "review_one_by_one",
    unselectedCategoryHandlingMode: "import_uncategorized",
    categoryMappings: {},
    transferRowDecisions: {},
    categoryRowDecisions: {},
  };
}
