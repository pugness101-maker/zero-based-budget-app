import { selectPrimaryGoalIds } from "@/lib/calculations/goals";
import type { BudgetPlan, GoalLinkType, Target } from "@/lib/types/budget";

export type GoalIssueKind = "duplicate" | "orphan" | "invalid";

export interface GoalIssue {
  targetId: string;
  categoryId: string | null;
  accountId: string | null;
  kind: GoalIssueKind;
  message: string;
}

export function detectGoalIssues(plan: BudgetPlan): GoalIssue[] {
  const primary = selectPrimaryGoalIds(plan.targets);
  const issues: GoalIssue[] = [];

  for (const target of plan.targets) {
    if (target.paused) continue;

    const linkType: GoalLinkType =
      target.linkType ?? (target.accountId ? "account" : "category");

    if (target.categoryId && target.accountId) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        accountId: target.accountId,
        kind: "invalid",
        message: "Goal links to both a category and an account.",
      });
      continue;
    }

    if (!target.categoryId && !target.accountId) {
      issues.push({
        targetId: target.id,
        categoryId: null,
        accountId: null,
        kind: "orphan",
        message: "Goal is not linked to a category or account.",
      });
      continue;
    }

    if (linkType === "category") {
      const category = plan.categories.find((c) => c.id === target.categoryId);
      if (!category || category.deletedAt) {
        issues.push({
          targetId: target.id,
          categoryId: target.categoryId,
          accountId: null,
          kind: "orphan",
          message: "Goal is not linked to a valid category.",
        });
        continue;
      }
    } else {
      const account = plan.accounts.find((a) => a.id === target.accountId);
      if (!account || account.deletedAt) {
        issues.push({
          targetId: target.id,
          categoryId: null,
          accountId: target.accountId,
          kind: "orphan",
          message: "Goal is not linked to a valid account.",
        });
        continue;
      }
    }

    if (target.type !== "debt_payoff" && target.amountCents <= 0) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        accountId: target.accountId,
        kind: "invalid",
        message: "Target amount must be greater than zero.",
      });
    }

    if (
      (target.type === "target_by_date" ||
        target.type === "account_save_by_date" ||
        target.type === "save_by_date") &&
      !target.dueDate
    ) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        accountId: target.accountId,
        kind: "invalid",
        message: "Date-based goals require a due date.",
      });
    }

    if (!primary.has(target.id)) {
      issues.push({
        targetId: target.id,
        categoryId: target.categoryId,
        accountId: target.accountId,
        kind: "duplicate",
        message:
          linkType === "account"
            ? "Duplicate goal for this account."
            : "Duplicate goal for this category.",
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

    const orphan =
      (!target.categoryId && !target.accountId) ||
      (target.linkType === "category" &&
        (!target.categoryId ||
          !plan.categories.some(
            (c) => c.id === target.categoryId && !c.deletedAt,
          ))) ||
      (target.linkType === "account" &&
        (!target.accountId ||
          !plan.accounts.some(
            (a) => a.id === target.accountId && !a.deletedAt,
          )));

    if (orphan) {
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
  input:
    | { linkType: "category"; categoryId: string }
    | { linkType: "account"; accountId: string },
): RepairGoalsResult {
  const target = plan.targets.find((t) => t.id === targetId);
  if (!target) return { ok: false, error: "Goal not found." };

  if (input.linkType === "category") {
    const category = plan.categories.find((c) => c.id === input.categoryId);
    if (!category || category.deletedAt || category.isArchived) {
      return { ok: false, error: "Choose a valid active category." };
    }
    const clash = plan.targets.find(
      (t) =>
        !t.paused &&
        t.id !== targetId &&
        t.linkType === "category" &&
        t.categoryId === input.categoryId,
    );
    if (clash) {
      return {
        ok: false,
        error: "That category already has an active goal.",
      };
    }
    return {
      ok: true,
      plan: {
        ...plan,
        targets: plan.targets.map((t) =>
          t.id === targetId
            ? {
                ...t,
                linkType: "category",
                categoryId: input.categoryId,
                accountId: null,
              }
            : t,
        ),
      },
      keptIds: [targetId],
      removedIds: [],
    };
  }

  const account = plan.accounts.find((a) => a.id === input.accountId);
  if (!account || account.deletedAt) {
    return { ok: false, error: "Choose a valid account." };
  }
  const clash = plan.targets.find(
    (t) =>
      !t.paused &&
      t.id !== targetId &&
      t.linkType === "account" &&
      t.accountId === input.accountId &&
      !t.allowDuplicateAccountGoal,
  );
  if (clash) {
    return { ok: false, error: "That account already has an active goal." };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      targets: plan.targets.map((t) =>
        t.id === targetId
          ? {
              ...t,
              linkType: "account",
              accountId: input.accountId,
              categoryId: null,
            }
          : t,
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

export function archiveGoalOnly(
  plan: BudgetPlan,
  targetId: string,
  paused = true,
): RepairGoalsResult {
  if (!plan.targets.some((t) => t.id === targetId)) {
    return { ok: false, error: "Goal not found." };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      targets: plan.targets.map((t) =>
        t.id === targetId ? { ...t, paused } : t,
      ),
    },
    keptIds: [targetId],
    removedIds: [],
  };
}
