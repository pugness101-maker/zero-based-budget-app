import { getCategoryAvailable } from "@/lib/calculations/plan";
import {
  applyAvailableDisposition,
  deleteCategoryAndBudgetHistory,
  forceDeleteToUncategorized,
  getHardDeleteLinks,
  moveHistoryThenDelete,
  restoreDeletedCategory,
  type AvailableDisposition,
} from "@/lib/categories/deletion";
import {
  archiveCategory,
  bulkMoveCategories,
  bulkSetCategoryHidden,
  mergeCategories,
  unarchiveCategory,
  unhideCategory,
  type OpResult,
} from "@/lib/categories/operations";
import { buildMergePreview } from "@/lib/categories/lifecycle";
import type { BudgetPlan } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type { MonthKey } from "@/lib/dates";

export type BulkDeleteClass =
  | "safe_empty"
  | "budget_history_only"
  | "has_transactions"
  | "has_scheduled"
  | "has_import_refs"
  | "archive_recommended";

export interface BulkCategoryReviewRow {
  categoryId: string;
  name: string;
  groupName: string;
  transactionCount: number;
  budgetRecordCount: number;
  targetCount: number;
  scheduledCount: number;
  importRefCount: number;
  availableCents: Cents;
  classification: BulkDeleteClass;
  recommended:
    | "delete_empty"
    | "delete_budget_history"
    | "reassign"
    | "force_uncategorized"
    | "archive";
}

export interface BulkImpactSummary {
  categoryCount: number;
  transactionCount: number;
  budgetHistoryCount: number;
  targetCount: number;
  scheduledCount: number;
  combinedAvailableCents: Cents;
  rows: BulkCategoryReviewRow[];
}

export type BulkAvailableDisposition =
  | AvailableDisposition
  | { type: "review_each" }
  | { type: "cancel" };

function classifyCategory(
  plan: BudgetPlan,
  categoryId: string,
  monthKey: MonthKey,
): BulkCategoryReviewRow | null {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) return null;
  const group = plan.categoryGroups.find((g) => g.id === category.groupId);
  const links = getHardDeleteLinks(plan, categoryId);
  const budgetRecordCount = plan.monthlyBudgets.filter(
    (b) => b.categoryId === categoryId,
  ).length;
  const targetCount = plan.targets.filter((t) => t.categoryId === categoryId)
    .length;
  const availableCents = getCategoryAvailable(plan, category, monthKey);

  let classification: BulkDeleteClass = "safe_empty";
  let recommended: BulkCategoryReviewRow["recommended"] = "delete_empty";

  if (links.scheduled.length > 0) {
    classification = "has_scheduled";
    recommended = "reassign";
  } else if (links.importRefs.length > 0) {
    classification = "has_import_refs";
    recommended = "reassign";
  } else if (links.transactions.length > 0) {
    classification = "has_transactions";
    recommended = "reassign";
  } else if (budgetRecordCount > 0 || targetCount > 0) {
    classification = "budget_history_only";
    recommended = "delete_budget_history";
  } else {
    classification = "safe_empty";
    recommended = "delete_empty";
  }

  if (links.hasHardLinks && recommended === "reassign") {
    // Keep archive as alternate recommendation label for UI
    if (links.transactions.length > 5) {
      classification =
        classification === "has_scheduled"
          ? classification
          : "archive_recommended";
    }
  }

  return {
    categoryId,
    name: category.name,
    groupName: group?.name ?? "—",
    transactionCount: links.transactions.length,
    budgetRecordCount,
    targetCount,
    scheduledCount: links.scheduled.length,
    importRefCount: links.importRefs.length,
    availableCents,
    classification,
    recommended,
  };
}

export function buildBulkImpactSummary(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
): BulkImpactSummary {
  const rows: BulkCategoryReviewRow[] = [];
  let transactionCount = 0;
  let budgetHistoryCount = 0;
  let targetCount = 0;
  let scheduledCount = 0;
  let combinedAvailableCents = 0 as Cents;

  for (const id of categoryIds) {
    const row = classifyCategory(plan, id, monthKey);
    if (!row) continue;
    rows.push(row);
    transactionCount += row.transactionCount;
    budgetHistoryCount += row.budgetRecordCount;
    targetCount += row.targetCount;
    scheduledCount += row.scheduledCount;
    combinedAvailableCents = (combinedAvailableCents +
      row.availableCents) as Cents;
  }

  return {
    categoryCount: rows.length,
    transactionCount,
    budgetHistoryCount,
    targetCount,
    scheduledCount,
    combinedAvailableCents,
    rows,
  };
}

function applyBulkAvailable(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
  disposition: AvailableDisposition | undefined,
): OpResult {
  if (!disposition) return { ok: true, plan };
  let next = plan;
  for (const id of categoryIds) {
    const cat = next.categories.find((c) => c.id === id);
    if (!cat || cat.deletedAt) continue;
    const available = getCategoryAvailable(next, cat, monthKey);
    if (available === 0) continue;
    const result = applyAvailableDisposition(next, id, monthKey, disposition);
    if (!result.ok) return result;
    next = result.plan;
  }
  return { ok: true, plan: next };
}

export function bulkArchiveCategories(
  plan: BudgetPlan,
  categoryIds: string[],
): OpResult {
  let next = plan;
  for (const id of categoryIds) {
    const result = archiveCategory(next, id);
    if (!result.ok) return result;
    next = result.plan;
  }
  return { ok: true, plan: next };
}

export function bulkRestoreCategories(
  plan: BudgetPlan,
  categoryIds: string[],
): OpResult {
  let next = plan;
  for (const id of categoryIds) {
    const cat = next.categories.find((c) => c.id === id);
    if (!cat) continue;
    if (cat.deletedAt) {
      const result = restoreDeletedCategory(next, id);
      if (!result.ok) return result;
      next = result.plan;
    } else if (cat.isArchived) {
      const result = unarchiveCategory(next, id);
      if (!result.ok) return result;
      next = result.plan;
    } else if (cat.hidden) {
      const result = unhideCategory(next, id);
      if (!result.ok) return result;
      next = result.plan;
    }
  }
  return { ok: true, plan: next };
}

export function bulkHideWithImpact(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
  available?: AvailableDisposition,
): OpResult {
  const disposed = applyBulkAvailable(plan, categoryIds, monthKey, available);
  if (!disposed.ok) return disposed;
  return bulkSetCategoryHidden(disposed.plan, categoryIds, true);
}

export function bulkArchiveWithImpact(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
  available?: AvailableDisposition,
): OpResult {
  const disposed = applyBulkAvailable(plan, categoryIds, monthKey, available);
  if (!disposed.ok) return disposed;
  return bulkArchiveCategories(disposed.plan, categoryIds);
}

export function bulkMergeCategories(
  plan: BudgetPlan,
  sourceIds: string[],
  destinationId: string,
  monthKey: MonthKey,
  available?: AvailableDisposition,
): OpResult {
  if (sourceIds.includes(destinationId)) {
    return {
      ok: false,
      error:
        "Destination must be outside the selected sources, or remove it from the selection first.",
    };
  }
  const dest = plan.categories.find(
    (c) => c.id === destinationId && !c.deletedAt,
  );
  if (!dest) return { ok: false, error: "Destination category not found." };

  const sources = sourceIds.filter((id) => id !== destinationId);
  if (!sources.length) {
    return { ok: false, error: "Select at least one source category to merge." };
  }

  let next = plan;
  const disposed = applyBulkAvailable(next, sources, monthKey, available);
  if (!disposed.ok) return disposed;
  next = disposed.plan;

  for (const sourceId of sources) {
    const result = mergeCategories(next, sourceId, destinationId);
    if (!result.ok) return result;
    next = result.plan;
  }
  return { ok: true, entityId: destinationId, plan: next };
}

export function buildBulkMergePreview(
  plan: BudgetPlan,
  sourceIds: string[],
  destinationId: string,
) {
  let transactionCount = 0;
  let budgetHistoryCount = 0;
  let scheduledCount = 0;
  let targetCount = 0;
  let payeeRules = 0;
  for (const id of sourceIds) {
    if (id === destinationId) continue;
    const preview = buildMergePreview(plan, id, destinationId);
    if (!preview) continue;
    transactionCount += preview.transactionCount;
    budgetHistoryCount += preview.budgetHistoryCount;
    scheduledCount += preview.scheduledCount;
    targetCount += preview.targetCount;
    payeeRules += plan.payees.filter((p) => p.defaultCategoryId === id).length;
  }
  return {
    transactionCount,
    budgetHistoryCount,
    scheduledCount,
    targetCount,
    payeeRules,
    sourceCount: sourceIds.filter((id) => id !== destinationId).length,
  };
}

export type BulkDeleteMode =
  | "safe_only"
  | "budget_history"
  | "reassign"
  | "force_uncategorized"
  | "archive_unsafe";

export function bulkDeleteCategories(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
  mode: BulkDeleteMode,
  options: {
    destinationId?: string;
    available?: AvailableDisposition;
    confirmForce?: boolean;
  } = {},
): OpResult {
  const summary = buildBulkImpactSummary(plan, categoryIds, monthKey);
  let next = plan;

  if (mode !== "archive_unsafe") {
    const disposed = applyBulkAvailable(
      next,
      categoryIds,
      monthKey,
      options.available,
    );
    if (!disposed.ok) return disposed;
    next = disposed.plan;
  }

  switch (mode) {
    case "safe_only": {
      for (const row of summary.rows) {
        if (row.classification !== "safe_empty") continue;
        const result = deleteCategoryAndBudgetHistory(
          next,
          row.categoryId,
          row.name,
        );
        if (!result.ok) return result;
        next = result.plan;
      }
      return { ok: true, plan: next };
    }
    case "budget_history": {
      for (const row of summary.rows) {
        if (
          row.classification !== "safe_empty" &&
          row.classification !== "budget_history_only"
        ) {
          continue;
        }
        const result = deleteCategoryAndBudgetHistory(
          next,
          row.categoryId,
          row.name,
        );
        if (!result.ok) return result;
        next = result.plan;
      }
      return { ok: true, plan: next };
    }
    case "reassign": {
      if (!options.destinationId) {
        return { ok: false, error: "Choose a destination category." };
      }
      if (categoryIds.includes(options.destinationId)) {
        return {
          ok: false,
          error: "Destination cannot be one of the selected source categories.",
        };
      }
      for (const id of categoryIds) {
        const result = moveHistoryThenDelete(next, id, options.destinationId);
        if (!result.ok) return result;
        next = result.plan;
      }
      return { ok: true, plan: next };
    }
    case "force_uncategorized": {
      if (!options.confirmForce) {
        return {
          ok: false,
          error: "Confirm force reassignment to Uncategorized.",
        };
      }
      for (const id of categoryIds) {
        const result = forceDeleteToUncategorized(next, id);
        if (!result.ok) return result;
        next = result.plan;
      }
      return { ok: true, plan: next };
    }
    case "archive_unsafe": {
      for (const row of summary.rows) {
        if (row.classification === "safe_empty") continue;
        if (row.classification === "budget_history_only") continue;
        const result = archiveCategory(next, row.categoryId);
        if (!result.ok) return result;
        next = result.plan;
      }
      return { ok: true, plan: next };
    }
    default:
      return { ok: false, error: "Unknown bulk delete mode." };
  }
}

export function bulkMoveWithValidation(
  plan: BudgetPlan,
  categoryIds: string[],
  groupId: string,
): OpResult {
  const group = plan.categoryGroups.find((g) => g.id === groupId);
  if (!group || group.deletedAt) {
    return { ok: false, error: "Destination group not found." };
  }
  if (group.hidden) {
    return { ok: false, error: "Cannot move into a hidden or archived group." };
  }
  return bulkMoveCategories(plan, categoryIds, groupId);
}

/** Combined available across selected categories for balance prompt. */
export function combinedAvailableCents(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
): Cents {
  return buildBulkImpactSummary(plan, categoryIds, monthKey)
    .combinedAvailableCents;
}

export function needsAvailablePrompt(
  plan: BudgetPlan,
  categoryIds: string[],
  monthKey: MonthKey,
): boolean {
  return combinedAvailableCents(plan, categoryIds, monthKey) !== 0;
}
