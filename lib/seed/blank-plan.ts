import { currentMonthKey } from "@/lib/dates";
import { buildDefaultCategoryGroups } from "@/lib/seed/default-templates";
import type { BudgetPlan, UserPreferences } from "@/lib/types/budget";

export function defaultPreferences(
  overrides: Partial<UserPreferences> = {},
): UserPreferences {
  return {
    hideBalances: false,
    timezone: "America/Chicago",
    currency: "USD",
    firstDayOfWeek: 0,
    enableTrackingLiabilities: false,
    showHiddenAccounts: false,
    showClosedAccounts: false,
    suggestPayeeMemo: true,
    transactionSort: undefined,
    settingsCategoryGroupsExpanded: undefined,
    deletedAccountRetentionDays: 30,
    ...overrides,
  };
}

/**
 * Empty budget — no seed demo data.
 * Used after Clear Data when the user chooses "Start with blank budget".
 */
export function createBlankPlan(
  options: {
    includeDefaultCategoryGroups?: boolean;
    name?: string;
    monthKey?: string;
  } = {},
): BudgetPlan {
  const includeGroups = options.includeDefaultCategoryGroups ?? false;
  const monthKey = options.monthKey ?? currentMonthKey();
  return {
    id: `plan-${crypto.randomUUID().slice(0, 8)}`,
    name: options.name ?? "My Budget",
    currency: "USD",
    workingMonthKey: monthKey,
    preferences: defaultPreferences(),
    accounts: [],
    categoryGroups: includeGroups ? buildDefaultCategoryGroups() : [],
    categories: [],
    monthlyBudgets: [],
    targets: [],
    payees: [],
    transactions: [],
    scheduledTransactions: [],
  };
}

/** Blank plan plus the 15 simplified default category groups. */
export function createBlankPlanWithTemplate(): BudgetPlan {
  return createBlankPlan({
    includeDefaultCategoryGroups: true,
    name: "My Budget",
  });
}
