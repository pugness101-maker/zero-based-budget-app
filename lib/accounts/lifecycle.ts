import { getAccountBalance } from "@/lib/calculations/account-balances";
import type {
  Account,
  BudgetPlan,
  ScheduledTransaction,
  Transaction,
} from "@/lib/types/budget";
import type { Cents } from "@/lib/money";

export type CloseBalanceStrategy =
  | "transfer"
  | "adjustment"
  | "cancel";

export interface AccountClosePreview {
  workingBalanceCents: Cents;
  clearedBalanceCents: Cents;
  unclearedBalanceCents: Cents;
  scheduledCount: number;
  unreconciledCount: number;
  linkedTransferCount: number;
  canCloseSilently: boolean;
}

export interface DeleteBlocker {
  code:
    | "has_transactions"
    | "has_transfers"
    | "has_scheduled"
    | "has_reconciliations"
    | "has_import_refs"
    | "soft_deleted";
  message: string;
}

export function isAccountClosed(account: Account): boolean {
  return Boolean(account.closedAt) || account.closed === true;
}

export function isAccountHidden(account: Account): boolean {
  return Boolean(account.isHidden) && !isAccountClosed(account);
}

export function isAccountActive(account: Account): boolean {
  return !isAccountClosed(account) && !account.deletedAt;
}

export function isAccountVisibleInSidebar(
  account: Account,
  options: { includeHidden?: boolean; includeClosed?: boolean } = {},
): boolean {
  if (account.deletedAt) return false;
  if (isAccountClosed(account)) return Boolean(options.includeClosed);
  if (account.isHidden) return Boolean(options.includeHidden);
  return true;
}

export function getActiveAccounts(
  accounts: Account[],
  options: { includeHidden?: boolean; includeClosed?: boolean } = {},
): Account[] {
  return accounts.filter((a) => {
    if (a.deletedAt) return false;
    if (isAccountClosed(a)) return Boolean(options.includeClosed);
    if (a.isHidden) return Boolean(options.includeHidden);
    return true;
  });
}

export function buildClosePreview(
  plan: BudgetPlan,
  accountId: string,
): AccountClosePreview | null {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const balance = getAccountBalance(account, plan.transactions);
  const accountTxns = plan.transactions.filter((t) => t.accountId === accountId);
  const unclearedBalanceCents =
    balance.balanceCents - balance.clearedBalanceCents;
  const scheduledCount = (plan.scheduledTransactions ?? []).filter(
    (s) => s.accountId === accountId && s.status === "pending",
  ).length;
  const unreconciledCount = accountTxns.filter(
    (t) => t.cleared !== "reconciled",
  ).length;
  const linkedTransferCount = accountTxns.filter((t) => t.isTransfer).length;

  return {
    workingBalanceCents: balance.balanceCents,
    clearedBalanceCents: balance.clearedBalanceCents,
    unclearedBalanceCents,
    scheduledCount,
    unreconciledCount,
    linkedTransferCount,
    canCloseSilently: balance.balanceCents === 0,
  };
}

export function getDeleteBlockers(
  plan: BudgetPlan,
  accountId: string,
): DeleteBlocker[] {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return [{ code: "soft_deleted", message: "Account not found." }];
  if (account.deletedAt) {
    return [{ code: "soft_deleted", message: "Account is already deleted." }];
  }

  const blockers: DeleteBlocker[] = [];
  const txns = plan.transactions.filter((t) => t.accountId === accountId);
  if (txns.length > 0) {
    blockers.push({
      code: "has_transactions",
      message: `Has ${txns.length} transaction(s). Close the account instead.`,
    });
  }
  if (txns.some((t) => t.isTransfer || t.transferPairId)) {
    blockers.push({
      code: "has_transfers",
      message: "Has linked transfers.",
    });
  }
  if (txns.some((t) => t.cleared === "reconciled")) {
    blockers.push({
      code: "has_reconciliations",
      message: "Has reconciled transactions.",
    });
  }
  const scheduled = (plan.scheduledTransactions ?? []).filter(
    (s) => s.accountId === accountId,
  );
  if (scheduled.length > 0) {
    blockers.push({
      code: "has_scheduled",
      message: `Has ${scheduled.length} scheduled transaction(s).`,
    });
  }
  if (
    txns.some((t) => t.importBatchId || t.importId) ||
    Boolean(account.importedSource)
  ) {
    blockers.push({
      code: "has_import_refs",
      message: "Has import history references.",
    });
  }
  return blockers;
}

export function canPermanentlyDelete(
  plan: BudgetPlan,
  accountId: string,
): boolean {
  return getDeleteBlockers(plan, accountId).length === 0;
}

export function pauseScheduledForAccount(
  scheduled: ScheduledTransaction[] | undefined,
  accountId: string,
): ScheduledTransaction[] {
  return (scheduled ?? []).map((s) =>
    s.accountId === accountId && s.status === "pending"
      ? {
          ...s,
          status: "skipped" as const,
          pausedByAccountClose: true,
        }
      : s,
  );
}

export function resumeScheduledForAccount(
  scheduled: ScheduledTransaction[] | undefined,
  accountId: string,
): ScheduledTransaction[] {
  return (scheduled ?? []).map((s) =>
    s.accountId === accountId && s.pausedByAccountClose
      ? {
          ...s,
          status: "pending" as const,
          pausedByAccountClose: undefined,
        }
      : s,
  );
}

export function accountLastTransactionDate(
  transactions: Transaction[],
  accountId: string,
): string | undefined {
  const dates = transactions
    .filter((t) => t.accountId === accountId)
    .map((t) => t.date)
    .sort();
  return dates[dates.length - 1];
}

export function accountTransactionCount(
  transactions: Transaction[],
  accountId: string,
): number {
  return transactions.filter((t) => t.accountId === accountId).length;
}

/** Normalize legacy accounts after load/import. */
export function migrateAccountFields(account: Account): Account {
  const closed = Boolean(account.closedAt) || account.closed === true;
  return {
    ...account,
    isHidden: Boolean(account.isHidden),
    closed,
    closedAt: closed
      ? (account.closedAt ?? "1970-01-01T00:00:00.000Z")
      : undefined,
    closedReason: closed ? account.closedReason : undefined,
  };
}

export function migratePlanAccounts(plan: BudgetPlan): BudgetPlan {
  return {
    ...plan,
    accounts: plan.accounts.map(migrateAccountFields),
    preferences: {
      ...plan.preferences,
      showHiddenAccounts: plan.preferences.showHiddenAccounts ?? false,
      showClosedAccounts: plan.preferences.showClosedAccounts ?? false,
    },
  };
}
