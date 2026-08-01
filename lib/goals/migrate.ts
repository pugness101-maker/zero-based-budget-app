import { normalizeTargetType } from "@/lib/goals/types";
import type { BudgetPlan, GoalLinkType, Target } from "@/lib/types/budget";

type LegacyTarget = Partial<Target> & {
  id: string;
  categoryId?: string | null;
  accountId?: string | null;
  type: Target["type"];
  amountCents: Target["amountCents"];
};

/**
 * Migrate legacy category-only targets to the linkType model.
 * Does not convert broken category goals into account goals or Uncategorized.
 */
export function migratePlanTargets(plan: BudgetPlan): BudgetPlan {
  const targets = plan.targets.map((raw) => migrateTarget(raw as LegacyTarget, plan));
  return { ...plan, targets };
}

export function migrateTarget(raw: LegacyTarget, plan: BudgetPlan): Target {
  const hasLinkType = raw.linkType === "category" || raw.linkType === "account";
  let linkType: GoalLinkType = hasLinkType ? raw.linkType! : "category";
  let categoryId =
    raw.categoryId === undefined ? null : raw.categoryId;
  let accountId = raw.accountId === undefined ? null : raw.accountId;

  // Legacy: categoryId was required string
  if (!hasLinkType) {
    linkType = "category";
    categoryId =
      typeof raw.categoryId === "string" && raw.categoryId
        ? raw.categoryId
        : null;
    accountId = null;
  }

  // Enforce exclusivity
  if (linkType === "category") {
    accountId = null;
  } else {
    categoryId = null;
  }

  // If both somehow set without linkType, prefer category
  if (hasLinkType && raw.categoryId && raw.accountId) {
    if (linkType === "category") accountId = null;
    else categoryId = null;
  }

  const type = normalizeTargetType(raw.type);
  // Debt payoff on a category link stays category-linked as custom_repeating
  // unless already account-linked — do not auto-convert.
  const resolvedType =
    linkType === "category" && type === "debt_payoff"
      ? ("custom_repeating" as const)
      : linkType === "account" && !isAccountCompatible(type)
        ? ("custom_account_target" as const)
        : type;

  let name = raw.name?.trim();
  if (!name) {
    if (linkType === "category" && categoryId) {
      name = plan.categories.find((c) => c.id === categoryId)?.name;
    } else if (linkType === "account" && accountId) {
      name = plan.accounts.find((a) => a.id === accountId)?.name;
    }
  }

  return {
    id: raw.id,
    name,
    linkType,
    categoryId,
    accountId,
    type: resolvedType,
    amountCents: raw.amountCents,
    baselineAmountCents: raw.baselineAmountCents,
    dueDate: raw.dueDate,
    repeatRule: raw.repeatRule ?? raw.cadence,
    cadence: raw.cadence,
    notes: raw.notes,
    paused: raw.paused,
    includeTransfers: raw.includeTransfers,
    includeAdjustments: raw.includeAdjustments,
    allowDuplicateAccountGoal: raw.allowDuplicateAccountGoal,
  };
}

function isAccountCompatible(type: Target["type"]): boolean {
  return (
    type === "reach_account_balance" ||
    type === "maintain_minimum_balance" ||
    type === "account_save_by_date" ||
    type === "debt_payoff" ||
    type === "monthly_account_contribution" ||
    type === "investment_contribution" ||
    type === "emergency_fund_balance" ||
    type === "custom_account_target"
  );
}
