import { getCategoryAvailable } from "@/lib/calculations/plan";
import type { BudgetPlan, Category, MonthlyCategoryBudget } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type { MonthKey } from "@/lib/dates";
import { reassignCategoryId } from "@/lib/categories/reassign";

export const UNCATEGORIZED_ID = "cat-uncategorized";
export const UNCATEGORIZED_GROUP_ID = "grp-system";

export type AvailableDisposition =
  | { type: "ready_to_assign" }
  | { type: "move_to_category"; categoryId: string }
  | { type: "keep_historical" };

export type CategoryDeleteMode =
  | "budget_history"
  | "move_then_delete"
  | "archive"
  | "force_uncategorized";

export interface CategoryDeletePreview {
  categoryId: string;
  name: string;
  groupName: string;
  transactionCount: number;
  budgetHistoryCount: number;
  scheduledCount: number;
  targetCount: number;
  availableCents: Cents;
  earliestActivity?: string;
  latestActivity?: string;
  hasHardLinks: boolean;
  canDeleteBudgetHistory: boolean;
  recommended: "archive" | "budget_history" | "move_then_delete";
}

/** Hard links that block deleting budget history alone. */
export function getHardDeleteLinks(plan: BudgetPlan, categoryId: string) {
  const txns = plan.transactions.filter(
    (t) =>
      t.categoryId === categoryId ||
      t.splits?.some((s) => s.categoryId === categoryId),
  );
  const scheduled = (plan.scheduledTransactions ?? []).filter(
    (s) => s.categoryId === categoryId,
  );
  const importRefs = txns.filter((t) => t.importBatchId || t.importId);
  return {
    transactions: txns,
    scheduled,
    importRefs,
    hasHardLinks:
      txns.length > 0 || scheduled.length > 0 || importRefs.length > 0,
  };
}

export function buildCategoryDeletePreview(
  plan: BudgetPlan,
  categoryId: string,
  monthKey: MonthKey,
): CategoryDeletePreview | null {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) return null;
  const group = plan.categoryGroups.find((g) => g.id === category.groupId);
  const links = getHardDeleteLinks(plan, categoryId);
  const dates = links.transactions.map((t) => t.date).sort();
  const budgetHistoryCount = plan.monthlyBudgets.filter(
    (b) => b.categoryId === categoryId,
  ).length;
  const targetCount = plan.targets.filter((t) => t.categoryId === categoryId)
    .length;
  const availableCents = getCategoryAvailable(plan, category, monthKey);
  const canDeleteBudgetHistory = !links.hasHardLinks;

  let recommended: CategoryDeletePreview["recommended"] = "archive";
  if (links.hasHardLinks) {
    recommended = "archive";
  } else if (budgetHistoryCount > 0 || targetCount > 0) {
    recommended = "budget_history";
  } else {
    recommended = "budget_history";
  }

  return {
    categoryId,
    name: category.name,
    groupName: group?.name ?? "—",
    transactionCount: links.transactions.length,
    budgetHistoryCount,
    scheduledCount: links.scheduled.length,
    targetCount,
    availableCents,
    earliestActivity: dates[0],
    latestActivity: dates[dates.length - 1],
    hasHardLinks: links.hasHardLinks,
    canDeleteBudgetHistory,
    recommended,
  };
}

export type DeleteOpResult =
  | { ok: true; plan: BudgetPlan; entityId?: string }
  | { ok: false; error: string };

function upsertAssigned(
  budgets: MonthlyCategoryBudget[],
  categoryId: string,
  monthKey: MonthKey,
  delta: Cents,
): MonthlyCategoryBudget[] {
  const existing = budgets.find(
    (b) => b.categoryId === categoryId && b.monthKey === monthKey,
  );
  if (existing) {
    return budgets.map((b) =>
      b.categoryId === categoryId && b.monthKey === monthKey
        ? {
            ...b,
            assignedCents: (b.assignedCents + delta) as Cents,
          }
        : b,
    );
  }
  return [
    ...budgets,
    { categoryId, monthKey, assignedCents: delta },
  ];
}

/** Move current available without silently creating/losing money. */
export function applyAvailableDisposition(
  plan: BudgetPlan,
  categoryId: string,
  monthKey: MonthKey,
  disposition: AvailableDisposition,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category) return { ok: false, error: "Category not found." };
  const available = getCategoryAvailable(plan, category, monthKey);
  if (available === 0 || disposition.type === "keep_historical") {
    return { ok: true, plan };
  }

  if (disposition.type === "ready_to_assign") {
    // Decreasing assigned by available returns money to RTA (or covers overspend).
    return {
      ok: true,
      plan: {
        ...plan,
        monthlyBudgets: upsertAssigned(
          plan.monthlyBudgets,
          categoryId,
          monthKey,
          (-available) as Cents,
        ),
      },
    };
  }

  if (disposition.type === "move_to_category") {
    if (disposition.categoryId === categoryId) {
      return { ok: false, error: "Choose a different category for available funds." };
    }
    const dest = plan.categories.find(
      (c) => c.id === disposition.categoryId && !c.deletedAt,
    );
    if (!dest) return { ok: false, error: "Destination category not found." };
    let monthlyBudgets = upsertAssigned(
      plan.monthlyBudgets,
      categoryId,
      monthKey,
      (-available) as Cents,
    );
    monthlyBudgets = upsertAssigned(
      monthlyBudgets,
      disposition.categoryId,
      monthKey,
      available,
    );
    return { ok: true, plan: { ...plan, monthlyBudgets } };
  }

  return { ok: false, error: "Invalid available disposition." };
}

export function ensureUncategorized(plan: BudgetPlan): BudgetPlan {
  const existing = plan.categories.find((c) => c.id === UNCATEGORIZED_ID);
  if (existing && !existing.deletedAt) {
    return {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === UNCATEGORIZED_ID
          ? { ...c, isArchived: false, hidden: false, deletedAt: undefined }
          : c,
      ),
    };
  }

  let groups = plan.categoryGroups;
  if (!groups.some((g) => g.id === UNCATEGORIZED_GROUP_ID)) {
    groups = [
      ...groups,
      {
        id: UNCATEGORIZED_GROUP_ID,
        name: "System",
        sortOrder: 9999,
        hidden: true,
      },
    ];
  }

  const category: Category = existing
    ? {
        ...existing,
        deletedAt: undefined,
        isArchived: false,
        hidden: false,
        groupId: UNCATEGORIZED_GROUP_ID,
        name: "Uncategorized",
      }
    : {
        id: UNCATEGORIZED_ID,
        groupId: UNCATEGORIZED_GROUP_ID,
        name: "Uncategorized",
        sortOrder: 0,
        hidden: false,
        rollover: false,
        pinned: false,
        isArchived: false,
        reportIncluded: true,
      };

  const categories = existing
    ? plan.categories.map((c) => (c.id === UNCATEGORIZED_ID ? category : c))
    : [...plan.categories, category];

  return { ...plan, categoryGroups: groups, categories };
}

function softDeleteCategory(
  plan: BudgetPlan,
  categoryId: string,
  method: Category["deletionMethod"],
): BudgetPlan {
  const now = new Date().toISOString();
  return {
    ...plan,
    categories: plan.categories.map((c) =>
      c.id === categoryId
        ? {
            ...c,
            deletedAt: now,
            hidden: true,
            isArchived: true,
            deletionMethod: method,
          }
        : c,
    ),
  };
}

export function deleteCategoryAndBudgetHistory(
  plan: BudgetPlan,
  categoryId: string,
  confirmedName: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return { ok: false, error: "Category not found." };
  }
  if (confirmedName.trim() !== category.name) {
    return { ok: false, error: "Type the category name exactly to confirm." };
  }
  const links = getHardDeleteLinks(plan, categoryId);
  if (links.hasHardLinks) {
    return {
      ok: false,
      error:
        "Cannot delete budget history while transactions, scheduled items, or import references remain. Move, archive, or reassign first.",
    };
  }

  // Remove budgets + targets, soft-delete category (restorable until purge)
  const next = softDeleteCategory(plan, categoryId, "budget_history");
  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...next,
      monthlyBudgets: next.monthlyBudgets.filter(
        (b) => b.categoryId !== categoryId,
      ),
      targets: next.targets.filter((t) => t.categoryId !== categoryId),
    },
  };
}

export function moveHistoryThenDelete(
  plan: BudgetPlan,
  sourceId: string,
  destinationId: string,
): DeleteOpResult {
  if (sourceId === destinationId) {
    return { ok: false, error: "Choose a different destination category." };
  }
  const source = plan.categories.find((c) => c.id === sourceId);
  const dest = plan.categories.find((c) => c.id === destinationId);
  if (!source || source.deletedAt) {
    return { ok: false, error: "Source category not found." };
  }
  if (!dest || dest.deletedAt) {
    return { ok: false, error: "Destination category not found." };
  }

  // Also remaps categoryImportRules keys that point at source — handled in store if needed
  let next = reassignCategoryId(plan, sourceId, destinationId);
  next = softDeleteCategory(next, sourceId, "move_then_delete");
  next = {
    ...next,
    categories: next.categories.map((c) =>
      c.id === sourceId
        ? { ...c, mergedIntoCategoryId: destinationId }
        : c,
    ),
    // Drop leftover source budgets if any remained
    monthlyBudgets: next.monthlyBudgets.filter(
      (b) => b.categoryId !== sourceId,
    ),
    targets: next.targets.filter((t) => t.categoryId !== sourceId),
  };
  return { ok: true, entityId: sourceId, plan: next };
}

/** Archive: leave history intact; hide from current/future Plan months. */
export function archiveCategoryForFuture(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return { ok: false, error: "Category not found." };
  }
  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              isArchived: true,
              hidden: true,
              deletedAt: undefined,
              deletionMethod: undefined,
            }
          : c,
      ),
    },
  };
}

export function unarchiveCategory(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return { ok: false, error: "Category not found." };
  }
  if (!category.isArchived && !category.hidden) {
    return { ok: false, error: "Category is not archived." };
  }
  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === categoryId
          ? { ...c, isArchived: false, hidden: false }
          : c,
      ),
    },
  };
}

export function forceDeleteToUncategorized(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  if (categoryId === UNCATEGORIZED_ID) {
    return { ok: false, error: "Cannot force-delete Uncategorized." };
  }
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return { ok: false, error: "Category not found." };
  }

  let next = ensureUncategorized(plan);
  // Drop goals before reassignment — never auto-create Uncategorized goals
  next = {
    ...next,
    targets: next.targets.filter((t) => t.categoryId !== categoryId),
  };
  next = reassignCategoryId(next, categoryId, UNCATEGORIZED_ID);
  next = {
    ...next,
    monthlyBudgets: next.monthlyBudgets.filter(
      (b) => b.categoryId !== categoryId,
    ),
    targets: next.targets.filter((t) => t.categoryId !== categoryId),
  };
  next = softDeleteCategory(next, categoryId, "force_uncategorized");
  return { ok: true, entityId: categoryId, plan: next };
}

export function restoreDeletedCategory(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category) return { ok: false, error: "Category not found." };
  if (!category.deletedAt && !category.isArchived) {
    return { ok: false, error: "Category is not deleted or archived." };
  }
  if (category.deletionMethod === "purge") {
    return { ok: false, error: "Purged categories cannot be restored." };
  }
  // Restoring archived (not soft-deleted) clears archive flags
  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              deletedAt: undefined,
              deletionMethod: undefined,
              mergedIntoCategoryId: undefined,
              isArchived: false,
              hidden: false,
            }
          : c,
      ),
    },
  };
}

/** Permanently remove a soft-deleted category with no remaining references. */
export function purgeDeletedCategory(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category?.deletedAt) {
    return { ok: false, error: "Only soft-deleted categories can be purged." };
  }
  const links = getHardDeleteLinks(plan, categoryId);
  if (links.hasHardLinks) {
    return {
      ok: false,
      error: "Cannot purge while references remain. Restore or reassign first.",
    };
  }
  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...plan,
      categories: plan.categories.filter((c) => c.id !== categoryId),
      monthlyBudgets: plan.monthlyBudgets.filter(
        (b) => b.categoryId !== categoryId,
      ),
      targets: plan.targets.filter((t) => t.categoryId !== categoryId),
    },
  };
}

export function deleteEmptyOrBudgetOnlyCategory(
  plan: BudgetPlan,
  categoryId: string,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category) return { ok: false, error: "Category not found." };
  const links = getHardDeleteLinks(plan, categoryId);
  if (links.hasHardLinks) {
    return {
      ok: false,
      error: "Category still has transactions or linked records.",
    };
  }
  const hasBudgets = plan.monthlyBudgets.some((b) => b.categoryId === categoryId);
  const hasTargets = plan.targets.some((t) => t.categoryId === categoryId);
  if (!hasBudgets && !hasTargets) {
    return {
      ok: true,
      entityId: categoryId,
      plan: softDeleteCategory(plan, categoryId, "empty"),
    };
  }
  return deleteCategoryAndBudgetHistory(plan, categoryId, category.name);
}

export type CategoryDeleteStrategy =
  | {
      mode: "budget_history";
      confirmedName: string;
      available?: AvailableDisposition;
    }
  | {
      mode: "move_then_delete";
      destinationId: string;
      available?: AvailableDisposition;
    }
  | {
      mode: "archive";
      available?: AvailableDisposition;
    }
  | {
      mode: "force_uncategorized";
      confirmForce: boolean;
      available?: AvailableDisposition;
    };

/**
 * Apply available disposition (when needed) then the chosen delete strategy.
 */
export function applyCategoryDeleteStrategy(
  plan: BudgetPlan,
  categoryId: string,
  monthKey: MonthKey,
  strategy: CategoryDeleteStrategy,
): DeleteOpResult {
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) {
    return { ok: false, error: "Category not found." };
  }

  const available = getCategoryAvailable(plan, category, monthKey);
  let next = plan;

  if (available !== 0) {
    if (!strategy.available) {
      return {
        ok: false,
        error:
          "Choose what to do with the current available balance before continuing.",
      };
    }
    // For move-then-delete, "keep_historical" means available rides along with moved budgets.
    const skipDisposition =
      strategy.mode === "move_then_delete" &&
      strategy.available.type === "keep_historical";
    if (!skipDisposition) {
      const disp = applyAvailableDisposition(
        next,
        categoryId,
        monthKey,
        strategy.available,
      );
      if (!disp.ok) return disp;
      next = disp.plan;
    }
  }

  switch (strategy.mode) {
    case "budget_history":
      if (strategy.available?.type === "keep_historical") {
        return {
          ok: false,
          error:
            "Cannot keep available only in history when deleting budget history. Move it to Ready to Assign or another category.",
        };
      }
      return deleteCategoryAndBudgetHistory(
        next,
        categoryId,
        strategy.confirmedName,
      );
    case "move_then_delete":
      return moveHistoryThenDelete(next, categoryId, strategy.destinationId);
    case "archive":
      return archiveCategoryForFuture(next, categoryId);
    case "force_uncategorized":
      if (!strategy.confirmForce) {
        return {
          ok: false,
          error: "Confirm force delete to Uncategorized.",
        };
      }
      return forceDeleteToUncategorized(next, categoryId);
    default:
      return { ok: false, error: "Unknown delete strategy." };
  }
}
