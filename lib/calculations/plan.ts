import type { MonthKey } from "@/lib/dates";
import { isDateInMonth, previousMonth } from "@/lib/dates";
import { sumCents, type Cents } from "@/lib/money";
import type {
  Account,
  BudgetPlan,
  Category,
  CategoryMonthMetrics,
  GroupMonthMetrics,
  MonthlyCategoryBudget,
  OverspendingType,
  PlanMonthSummary,
  Target,
  Transaction,
} from "@/lib/types/budget";

function isClosedAccount(account: Account): boolean {
  return Boolean(account.closedAt) || account.closed === true;
}

function onBudgetAccountIds(accounts: Account[]): Set<string> {
  return new Set(
    accounts
      .filter((a) => a.kind === "on_budget" && !a.deletedAt)
      .map((a) => a.id),
  );
}

function creditAccountIds(accounts: Account[]): Set<string> {
  return new Set(
    accounts
      .filter((a) => a.kind === "credit" && !a.deletedAt)
      .map((a) => a.id),
  );
}

/** Active (non-closed) tracking accounts — closed tracking excluded from plan lists. */
export function activeTrackingAccountIds(accounts: Account[]): Set<string> {
  return new Set(
    accounts
      .filter(
        (a) => a.kind === "tracking" && !a.deletedAt && !isClosedAccount(a),
      )
      .map((a) => a.id),
  );
}

/** Inflows to on-budget accounts that are not transfers. */
export function getCashInflowsForMonth(
  transactions: Transaction[],
  accounts: Account[],
  monthKey: MonthKey,
): Cents {
  const onBudget = onBudgetAccountIds(accounts);
  return sumCents(
    transactions
      .filter(
        (t) =>
          onBudget.has(t.accountId) &&
          !t.isTransfer &&
          t.amountCents > 0 &&
          isDateInMonth(t.date, monthKey) &&
          t.approved,
      )
      .map((t) => t.amountCents),
  );
}

export function getAssignedForMonth(
  monthlyBudgets: MonthlyCategoryBudget[],
  monthKey: MonthKey,
  categoryIds?: Set<string>,
): Cents {
  return sumCents(
    monthlyBudgets
      .filter(
        (b) =>
          b.monthKey === monthKey &&
          (!categoryIds || categoryIds.has(b.categoryId)),
      )
      .map((b) => b.assignedCents),
  );
}

export function getAssignedForCategory(
  monthlyBudgets: MonthlyCategoryBudget[],
  categoryId: string,
  monthKey: MonthKey,
): Cents {
  return (
    monthlyBudgets.find(
      (b) => b.categoryId === categoryId && b.monthKey === monthKey,
    )?.assignedCents ?? 0
  );
}

/**
 * Category activity for a month.
 * Outflows from categories are negative; inflows (refunds) positive.
 * Transfers between on-budget accounts are excluded from spending.
 * Credit-card purchases still reduce category available (activity).
 */
export function getCategoryActivity(
  transactions: Transaction[],
  categoryId: string,
  monthKey: MonthKey,
): Cents {
  let total = 0;

  for (const t of transactions) {
    if (!t.approved || !isDateInMonth(t.date, monthKey)) continue;
    if (t.isTransfer) continue;

    if (t.splits?.length) {
      for (const split of t.splits) {
        if (split.categoryId === categoryId) {
          // Split amounts follow parent sign convention: stored as absolute
          // contribution matching parent direction.
          total += split.amountCents;
        }
      }
      continue;
    }

    if (t.categoryId === categoryId) {
      total += t.amountCents;
    }
  }

  return total;
}

function earliestMonthKey(plan: BudgetPlan): MonthKey | null {
  const months = new Set<string>();
  for (const b of plan.monthlyBudgets) months.add(b.monthKey);
  for (const t of plan.transactions) {
    months.add(t.date.slice(0, 7));
  }
  if (months.size === 0) return null;
  return [...months].sort()[0]!;
}

/**
 * Available = prior available (if rollover) + assigned + activity.
 * Activity is typically negative for spending.
 */
export function getCategoryAvailable(
  plan: BudgetPlan,
  category: Category,
  monthKey: MonthKey,
  cache: Map<string, Cents> = new Map(),
): Cents {
  const cacheKey = `${category.id}:${monthKey}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const assigned = getAssignedForCategory(
    plan.monthlyBudgets,
    category.id,
    monthKey,
  );
  const activity = getCategoryActivity(
    plan.transactions,
    category.id,
    monthKey,
  );

  let prior = 0;
  if (category.rollover) {
    const earliest = earliestMonthKey(plan);
    const prev = previousMonth(monthKey);
    if (earliest && prev >= earliest) {
      prior = Math.max(0, getCategoryAvailable(plan, category, prev, cache));
    }
  }

  const available = prior + assigned + activity;
  cache.set(cacheKey, available);
  return available;
}

export function getOverspendingType(
  availableCents: Cents,
  categoryId: string,
  monthKey: MonthKey,
  transactions: Transaction[],
  accounts: Account[],
): OverspendingType {
  if (availableCents >= 0) return null;

  const creditIds = creditAccountIds(accounts);
  const monthTxns = transactions.filter(
    (t) =>
      t.approved &&
      !t.isTransfer &&
      isDateInMonth(t.date, monthKey) &&
      (t.categoryId === categoryId ||
        t.splits?.some((s) => s.categoryId === categoryId)),
  );

  const hasCreditSpend = monthTxns.some((t) => creditIds.has(t.accountId));
  const hasCashSpend = monthTxns.some((t) => !creditIds.has(t.accountId));

  if (hasCreditSpend && !hasCashSpend) return "credit";
  return "cash";
}

export function validateSplitTotals(transaction: Transaction): boolean {
  if (!transaction.splits?.length) return true;
  const splitSum = sumCents(transaction.splits.map((s) => s.amountCents));
  return splitSum === transaction.amountCents;
}

/**
 * Ready to assign =
 *   total cash inflows (to date in month, plus starting RTA carry conceptually)
 *   - total assigned
 *   - cash overspending that must be covered
 *
 * For the demo MVP we treat readyToAssign as:
 *   inflows this month - assigned this month - cash overspending absolute
 * Plus any unassigned leftover from prior is modeled via not assigning everything.
 *
 * Simpler demo model used here:
 *   readyToAssign = inflows - assigned - cashOverspendingCover
 * where cashOverspendingCover is the sum of |available| for categories with cash overspending.
 */
export function computeReadyToAssign(
  plan: BudgetPlan,
  monthKey: MonthKey,
): Cents {
  const inflows = getCashInflowsForMonth(
    plan.transactions,
    plan.accounts,
    monthKey,
  );
  const assigned = getAssignedForMonth(plan.monthlyBudgets, monthKey);

  const cache = new Map<string, Cents>();
  let cashOverspend = 0;

  for (const category of plan.categories) {
    if (category.hidden || category.deletedAt || category.isArchived) continue;
    const available = getCategoryAvailable(plan, category, monthKey, cache);
    if (available >= 0) continue;
    const type = getOverspendingType(
      available,
      category.id,
      monthKey,
      plan.transactions,
      plan.accounts,
    );
    if (type === "cash") {
      cashOverspend += Math.abs(available);
    }
  }

  return inflows - assigned - cashOverspend;
}

export function getTargetForCategory(
  targets: Target[],
  categoryId: string,
): Target | undefined {
  return targets.find(
    (t) =>
      !t.paused &&
      t.linkType !== "account" &&
      t.categoryId === categoryId,
  );
}

export function buildPlanMonthSummary(
  plan: BudgetPlan,
  monthKey: MonthKey,
): PlanMonthSummary {
  const cache = new Map<string, Cents>();
  const groups: GroupMonthMetrics[] = [];

  const sortedGroups = [...plan.categoryGroups].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  for (const group of sortedGroups) {
    if (group.hidden || group.deletedAt) continue;

    const cats = plan.categories
      .filter(
        (c) =>
          c.groupId === group.id &&
          !c.hidden &&
          !c.deletedAt &&
          !c.isArchived,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const categoryMetrics: CategoryMonthMetrics[] = cats.map((category) => {
      const budgetRow = plan.monthlyBudgets.find(
        (b) => b.categoryId === category.id && b.monthKey === monthKey,
      );
      const assignedCents = budgetRow?.assignedCents ?? 0;

      // Historical YNAB imports preserve Activity/Available; current/future months use the engine.
      const useYnabHistorical =
        budgetRow?.source === "ynab_import" &&
        monthKey < plan.workingMonthKey &&
        (budgetRow.activityCents != null || budgetRow.availableCents != null);

      const activityCents = useYnabHistorical
        ? (budgetRow!.activityCents ?? 0)
        : getCategoryActivity(plan.transactions, category.id, monthKey);
      const availableCents = useYnabHistorical
        ? (budgetRow!.availableCents ??
          assignedCents + (budgetRow!.activityCents ?? 0))
        : getCategoryAvailable(plan, category, monthKey, cache);
      const target = getTargetForCategory(plan.targets, category.id);
      const targetAmountCents = target?.amountCents ?? null;
      const underfundedCents =
        targetAmountCents !== null
          ? Math.max(0, targetAmountCents - assignedCents)
          : 0;
      const overspendingType = getOverspendingType(
        availableCents,
        category.id,
        monthKey,
        plan.transactions,
        plan.accounts,
      );

      return {
        categoryId: category.id,
        groupId: group.id,
        name: category.name,
        assignedCents,
        activityCents,
        availableCents,
        targetAmountCents,
        underfundedCents,
        overspendingType,
        notes: category.notes,
      };
    });

    groups.push({
      groupId: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      collapsed: Boolean(group.collapsed),
      hidden: group.hidden,
      assignedCents: sumCents(categoryMetrics.map((c) => c.assignedCents)),
      activityCents: sumCents(categoryMetrics.map((c) => c.activityCents)),
      availableCents: sumCents(categoryMetrics.map((c) => c.availableCents)),
      categories: categoryMetrics,
    });
  }

  const readyToAssignCents = computeReadyToAssign(plan, monthKey);
  const totalAssignedCents = sumCents(groups.map((g) => g.assignedCents));
  const totalActivityCents = sumCents(groups.map((g) => g.activityCents));
  const totalAvailableCents = sumCents(groups.map((g) => g.availableCents));

  return {
    monthKey,
    readyToAssignCents,
    totalAssignedCents,
    totalActivityCents,
    totalAvailableCents,
    groups,
  };
}

/** Spending excludes transfers and income. */
export function getSpendingForMonth(
  transactions: Transaction[],
  accounts: Account[],
  monthKey: MonthKey,
): Cents {
  const tracking = new Set(
    accounts.filter((a) => a.kind === "tracking").map((a) => a.id),
  );

  return sumCents(
    transactions
      .filter(
        (t) =>
          t.approved &&
          !t.isTransfer &&
          !tracking.has(t.accountId) &&
          t.amountCents < 0 &&
          isDateInMonth(t.date, monthKey),
      )
      .map((t) => Math.abs(t.amountCents)),
  );
}
