import type {
  BudgetPlan,
  Category,
  CategoryGroup,
  MonthlyCategoryBudget,
  Transaction,
} from "@/lib/types/budget";
import type { MonthKey } from "@/lib/dates";

export function isCategoryActive(category: Category): boolean {
  return (
    !category.deletedAt &&
    !category.hidden &&
    !category.isArchived &&
    !category.mergedIntoCategoryId
  );
}

export function isCategoryVisibleInSelectors(
  category: Category,
  options: { includeHidden?: boolean; includeArchived?: boolean } = {},
): boolean {
  if (category.deletedAt || category.mergedIntoCategoryId) return false;
  if (category.isArchived && !options.includeArchived) return false;
  if (category.hidden && !options.includeHidden) return false;
  return true;
}

export function isGroupActive(group: CategoryGroup): boolean {
  return !group.deletedAt && !group.mergedIntoGroupId && !group.hidden;
}

export function getSelectableCategories(
  plan: BudgetPlan,
  options: { includeHidden?: boolean; includeArchived?: boolean } = {},
): Category[] {
  return plan.categories
    .filter((c) => isCategoryVisibleInSelectors(c, options))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function findDuplicateCategoryName(
  plan: BudgetPlan,
  name: string,
  groupId: string,
  excludeId?: string,
): Category | undefined {
  const normalized = name.trim().toLowerCase();
  return plan.categories.find(
    (c) =>
      !c.deletedAt &&
      c.groupId === groupId &&
      c.id !== excludeId &&
      c.name.trim().toLowerCase() === normalized,
  );
}

export type CategoryDeleteBlocker =
  | { code: "has_transactions"; message: string; count: number }
  | { code: "has_budgets"; message: string; count: number }
  | { code: "has_targets"; message: string; count: number }
  | { code: "has_scheduled"; message: string; count: number }
  | { code: "has_import_refs"; message: string; count: number }
  | { code: "not_found"; message: string; count: 0 };

export function getCategoryDeleteBlockers(
  plan: BudgetPlan,
  categoryId: string,
): CategoryDeleteBlocker[] {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return [{ code: "not_found", message: "Category not found.", count: 0 }];
  }
  const blockers: CategoryDeleteBlocker[] = [];
  const txns = plan.transactions.filter(
    (t) =>
      t.categoryId === categoryId ||
      t.splits?.some((s) => s.categoryId === categoryId),
  );
  if (txns.length) {
    blockers.push({
      code: "has_transactions",
      message: `Has ${txns.length} transaction(s).`,
      count: txns.length,
    });
  }
  const budgets = plan.monthlyBudgets.filter((b) => b.categoryId === categoryId);
  if (budgets.length) {
    blockers.push({
      code: "has_budgets",
      message: `Has ${budgets.length} monthly budget record(s).`,
      count: budgets.length,
    });
  }
  const targets = plan.targets.filter((t) => t.categoryId === categoryId);
  if (targets.length) {
    blockers.push({
      code: "has_targets",
      message: `Has ${targets.length} target(s).`,
      count: targets.length,
    });
  }
  const scheduled = (plan.scheduledTransactions ?? []).filter(
    (s) => s.categoryId === categoryId,
  );
  if (scheduled.length) {
    blockers.push({
      code: "has_scheduled",
      message: `Has ${scheduled.length} scheduled transaction(s).`,
      count: scheduled.length,
    });
  }
  const importRefs = txns.filter((t) => t.importBatchId || t.importId).length;
  if (importRefs) {
    blockers.push({
      code: "has_import_refs",
      message: `Has ${importRefs} imported transaction reference(s).`,
      count: importRefs,
    });
  }
  return blockers;
}

/** True when category has no hard links (txns/scheduled/imports). Budgets alone OK. */
export function canPermanentlyDeleteCategory(
  plan: BudgetPlan,
  categoryId: string,
): boolean {
  const blockers = getCategoryDeleteBlockers(plan, categoryId).filter(
    (b) => b.code !== "has_budgets" && b.code !== "has_targets",
  );
  return blockers.length === 0;
}

/** Legacy helper: budgets no longer block deletion flows. */
export function categoryHasOnlyBudgetHistory(
  plan: BudgetPlan,
  categoryId: string,
): boolean {
  const blockers = getCategoryDeleteBlockers(plan, categoryId);
  return (
    blockers.length > 0 &&
    blockers.every((b) => b.code === "has_budgets" || b.code === "has_targets")
  );
}

export function getGroupCategoryCount(
  plan: BudgetPlan,
  groupId: string,
): number {
  return plan.categories.filter(
    (c) => c.groupId === groupId && !c.deletedAt,
  ).length;
}

export function categoryTransactionCount(
  transactions: Transaction[],
  categoryId: string,
): number {
  return transactions.filter(
    (t) =>
      t.categoryId === categoryId ||
      t.splits?.some((s) => s.categoryId === categoryId),
  ).length;
}

export function categoryLastUsedDate(
  transactions: Transaction[],
  categoryId: string,
): string | undefined {
  const dates = transactions
    .filter(
      (t) =>
        t.categoryId === categoryId ||
        t.splits?.some((s) => s.categoryId === categoryId),
    )
    .map((t) => t.date)
    .sort();
  return dates[dates.length - 1];
}

export function categoryAssignedForMonth(
  budgets: MonthlyCategoryBudget[],
  categoryId: string,
  monthKey: MonthKey,
): number {
  return (
    budgets.find((b) => b.categoryId === categoryId && b.monthKey === monthKey)
      ?.assignedCents ?? 0
  );
}

export interface MergePreview {
  sourceId: string;
  destinationId: string;
  transactionCount: number;
  budgetHistoryCount: number;
  scheduledCount: number;
  targetCount: number;
  dateRange: { start?: string; end?: string };
}

export function buildMergePreview(
  plan: BudgetPlan,
  sourceId: string,
  destinationId: string,
): MergePreview | null {
  if (sourceId === destinationId) return null;
  const source = plan.categories.find((c) => c.id === sourceId);
  const dest = plan.categories.find((c) => c.id === destinationId);
  if (!source || !dest || source.deletedAt || dest.deletedAt) return null;

  const txns = plan.transactions.filter(
    (t) =>
      t.categoryId === sourceId ||
      t.splits?.some((s) => s.categoryId === sourceId),
  );
  const dates = txns.map((t) => t.date).sort();
  return {
    sourceId,
    destinationId,
    transactionCount: txns.length,
    budgetHistoryCount: plan.monthlyBudgets.filter(
      (b) => b.categoryId === sourceId,
    ).length,
    scheduledCount: (plan.scheduledTransactions ?? []).filter(
      (s) => s.categoryId === sourceId,
    ).length,
    targetCount: plan.targets.filter((t) => t.categoryId === sourceId).length,
    dateRange: { start: dates[0], end: dates[dates.length - 1] },
  };
}

export function migrateCategoryFields(category: Category): Category {
  return {
    ...category,
    pinned: Boolean(category.pinned),
    isArchived: Boolean(category.isArchived),
    reportIncluded: category.reportIncluded ?? true,
  };
}

export function migratePlanCategories(plan: BudgetPlan): BudgetPlan {
  return {
    ...plan,
    categories: plan.categories.map(migrateCategoryFields),
    categoryGroups: plan.categoryGroups.map((g) => ({ ...g })),
  };
}
