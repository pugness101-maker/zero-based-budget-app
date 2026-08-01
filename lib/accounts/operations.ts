import { getAccountBalance } from "@/lib/calculations/account-balances";
import type { Account, AccountType, AccountBudgetKind, BudgetPlan, Transaction } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import { toISODate } from "@/lib/dates";
import {
  buildClosePreview,
  canPermanentlyDelete,
  getDeleteBlockers,
  isAccountClosed,
  pauseScheduledForAccount,
  resumeScheduledForAccount,
} from "@/lib/accounts/lifecycle";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export type AccountEditPatch = {
  name?: string;
  note?: string;
  type?: AccountType;
  kind?: AccountBudgetKind;
  isHidden?: boolean;
};

export function applyAccountEdit(
  plan: BudgetPlan,
  accountId: string,
  patch: AccountEditPatch,
): BudgetPlan {
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.id === accountId
        ? {
            ...a,
            ...patch,
            name: patch.name?.trim() || a.name,
          }
        : a,
    ),
  };
}

export function hideAccount(plan: BudgetPlan, accountId: string): BudgetPlan {
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.id === accountId && !isAccountClosed(a)
        ? { ...a, isHidden: true }
        : a,
    ),
  };
}

export function unhideAccount(plan: BudgetPlan, accountId: string): BudgetPlan {
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.id === accountId ? { ...a, isHidden: false } : a,
    ),
  };
}

export type CloseAccountInput = {
  accountId: string;
  strategy: "zero" | "transfer" | "adjustment";
  transferToAccountId?: string;
  reason?: string;
  confirmed: boolean;
};

export type CloseAccountResult =
  | { ok: true; plan: BudgetPlan }
  | { ok: false; error: string };

export function closeAccount(
  plan: BudgetPlan,
  input: CloseAccountInput,
): CloseAccountResult {
  if (!input.confirmed) {
    return { ok: false, error: "Closing an account requires explicit confirmation." };
  }

  const account = plan.accounts.find((a) => a.id === input.accountId);
  if (!account) return { ok: false, error: "Account not found." };
  if (account.deletedAt) return { ok: false, error: "Account is deleted." };
  if (isAccountClosed(account)) {
    return { ok: false, error: "Account is already closed." };
  }

  const preview = buildClosePreview(plan, input.accountId);
  if (!preview) return { ok: false, error: "Unable to preview close." };

  let nextPlan = plan;
  let transactions = [...plan.transactions];

  if (preview.workingBalanceCents !== 0) {
    if (input.strategy === "zero") {
      return {
        ok: false,
        error:
          "Cannot close with a non-zero balance. Transfer remaining funds, create a closing adjustment, or cancel.",
      };
    }

    if (input.strategy === "transfer") {
      if (!input.transferToAccountId) {
        return { ok: false, error: "Select an account to receive the remaining balance." };
      }
      const to = plan.accounts.find((a) => a.id === input.transferToAccountId);
      if (!to) return { ok: false, error: "Transfer destination not found." };
      if (isAccountClosed(to) || to.deletedAt) {
        return { ok: false, error: "Cannot transfer to a closed or deleted account." };
      }
      if (to.id === account.id) {
        return { ok: false, error: "Choose a different destination account." };
      }

      const date = toISODate(new Date());
      const transferId = newId("xfer");
      const outId = newId("txn");
      const inId = newId("txn");

      // Move remaining balance so closing account reaches zero.
      // Positive balance → outflow from closing; negative → inflow to closing.
      const closingDelta = (-preview.workingBalanceCents) as Cents;
      const destinationDelta = preview.workingBalanceCents as Cents;

      const outTxn: Transaction = {
        id: outId,
        accountId: account.id,
        date,
        payeeName: `Closing transfer to ${to.name}`,
        categoryId: null,
        memo: "Account closure balance transfer",
        amountCents: closingDelta,
        cleared: "cleared",
        approved: true,
        isTransfer: true,
        transferId,
        transferPairId: inId,
      };
      const inTxn: Transaction = {
        id: inId,
        accountId: to.id,
        date,
        payeeName: `Closing transfer from ${account.name}`,
        categoryId: null,
        memo: "Account closure balance transfer",
        amountCents: destinationDelta,
        cleared: "cleared",
        approved: true,
        isTransfer: true,
        transferId,
        transferPairId: outId,
      };
      transactions = [outTxn, inTxn, ...transactions];
    } else if (input.strategy === "adjustment") {
      const date = toISODate(new Date());
      const adjustment: Transaction = {
        id: newId("txn"),
        accountId: account.id,
        date,
        payeeName: "Closing adjustment",
        categoryId: null,
        memo: "Closing balance adjustment — zeros account for closure",
        amountCents: (-preview.workingBalanceCents) as Cents,
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      };
      transactions = [adjustment, ...transactions];
    } else {
      return { ok: false, error: "Invalid close strategy." };
    }

    nextPlan = { ...plan, transactions };
    const bal = getAccountBalance(account, transactions);
    if (bal.balanceCents !== 0) {
      return {
        ok: false,
        error: "Balance was not zeroed before close. Aborting.",
      };
    }
  }

  const closedAt = new Date().toISOString();
  nextPlan = {
    ...nextPlan,
    transactions,
    accounts: nextPlan.accounts.map((a) =>
      a.id === account.id
        ? {
            ...a,
            closed: true,
            closedAt,
            closedReason: input.reason ?? "user_closed",
            isHidden: true,
          }
        : a,
    ),
    scheduledTransactions: pauseScheduledForAccount(
      nextPlan.scheduledTransactions,
      account.id,
    ),
  };

  return { ok: true, plan: nextPlan };
}

export type ReopenAccountInput = {
  accountId: string;
  keepHidden?: boolean;
};

export function reopenAccount(
  plan: BudgetPlan,
  input: ReopenAccountInput,
): CloseAccountResult {
  const account = plan.accounts.find((a) => a.id === input.accountId);
  if (!account) return { ok: false, error: "Account not found." };
  if (!isAccountClosed(account)) {
    return { ok: false, error: "Account is not closed." };
  }

  return {
    ok: true,
    plan: {
      ...plan,
      accounts: plan.accounts.map((a) =>
        a.id === input.accountId
          ? {
              ...a,
              closed: false,
              closedAt: undefined,
              closedReason: undefined,
              isHidden: Boolean(input.keepHidden),
            }
          : a,
      ),
      scheduledTransactions: resumeScheduledForAccount(
        plan.scheduledTransactions,
        input.accountId,
      ),
    },
  };
}

export function deleteAccountSafe(
  plan: BudgetPlan,
  accountId: string,
): CloseAccountResult {
  if (!canPermanentlyDelete(plan, accountId)) {
    const reasons = getDeleteBlockers(plan, accountId)
      .map((b) => b.message)
      .join(" ");
    return {
      ok: false,
      error: `Cannot permanently delete this account. ${reasons} Close it instead to preserve history.`,
    };
  }

  return {
    ok: true,
    plan: {
      ...plan,
      accounts: plan.accounts.filter((a) => a.id !== accountId),
    },
  };
}

export function bulkSetHidden(
  plan: BudgetPlan,
  accountIds: string[],
  hidden: boolean,
): BudgetPlan {
  const ids = new Set(accountIds);
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      ids.has(a.id) && !isAccountClosed(a) ? { ...a, isHidden: hidden } : a,
    ),
  };
}

export function bulkCloseAccounts(
  plan: BudgetPlan,
  accountIds: string[],
  confirmed: boolean,
): CloseAccountResult {
  if (!confirmed) {
    return { ok: false, error: "Bulk close requires confirmation." };
  }
  let next = plan;
  for (const id of accountIds) {
    const account = next.accounts.find((a) => a.id === id);
    if (!account || isAccountClosed(account) || account.deletedAt) continue;
    const preview = buildClosePreview(next, id);
    if (!preview) continue;
    if (!preview.canCloseSilently) {
      return {
        ok: false,
        error: `"${account.name}" has a non-zero balance. Close it individually to transfer or adjust.`,
      };
    }
    const result = closeAccount(next, {
      accountId: id,
      strategy: "zero",
      confirmed: true,
      reason: "bulk_close",
    });
    if (!result.ok) return result;
    next = result.plan;
  }
  return { ok: true, plan: next };
}

export function bulkReopenAccounts(
  plan: BudgetPlan,
  accountIds: string[],
  keepHidden = false,
): BudgetPlan {
  let next = plan;
  for (const id of accountIds) {
    const result = reopenAccount(next, { accountId: id, keepHidden });
    if (result.ok) next = result.plan;
  }
  return next;
}

export function assertCanAddTransaction(
  account: Account | undefined,
): string | null {
  if (!account) return "Account not found.";
  if (account.deletedAt) return "Account is deleted.";
  if (isAccountClosed(account)) {
    return "This account is closed. Reopen it to add transactions.";
  }
  return null;
}

export function assertCanTransferTo(
  account: Account | undefined,
): string | null {
  if (!account) return "Destination account not found.";
  if (account.deletedAt) return "Destination account is deleted.";
  if (isAccountClosed(account)) {
    return "Transfers to closed accounts are not allowed.";
  }
  return null;
}
