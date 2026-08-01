import type { GoalLinkType, TargetType } from "@/lib/types/budget";

export const CATEGORY_GOAL_TYPES: Array<{
  value: TargetType;
  label: string;
}> = [
  { value: "monthly_fixed", label: "Monthly fixed" },
  { value: "monthly_refill", label: "Monthly refill" },
  { value: "weekly_savings", label: "Weekly savings" },
  { value: "target_by_date", label: "Target by date" },
  { value: "maintain_category_balance", label: "Maintain category balance" },
  { value: "custom_repeating", label: "Custom repeating target" },
];

export const ACCOUNT_GOAL_TYPES: Array<{
  value: TargetType;
  label: string;
}> = [
  { value: "reach_account_balance", label: "Reach account balance" },
  { value: "maintain_minimum_balance", label: "Maintain minimum balance" },
  { value: "account_save_by_date", label: "Save by date" },
  { value: "debt_payoff", label: "Debt payoff" },
  { value: "monthly_account_contribution", label: "Monthly account contribution" },
  { value: "investment_contribution", label: "Investment contribution" },
  { value: "emergency_fund_balance", label: "Emergency fund balance" },
  { value: "custom_account_target", label: "Custom account target" },
];

export function goalTypesForLink(linkType: GoalLinkType) {
  return linkType === "account" ? ACCOUNT_GOAL_TYPES : CATEGORY_GOAL_TYPES;
}

export function isCategoryGoalType(type: TargetType): boolean {
  return CATEGORY_GOAL_TYPES.some((t) => t.value === type);
}

export function isAccountGoalType(type: TargetType): boolean {
  return ACCOUNT_GOAL_TYPES.some((t) => t.value === type);
}

export function isDateBasedGoalType(type: TargetType): boolean {
  return (
    type === "target_by_date" ||
    type === "account_save_by_date" ||
    type === "save_by_date"
  );
}

export function isContributionGoalType(type: TargetType): boolean {
  return (
    type === "monthly_account_contribution" ||
    type === "investment_contribution"
  );
}

export function normalizeTargetType(type: TargetType): TargetType {
  switch (type) {
    case "weekly_fixed":
      return "weekly_savings";
    case "refill":
      return "monthly_refill";
    case "save_by_date":
      return "target_by_date";
    case "custom_balance":
      return "maintain_category_balance";
    case "debt_payment":
      return "debt_payoff";
    case "custom":
      return "custom_repeating";
    default:
      return type;
  }
}

export function goalTypeLabel(type: TargetType): string {
  const normalized = normalizeTargetType(type);
  const all = [...CATEGORY_GOAL_TYPES, ...ACCOUNT_GOAL_TYPES];
  return all.find((t) => t.value === normalized)?.label ?? normalized.replaceAll("_", " ");
}
