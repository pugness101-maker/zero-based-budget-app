import { getAllAccountBalances } from "@/lib/calculations/account-balances";
import { buildGoalsSummary } from "@/lib/calculations/goals";
import type { MonthKey } from "@/lib/dates";
import { sumCents, type Cents } from "@/lib/money";
import type {
  Account,
  BudgetPlan,
  Transaction,
} from "@/lib/types/budget";

export interface ReportFilters {
  startDate: string;
  endDate: string;
  accountIds: string[]; // empty = all
  categoryIds: string[]; // empty = all
}

export interface CategorySpendRow {
  categoryId: string | null;
  categoryName: string;
  amountCents: Cents;
}

export interface IncomeSpendPoint {
  label: string;
  incomeCents: Cents;
  spendingCents: Cents;
}

export interface ReportDataset {
  filteredTransactions: Transaction[];
  spendingByCategory: CategorySpendRow[];
  incomeCents: Cents;
  spendingCents: Cents;
  netCashFlowCents: Cents;
  netWorthCents: Cents;
  assetCents: Cents;
  liabilityCents: Cents;
  incomeVsSpending: IncomeSpendPoint[];
  targetProgress: {
    totalTargetCents: Cents;
    fundedCents: Cents;
    remainingCents: Cents;
    completedCount: number;
    onTrackCount: number;
    underfundedCount: number;
  };
}

function isOnBudgetTransfer(
  txn: Transaction,
  accountsById: Map<string, Account>,
): boolean {
  if (!txn.isTransfer) return false;
  const account = accountsById.get(txn.accountId);
  if (!account || account.kind !== "on_budget") return false;
  if (!txn.transferPairId) return true;
  // Pair may be on another on-budget account — still exclude from spending.
  return true;
}

function inDateRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function matchesAccount(txn: Transaction, accountIds: string[]): boolean {
  return accountIds.length === 0 || accountIds.includes(txn.accountId);
}

function matchesCategory(txn: Transaction, categoryIds: string[]): boolean {
  if (categoryIds.length === 0) return true;
  if (txn.splits?.length) {
    return txn.splits.some(
      (s) => s.categoryId !== null && categoryIds.includes(s.categoryId),
    );
  }
  return txn.categoryId !== null && categoryIds.includes(txn.categoryId);
}

export function filterReportTransactions(
  plan: BudgetPlan,
  filters: ReportFilters,
): Transaction[] {
  return plan.transactions
    .filter((t) => {
      if (!t.approved) return false;
      if (!inDateRange(t.date, filters.startDate, filters.endDate)) return false;
      if (!matchesAccount(t, filters.accountIds)) return false;
      if (!matchesCategory(t, filters.categoryIds)) return false;
      // Keep transfers in the details table; spending math excludes them separately.
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function isSpendingTxn(
  txn: Transaction,
  accountsById: Map<string, Account>,
): boolean {
  if (!txn.approved || txn.amountCents >= 0) return false;
  if (isOnBudgetTransfer(txn, accountsById)) return false;
  const account = accountsById.get(txn.accountId);
  if (!account || account.kind === "tracking") return false;
  return true;
}

function isIncomeTxn(
  txn: Transaction,
  accountsById: Map<string, Account>,
): boolean {
  if (!txn.approved || txn.amountCents <= 0) return false;
  if (txn.isTransfer) return false;
  const account = accountsById.get(txn.accountId);
  return Boolean(account && account.kind === "on_budget");
}

export function buildReportDataset(
  plan: BudgetPlan,
  filters: ReportFilters,
  monthKey: MonthKey,
): ReportDataset {
  const accountsById = new Map(plan.accounts.map((a) => [a.id, a]));
  const filteredTransactions = filterReportTransactions(plan, filters);

  const spendingTxns = filteredTransactions.filter((t) =>
    isSpendingTxn(t, accountsById),
  );
  const incomeTxns = filteredTransactions.filter((t) =>
    isIncomeTxn(t, accountsById),
  );

  const spendingCents = sumCents(spendingTxns.map((t) => Math.abs(t.amountCents)));
  const incomeCents = sumCents(incomeTxns.map((t) => t.amountCents));

  const byCategory = new Map<string, Cents>();
  for (const t of spendingTxns) {
    if (t.splits?.length) {
      for (const split of t.splits) {
        if (split.amountCents >= 0) continue;
        if (
          filters.categoryIds.length > 0 &&
          (split.categoryId === null ||
            !filters.categoryIds.includes(split.categoryId))
        ) {
          continue;
        }
        const key = split.categoryId ?? "__uncategorized";
        byCategory.set(
          key,
          (byCategory.get(key) ?? 0) + Math.abs(split.amountCents),
        );
      }
      continue;
    }
    const key = t.categoryId ?? "__uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Math.abs(t.amountCents));
  }

  const spendingByCategory: CategorySpendRow[] = [...byCategory.entries()]
    .map(([categoryId, amountCents]) => ({
      categoryId: categoryId === "__uncategorized" ? null : categoryId,
      categoryName:
        categoryId === "__uncategorized"
          ? "Uncategorized"
          : (plan.categories.find((c) => c.id === categoryId)?.name ??
            "Unknown"),
      amountCents,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  // Net worth as of endDate: starting balances + txns on/before endDate
  const txnsThroughEnd = plan.transactions.filter(
    (t) => t.approved && t.date <= filters.endDate,
  );
  const balances = getAllAccountBalances(plan.accounts, txnsThroughEnd);
  let assetCents = 0;
  let liabilityCents = 0;
  for (const account of plan.accounts) {
    if (account.deletedAt) continue;
    // Include closed accounts so net-worth history is preserved
    if (
      filters.accountIds.length > 0 &&
      !filters.accountIds.includes(account.id)
    ) {
      continue;
    }
    const bal = balances.get(account.id)?.balanceCents ?? 0;
    if (account.kind === "credit" || account.type.includes("loan")) {
      liabilityCents += Math.abs(Math.min(0, bal));
      if (bal > 0) assetCents += bal;
    } else {
      assetCents += bal;
    }
  }

  // Income vs spending by week buckets within range
  const incomeVsSpending = buildWeeklySeries(
    incomeTxns,
    spendingTxns,
    filters.startDate,
    filters.endDate,
  );

  const goals = buildGoalsSummary(plan, monthKey);
  const targetProgress = {
    totalTargetCents: goals.totalTargetCents,
    fundedCents: goals.fundedCents,
    remainingCents: goals.remainingCents,
    completedCount: goals.completedCount,
    onTrackCount: goals.onTrackCount,
    underfundedCount: goals.underfundedCount,
  };

  return {
    filteredTransactions,
    spendingByCategory,
    incomeCents,
    spendingCents,
    netCashFlowCents: incomeCents - spendingCents,
    netWorthCents: assetCents - liabilityCents,
    assetCents,
    liabilityCents,
    incomeVsSpending,
    targetProgress,
  };
}

function buildWeeklySeries(
  incomeTxns: Transaction[],
  spendingTxns: Transaction[],
  startDate: string,
  endDate: string,
): IncomeSpendPoint[] {
  const buckets = new Map<string, { income: Cents; spending: Cents }>();

  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    const key = weekKey(cursor);
    if (!buckets.has(key)) buckets.set(key, { income: 0, spending: 0 });
    cursor.setDate(cursor.getDate() + 7);
  }

  // Ensure at least one bucket
  if (buckets.size === 0) {
    buckets.set(weekKey(new Date(`${startDate}T00:00:00`)), {
      income: 0,
      spending: 0,
    });
  }

  for (const t of incomeTxns) {
    const key = weekKey(new Date(`${t.date}T00:00:00`));
    const bucket = buckets.get(key) ?? { income: 0, spending: 0 };
    bucket.income += t.amountCents;
    buckets.set(key, bucket);
  }
  for (const t of spendingTxns) {
    const key = weekKey(new Date(`${t.date}T00:00:00`));
    const bucket = buckets.get(key) ?? { income: 0, spending: 0 };
    bucket.spending += Math.abs(t.amountCents);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({
      label,
      incomeCents: v.income,
      spendingCents: v.spending,
    }));
}

function weekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}/${dd}`;
}

export function defaultReportFilters(monthKey: MonthKey): ReportFilters {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(last).padStart(2, "0")}`,
    accountIds: [],
    categoryIds: [],
  };
}
