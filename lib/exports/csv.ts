import { getAccountBalance } from "@/lib/calculations/account-balances";
import {
  buildGoalsSummary,
  type GoalProgress,
} from "@/lib/calculations/goals";
import {
  getAssignedForCategory,
  getCategoryActivity,
  getCategoryAvailable,
  getTargetForCategory,
} from "@/lib/calculations/plan";
import { isAccountClosed, isAccountHidden } from "@/lib/accounts/lifecycle";
import type { MonthKey } from "@/lib/dates";
import type { BudgetPlan, ClearedStatus, Transaction } from "@/lib/types/budget";

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryIds?: string[];
  includeTransfers?: boolean;
  includeHiddenAccounts?: boolean;
  includeClosedAccounts?: boolean;
  includeHiddenCategories?: boolean;
  includeArchivedCategories?: boolean;
  cleared?: ClearedStatus[];
  transactionTypes?: Array<"standard" | "transfer" | "split">;
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function filterTransactions(
  plan: BudgetPlan,
  filters: ExportFilters = {},
): Transaction[] {
  const accountIds = filters.accountIds?.length
    ? new Set(filters.accountIds)
    : null;
  const categoryIds = filters.categoryIds?.length
    ? new Set(filters.categoryIds)
    : null;
  const cleared = filters.cleared?.length ? new Set(filters.cleared) : null;
  const types = filters.transactionTypes?.length
    ? new Set(filters.transactionTypes)
    : null;

  return plan.transactions.filter((t) => {
    const account = plan.accounts.find((a) => a.id === t.accountId);
    if (!account || account.deletedAt) return false;
    if (!filters.includeHiddenAccounts && isAccountHidden(account)) return false;
    if (!filters.includeClosedAccounts && isAccountClosed(account)) return false;
    if (accountIds && !accountIds.has(t.accountId)) return false;
    if (filters.startDate && t.date < filters.startDate) return false;
    if (filters.endDate && t.date > filters.endDate) return false;
    if (filters.includeTransfers === false && t.isTransfer) return false;
    if (cleared && !cleared.has(t.cleared)) return false;
    if (types) {
      const kind = t.isTransfer
        ? "transfer"
        : t.splits?.length
          ? "split"
          : "standard";
      if (!types.has(kind)) return false;
    }
    if (categoryIds) {
      const ids = t.splits?.length
        ? t.splits.map((s) => s.categoryId).filter(Boolean)
        : [t.categoryId];
      if (!ids.some((id) => id && categoryIds.has(id))) return false;
    }
    return true;
  });
}

export function buildTransactionsCsv(
  plan: BudgetPlan,
  filters: ExportFilters = {},
): { csv: string; rowCount: number } {
  const txns = filterTransactions(plan, filters).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const header = [
    "Date",
    "Account",
    "Payee",
    "Category Group",
    "Category",
    "Memo",
    "Outflow",
    "Inflow",
    "Cleared",
    "Flag",
    "Transaction Type",
    "Transfer Account",
    "Created At",
    "Updated At",
  ];
  const rows: Array<Array<string | number>> = [header];

  for (const t of txns) {
    const account = plan.accounts.find((a) => a.id === t.accountId);
    const category = t.categoryId
      ? plan.categories.find((c) => c.id === t.categoryId)
      : undefined;
    const group = category
      ? plan.categoryGroups.find((g) => g.id === category.groupId)
      : undefined;
    const pair = t.transferPairId
      ? plan.transactions.find((x) => x.id === t.transferPairId)
      : undefined;
    const transferAccount = pair
      ? plan.accounts.find((a) => a.id === pair.accountId)
      : undefined;
    const type = t.isTransfer
      ? "Transfer"
      : t.splits?.length
        ? "Split"
        : "Standard";
    rows.push([
      t.date,
      account?.name ?? "",
      t.payeeName,
      group?.name ?? "",
      category?.name ?? (t.isTransfer ? "Transfer" : ""),
      t.memo ?? "",
      t.amountCents < 0 ? centsToDollars(Math.abs(t.amountCents)) : "",
      t.amountCents > 0 ? centsToDollars(t.amountCents) : "",
      t.cleared,
      t.flag ?? "",
      type,
      transferAccount?.name ?? "",
      t.createdAt ?? "",
      t.updatedAt ?? "",
    ]);
  }

  return { csv: toCsv(rows), rowCount: txns.length };
}

export function buildAccountsCsv(
  plan: BudgetPlan,
  filters: ExportFilters = {},
): { csv: string; rowCount: number } {
  const accounts = plan.accounts
    .filter((a) => !a.deletedAt)
    .filter((a) => filters.includeHiddenAccounts || !isAccountHidden(a))
    .filter((a) => filters.includeClosedAccounts || !isAccountClosed(a))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const header = [
    "Account Name",
    "Account Type",
    "On Budget",
    "Current Balance",
    "Cleared Balance",
    "Hidden",
    "Closed",
    "Closed Date",
    "Notes",
  ];
  const rows: Array<Array<string | number | boolean>> = [header];
  for (const a of accounts) {
    const bal = getAccountBalance(a, plan.transactions);
    rows.push([
      a.name,
      a.type,
      a.kind === "on_budget",
      centsToDollars(bal.balanceCents),
      centsToDollars(bal.clearedBalanceCents),
      Boolean(a.isHidden),
      isAccountClosed(a),
      a.closedAt?.slice(0, 10) ?? "",
      a.note ?? "",
    ]);
  }
  return { csv: toCsv(rows), rowCount: accounts.length };
}

export function buildCategoriesCsv(
  plan: BudgetPlan,
  monthKey: MonthKey,
  filters: ExportFilters = {},
): { csv: string; rowCount: number } {
  const categories = plan.categories
    .filter((c) => !c.deletedAt)
    .filter((c) => filters.includeHiddenCategories || !c.hidden)
    .filter((c) => filters.includeArchivedCategories || !c.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const header = [
    "Category Group",
    "Category",
    "Assigned",
    "Activity",
    "Available",
    "Target",
    "Hidden",
    "Archived",
  ];
  const rows: Array<Array<string | number | boolean>> = [header];
  for (const c of categories) {
    const group = plan.categoryGroups.find((g) => g.id === c.groupId);
    const assigned = getAssignedForCategory(
      plan.monthlyBudgets,
      c.id,
      monthKey,
    );
    const activity = getCategoryActivity(plan.transactions, c.id, monthKey);
    const available = getCategoryAvailable(plan, c, monthKey);
    const target = getTargetForCategory(plan.targets, c.id);
    rows.push([
      group?.name ?? "",
      c.name,
      centsToDollars(assigned),
      centsToDollars(activity),
      centsToDollars(available),
      target ? centsToDollars(target.amountCents) : "",
      Boolean(c.hidden),
      Boolean(c.isArchived),
    ]);
  }
  return { csv: toCsv(rows), rowCount: categories.length };
}

export function buildGoalsCsv(
  plan: BudgetPlan,
  monthKey: MonthKey,
): { csv: string; rowCount: number } {
  const summary = buildGoalsSummary(plan, monthKey);
  const header = [
    "Goal Name",
    "Link Type",
    "Linked Category",
    "Linked Account",
    "Goal Type",
    "Target Amount",
    "Funded",
    "Remaining",
    "Due Date",
    "Status",
  ];
  const rows: Array<Array<string | number>> = [header];
  for (const g of summary.goals as GoalProgress[]) {
    rows.push([
      g.name,
      g.linkType,
      g.linkType === "category" ? g.linkedName : "",
      g.linkType === "account" ? g.linkedName : "",
      g.type,
      centsToDollars(g.targetAmountCents),
      centsToDollars(g.fundedCents),
      centsToDollars(g.remainingCents),
      g.dueDate ?? "",
      g.status,
    ]);
  }
  return { csv: toCsv(rows), rowCount: summary.goals.length };
}

export function buildBudgetHistoryCsv(
  plan: BudgetPlan,
  filters: ExportFilters = {},
): { csv: string; rowCount: number } {
  const months = [
    ...new Set(plan.monthlyBudgets.map((b) => b.monthKey)),
  ].sort();
  const header = [
    "Month",
    "Category Group",
    "Category",
    "Assigned",
    "Activity",
    "Available",
  ];
  const rows: Array<Array<string | number>> = [header];
  let count = 0;

  const categories = plan.categories
    .filter((c) => !c.deletedAt)
    .filter((c) => filters.includeHiddenCategories || !c.hidden)
    .filter((c) => filters.includeArchivedCategories || !c.isArchived)
    .filter(
      (c) =>
        !filters.categoryIds?.length || filters.categoryIds.includes(c.id),
    );

  for (const monthKey of months) {
    if (filters.startDate && monthKey < filters.startDate.slice(0, 7)) continue;
    if (filters.endDate && monthKey > filters.endDate.slice(0, 7)) continue;

    for (const category of categories) {
      const group = plan.categoryGroups.find((g) => g.id === category.groupId);
      const assigned = getAssignedForCategory(
        plan.monthlyBudgets,
        category.id,
        monthKey as MonthKey,
      );
      const activity = getCategoryActivity(
        plan.transactions,
        category.id,
        monthKey as MonthKey,
      );
      const available = getCategoryAvailable(
        plan,
        category,
        monthKey as MonthKey,
      );
      rows.push([
        monthKey,
        group?.name ?? "",
        category.name,
        centsToDollars(assigned),
        centsToDollars(activity),
        centsToDollars(available),
      ]);
      count += 1;
    }
  }

  return { csv: toCsv(rows), rowCount: count };
}

/** Count helper for UI previews */
export function countFilteredTransactions(
  plan: BudgetPlan,
  filters: ExportFilters,
): number {
  return filterTransactions(plan, filters).length;
}

export function monthsCoveredByTransactions(
  plan: BudgetPlan,
  filters: ExportFilters,
): string[] {
  return [
    ...new Set(filterTransactions(plan, filters).map((t) => t.date.slice(0, 7))),
  ].sort();
}
