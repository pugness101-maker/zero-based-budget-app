import type { Account, AccountBalance, Transaction } from "@/lib/types/budget";
import { sumCents } from "@/lib/money";

export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
): AccountBalance {
  const accountTxns = transactions.filter((t) => t.accountId === account.id);
  const activity = sumCents(accountTxns.map((t) => t.amountCents));
  const clearedActivity = sumCents(
    accountTxns
      .filter((t) => t.cleared === "cleared" || t.cleared === "reconciled")
      .map((t) => t.amountCents),
  );

  return {
    accountId: account.id,
    balanceCents: account.startingBalanceCents + activity,
    clearedBalanceCents: account.startingBalanceCents + clearedActivity,
  };
}

export function getAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  options: { includeClosed?: boolean; includeDeleted?: boolean } = {},
): Map<string, AccountBalance> {
  const includeClosed = options.includeClosed ?? true;
  const includeDeleted = options.includeDeleted ?? false;
  const map = new Map<string, AccountBalance>();
  for (const account of accounts) {
    if (account.deletedAt && !includeDeleted) continue;
    if ((account.closed || account.closedAt) && !includeClosed) continue;
    map.set(account.id, getAccountBalance(account, transactions));
  }
  return map;
}

export function getRunningBalances(
  account: Account,
  transactions: Transaction[],
): Array<{ transactionId: string; runningBalanceCents: number }> {
  const sorted = [...transactions]
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    });

  let running = account.startingBalanceCents;
  return sorted.map((t) => {
    running += t.amountCents;
    return { transactionId: t.id, runningBalanceCents: running };
  });
}
