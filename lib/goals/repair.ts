import { selectPrimaryGoalIds } from "@/lib/calculations/goals";
import type { BudgetPlan, Target } from "@/lib/types/budget";

export type GoalIssueKind = "duplicate" | "orphan" | "invalid";

export interface GoalIssue {
  targetId: string;
  categoryId: string;
  kind: GoalIssueKind;
  message: string;
}

export function detectGoalIssues(plan: BudgetPlan): GoalIssue[] {
  const primary = selectPrimaryGoalIds(plan.targets);
  const issues: GoalIssue[] = [];

  for (const target of plan.targets) {
    if (target.paused) continue;

    const category = plan.categories.find((c) => c.id === target.categoryId);
    if (!category || category.deletedAt) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        kind: "orphan",
        message: "Goal is not linked to a valid category.",
      });
      continue;
    }

    if (target.amountCents <= 0) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        kind: "invalid",
        message: "Target amount must be greater than zero.",
      });
    }

    if (target.type === "save_by_date" && !target.dueDate) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        kind: "invalid",
        message: "Save-by-date goals require a due date.",
      });
    }

    if (!primary.has(target.id)) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        kind: "duplicate",
        message: `Duplicate goal for category “${category.name}”.`,
      });
    }
  }

  return issues;
}

export type RepairGoalsResult =
  | {
      ok: true;
      plan: BudgetPlan;
      keptIds: string[];
      removedIds: string[];
    }
  | { ok: false; error: string };

/**
 * Keep one primary goal per categoryId; delete duplicate extras.
 * Orphans are not auto-reassigned to Uncategorized — they must be
 * reconnected or deleted explicitly.
 */
export function repairDuplicateGoals(plan: BudgetPlan): RepairGoalsResult {
  const primary = selectPrimaryGoalIds(plan.targets);
  const removedIds: string[] = [];
  const keptIds: string[] = [];

  const nextTargets: Target[] = [];
  for (const target of plan.targets) {
    if (target.paused) {
      nextTargets.push(target);
      continue;
    }
    const category = plan.categories.find((c) => c.id === target.categoryId);
    const orphan = !category || Boolean(category.deletedAt);
    if (orphan) {
      // Keep orphans for manual reconnect/delete — do not auto-fix to Uncategorized
      nextTargets.push(target);
      continue;
    }
    if (primary.has(target.id)) {
      nextTargets.push(target);
      keptIds.push(target.id);
    } else {
      removedIds.push(target.id);
    }
  }

  return {
    ok: true,
    plan: { ...plan, targets: nextTargets },
    keptIds,
    removedIds,
  };
}

export function reconnectGoal(
  plan: BudgetPlan,
  targetId: string,
  categoryId: string,
): RepairGoalsResult {
  const target = plan.targets.find((t) => t.id === targetId);
  if (!target) return { ok: false, error: "Goal not found." };

  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt || category.isArchived) {
    return { ok: false, error: "Choose a valid active category." };
  }

  const clash = plan.targets.find(
    (t) =>
      !t.paused &&
      t.id !== targetId &&
      t.categoryId === categoryId,
  );
  if (clash) {
    return {
      ok: false,
      error: "That category already has an active goal. Delete or merge it first.",
    };
  }

  return {
    ok: true,
    plan: {
      ...plan,
      targets: plan.targets.map((t) =>
        t.id === targetId ? { ...t, categoryId } : t,
      ),
    },
    keptIds: [targetId],
    removedIds: [],
  };
}

export function deleteGoalOnly(
  plan: BudgetPlan,
  targetId: string,
): RepairGoalsResult {
  if (!plan.targets.some((t) => t.id === targetId)) {
    return { ok: false, error: "Goal not found." };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      targets: plan.targets.filter((t) => t.id !== targetId),
    },
    keptIds: [],
    removedIds: [targetId],
  };
}
