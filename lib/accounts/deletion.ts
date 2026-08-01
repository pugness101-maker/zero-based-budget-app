import { getAccountBalance } from "@/lib/calculations/account-balances";
import { buildReportDataset } from "@/lib/calculations/reports";
import { canPermanentlyDelete, isAccountClosed } from "@/lib/accounts/lifecycle";
import { toISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  Account,
  AccountBudgetKind,
  BudgetPlan,
  Target,
  Transaction,
} from "@/lib/types/budget";

export const DEFAULT_DELETED_ACCOUNT_RETENTION_DAYS = 30;

export type AccountDeleteMode =
  | "empty_purge"
  | "delete_all_history"
  | "move_then_delete"
  | "soft_delete";

export type BalanceResolution =
  | { type: "already_zero" }
  | { type: "transfer"; toAccountId: string }
  | { type: "adjustment" };

export type GoalDisposition =
  | { type: "delete" }
  | { type: "reassign"; toAccountId: string }
  | { type: "archive" };

export type TransferOrphanHandling =
  | "convert_to_adjustment"
  | "convert_to_ordinary";

export interface AccountDeletePreview {
  accountId: string;
  name: string;
  type: Account["type"];
  kind: AccountBudgetKind;
  finalBalanceCents: Cents;
  closedAt?: string;
  transactionCount: number;
  transferCount: number;
  scheduledCount: number;
  reconciliationCount: number;
  importRefCount: number;
  goalCount: number;
  goals: Array<{ id: string; name: string; type: Target["type"] }>;
  canEmptyPurge: boolean;
  recommended: AccountDeleteMode;
  reportImpact: {
    netWorthDeltaCents: Cents;
    transactionsRemoved: number;
  };
  incompatibleMoveKinds: AccountBudgetKind[];
}

export type DeleteAccountResult =
  | { ok: true; plan: BudgetPlan }
  | { ok: false; error: string };

export interface AccountDeleteStrategy {
  mode: AccountDeleteMode;
  confirmedName?: string;
  secondConfirm?: boolean;
  destinationAccountId?: string;
  balanceResolution?: BalanceResolution;
  goalDisposition?: GoalDisposition;
  transferOrphanHandling?: TransferOrphanHandling;
  confirmedIncompatibleMove?: boolean;
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function accountTxns(plan: BudgetPlan, accountId: string): Transaction[] {
  return plan.transactions.filter((t) => t.accountId === accountId);
}

function linkedGoals(plan: BudgetPlan, accountId: string): Target[] {
  return plan.targets.filter(
    (t) => t.linkType === "account" && t.accountId === accountId && !t.paused,
  );
}

export function buildAccountDeletePreview(
  plan: BudgetPlan,
  accountId: string,
): AccountDeletePreview | null {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account || account.deletedAt) return null;

  const txns = accountTxns(plan, accountId);
  const transfers = txns.filter((t) => t.isTransfer || t.transferPairId);
  const scheduled = (plan.scheduledTransactions ?? []).filter(
    (s) => s.accountId === accountId,
  );
  const reconciliations = txns.filter((t) => t.cleared === "reconciled");
  const importRefs = txns.filter((t) => t.importBatchId || t.importId);
  const goals = linkedGoals(plan, accountId);
  const bal = getAccountBalance(account, plan.transactions).balanceCents;
  const canEmpty = canPermanentlyDelete(plan, accountId);

  let recommended: AccountDeleteMode = "soft_delete";
  if (canEmpty && bal === 0) recommended = "empty_purge";
  else if (txns.length > 0) recommended = "soft_delete";

  const monthKey = plan.workingMonthKey;
  const endDate = `${monthKey}-28`;
  const reportFilters = {
    startDate: `${monthKey}-01`,
    endDate,
    accountIds: [] as string[],
    categoryIds: [] as string[],
  };
  const before = buildReportDataset(plan, reportFilters, monthKey);
  // Approximate impact if this account + its txns vanished
  const stripped: BudgetPlan = {
    ...plan,
    accounts: plan.accounts.filter((a) => a.id !== accountId),
    transactions: plan.transactions.filter((t) => t.accountId !== accountId),
  };
  const after = buildReportDataset(stripped, reportFilters, monthKey);

  return {
    accountId,
    name: account.name,
    type: account.type,
    kind: account.kind,
    finalBalanceCents: bal,
    closedAt: account.closedAt,
    transactionCount: txns.length,
    transferCount: transfers.length,
    scheduledCount: scheduled.length,
    reconciliationCount: reconciliations.length,
    importRefCount: importRefs.length + (account.importedSource ? 1 : 0),
    goalCount: goals.length,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name?.trim() || g.id,
      type: g.type,
    })),
    canEmptyPurge: canEmpty,
    recommended,
    reportImpact: {
      netWorthDeltaCents: (after.netWorthCents -
        before.netWorthCents) as Cents,
      transactionsRemoved: txns.length,
    },
    incompatibleMoveKinds:
      account.kind === "credit"
        ? (["tracking"] as AccountBudgetKind[])
        : account.kind === "tracking"
          ? (["credit"] as AccountBudgetKind[])
          : [],
  };
}

function applyBalanceResolution(
  plan: BudgetPlan,
  accountId: string,
  resolution: BalanceResolution | undefined,
): DeleteAccountResult {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "Account not found." };
  const bal = getAccountBalance(account, plan.transactions).balanceCents;
  if (bal === 0) return { ok: true, plan };

  if (!resolution) {
    return {
      ok: false,
      error:
        "Final balance must be $0.00. Transfer remaining balance, create a closing adjustment, or cancel.",
    };
  }

  if (resolution.type === "already_zero") {
    return {
      ok: false,
      error: "Balance is not zero. Choose transfer or adjustment.",
    };
  }

  const today = toISODate(new Date());
  if (resolution.type === "transfer") {
    const dest = plan.accounts.find((a) => a.id === resolution.toAccountId);
    if (!dest || dest.deletedAt || isAccountClosed(dest)) {
      return { ok: false, error: "Choose a valid destination account." };
    }
    if (dest.id === accountId) {
      return { ok: false, error: "Destination must be a different account." };
    }
    const outId = newId("txn");
    const inId = newId("txn");
    const amount = bal;
    const out: Transaction = {
      id: outId,
      accountId,
      date: today,
      payeeName: `Transfer to ${dest.name}`,
      categoryId: null,
      memo: "Closing balance transfer",
      amountCents: (-amount) as Cents,
      cleared: "cleared",
      approved: true,
      isTransfer: true,
      transferPairId: inId,
    };
    const inn: Transaction = {
      id: inId,
      accountId: dest.id,
      date: today,
      payeeName: `Transfer from ${account.name}`,
      categoryId: null,
      memo: "Closing balance transfer",
      amountCents: amount as Cents,
      cleared: "cleared",
      approved: true,
      isTransfer: true,
      transferPairId: outId,
    };
    return {
      ok: true,
      plan: { ...plan, transactions: [out, inn, ...plan.transactions] },
    };
  }

  // adjustment — zero the balance with a single txn
  const adj: Transaction = {
    id: newId("txn"),
    accountId,
    date: today,
    payeeName: "Closing balance adjustment",
    categoryId: null,
    memo: "Balance cleared before account deletion",
    amountCents: (-bal) as Cents,
    cleared: "cleared",
    approved: true,
    isTransfer: false,
  };
  return {
    ok: true,
    plan: { ...plan, transactions: [adj, ...plan.transactions] },
  };
}

function applyGoalDisposition(
  plan: BudgetPlan,
  accountId: string,
  disposition: GoalDisposition | undefined,
): DeleteAccountResult {
  const goals = plan.targets.filter(
    (t) => t.linkType === "account" && t.accountId === accountId,
  );
  if (goals.length === 0) return { ok: true, plan };
  if (!disposition) {
    return {
      ok: false,
      error:
        "This account has linked goals. Delete, reassign, or archive them first.",
    };
  }
  if (disposition.type === "delete") {
    const ids = new Set(goals.map((g) => g.id));
    return {
      ok: true,
      plan: { ...plan, targets: plan.targets.filter((t) => !ids.has(t.id)) },
    };
  }
  if (disposition.type === "archive") {
    return {
      ok: true,
      plan: {
        ...plan,
        targets: plan.targets.map((t) =>
          t.linkType === "account" && t.accountId === accountId
            ? { ...t, paused: true }
            : t,
        ),
      },
    };
  }
  const dest = plan.accounts.find((a) => a.id === disposition.toAccountId);
  if (!dest || dest.deletedAt) {
    return { ok: false, error: "Choose a valid account for goal reassignment." };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      targets: plan.targets.map((t) =>
        t.linkType === "account" && t.accountId === accountId
          ? { ...t, accountId: dest.id }
          : t,
      ),
    },
  };
}

/** Convert or remove transfer pairs when purging account history. */
function purgeAccountHistory(
  plan: BudgetPlan,
  accountId: string,
  orphanHandling: TransferOrphanHandling = "convert_to_adjustment",
): BudgetPlan {
  const removeIds = new Set(
    plan.transactions.filter((t) => t.accountId === accountId).map((t) => t.id),
  );

  const pairIds = new Set(
    plan.transactions
      .filter((t) => t.accountId === accountId && t.transferPairId)
      .map((t) => t.transferPairId!)
      .filter((id) => !removeIds.has(id)),
  );

  let transactions = plan.transactions
    .filter((t) => !removeIds.has(t.id))
    .map((t) => {
      if (!pairIds.has(t.id)) return t;
      // Remaining side of a transfer — convert so no orphan links
      if (orphanHandling === "convert_to_ordinary") {
        return {
          ...t,
          isTransfer: false,
          transferPairId: undefined,
          payeeName: t.payeeName.startsWith("Transfer")
            ? "Former transfer"
            : t.payeeName,
          memo: [t.memo, "Converted from transfer (account deleted)"]
            .filter(Boolean)
            .join(" · "),
        };
      }
      return {
        ...t,
        isTransfer: false,
        transferPairId: undefined,
        payeeName: "Balance adjustment",
        categoryId: null,
        memo: [t.memo, "Converted from transfer (account deleted)"]
          .filter(Boolean)
          .join(" · "),
      };
    });

  // Also clear any dangling transferPairId pointing at removed txns
  transactions = transactions.map((t) =>
    t.transferPairId && removeIds.has(t.transferPairId)
      ? {
          ...t,
          isTransfer: false,
          transferPairId: undefined,
          payeeName:
            orphanHandling === "convert_to_ordinary"
              ? t.payeeName.startsWith("Transfer")
                ? "Former transfer"
                : t.payeeName
              : "Balance adjustment",
          memo: [t.memo, "Converted from transfer (account deleted)"]
            .filter(Boolean)
            .join(" · "),
        }
      : t,
  );

  return {
    ...plan,
    transactions,
    scheduledTransactions: (plan.scheduledTransactions ?? []).filter(
      (s) => s.accountId !== accountId,
    ),
    targets: plan.targets.filter(
      (t) => !(t.linkType === "account" && t.accountId === accountId),
    ),
  };
}

function moveTransactionsThenRemoveAccount(
  plan: BudgetPlan,
  sourceId: string,
  destinationId: string,
): DeleteAccountResult {
  const source = plan.accounts.find((a) => a.id === sourceId);
  const dest = plan.accounts.find((a) => a.id === destinationId);
  if (!source || !dest) return { ok: false, error: "Account not found." };
  if (dest.deletedAt || isAccountClosed(dest)) {
    return { ok: false, error: "Destination must be an open account." };
  }

  const movedIds = new Set(
    plan.transactions.filter((t) => t.accountId === sourceId).map((t) => t.id),
  );

  const transactions = plan.transactions.map((t) => {
    if (t.accountId === sourceId) {
      // Move non-transfer and transfer legs that belong to source
      return {
        ...t,
        accountId: destinationId,
        updatedAt: new Date().toISOString(),
      };
    }
    return t;
  });

  // Rebuild transfer payee labels when both sides still exist
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const relabeled = transactions.map((t) => {
    if (!t.isTransfer || !t.transferPairId) return t;
    const pair = byId.get(t.transferPairId);
    if (!pair) return t;
    if (!movedIds.has(t.id) && !movedIds.has(pair.id)) return t;
    const otherAccount = plan.accounts.find((a) => a.id === pair.accountId);
    if (!otherAccount) return t;
    const direction =
      t.amountCents < 0
        ? `Transfer to ${otherAccount.name}`
        : `Transfer from ${otherAccount.name}`;
    return { ...t, payeeName: direction };
  });

  return {
    ok: true,
    plan: {
      ...plan,
      transactions: relabeled,
      scheduledTransactions: (plan.scheduledTransactions ?? []).map((s) =>
        s.accountId === sourceId ? { ...s, accountId: destinationId } : s,
      ),
      accounts: plan.accounts.filter((a) => a.id !== sourceId),
    },
  };
}

function softDeleteAccount(plan: BudgetPlan, accountId: string): BudgetPlan {
  const txCount = accountTxns(plan, accountId).length;
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.id === accountId
        ? {
            ...a,
            deletedAt: new Date().toISOString(),
            deletionMethod: "soft_delete" as const,
            deletedTransactionCount: txCount,
            isHidden: true,
            closed: true,
            closedAt: a.closedAt ?? new Date().toISOString(),
          }
        : a,
    ),
  };
}

export function applyAccountDeleteStrategy(
  plan: BudgetPlan,
  accountId: string,
  strategy: AccountDeleteStrategy,
): DeleteAccountResult {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "Account not found." };
  if (account.deletedAt) {
    return { ok: false, error: "Account is already deleted." };
  }

  let next = plan;

  // Goals: empty purge forbids them; soft-delete keeps links; others require disposition
  if (strategy.mode === "empty_purge") {
    if (linkedGoals(next, accountId).length > 0) {
      return {
        ok: false,
        error: "Empty delete requires no goal links. Reassign or remove goals.",
      };
    }
  } else if (strategy.mode !== "soft_delete") {
    const goalsResult = applyGoalDisposition(
      next,
      accountId,
      strategy.goalDisposition,
    );
    if (!goalsResult.ok) return goalsResult;
    next = goalsResult.plan;
  }

  // Balance safety (all modes that remove or soft-delete)
  const bal = getAccountBalance(
    next.accounts.find((a) => a.id === accountId)!,
    next.transactions,
  ).balanceCents;
  if (bal !== 0) {
    const balResult = applyBalanceResolution(
      next,
      accountId,
      strategy.balanceResolution,
    );
    if (!balResult.ok) return balResult;
    next = balResult.plan;
  }

  if (strategy.mode === "empty_purge") {
    if (!canPermanentlyDelete(next, accountId)) {
      return {
        ok: false,
        error:
          "Account still has history. Use soft delete, move, or delete-all-history.",
      };
    }
    if (linkedGoals(next, accountId).length > 0) {
      return { ok: false, error: "Remove or reassign goals first." };
    }
    return {
      ok: true,
      plan: {
        ...next,
        accounts: next.accounts.filter((a) => a.id !== accountId),
        scheduledTransactions: (next.scheduledTransactions ?? []).filter(
          (s) => s.accountId !== accountId,
        ),
      },
    };
  }

  if (strategy.mode === "soft_delete") {
    return { ok: true, plan: softDeleteAccount(next, accountId) };
  }

  if (strategy.mode === "move_then_delete") {
    if (!strategy.destinationAccountId) {
      return { ok: false, error: "Choose a destination account." };
    }
    const dest = next.accounts.find(
      (a) => a.id === strategy.destinationAccountId,
    );
    if (!dest) return { ok: false, error: "Destination account not found." };
    if (
      next.accounts.find((a) => a.id === accountId)?.kind === "credit" &&
      dest.kind === "tracking" &&
      !strategy.confirmedIncompatibleMove
    ) {
      return {
        ok: false,
        error:
          "Moving credit-card history into a tracking account is unusual. Confirm to continue.",
      };
    }
    if (
      next.accounts.find((a) => a.id === accountId)?.kind === "tracking" &&
      dest.kind === "credit" &&
      !strategy.confirmedIncompatibleMove
    ) {
      return {
        ok: false,
        error:
          "Moving tracking history into a credit account is unusual. Confirm to continue.",
      };
    }
    // Goals already handled; also reassign remaining paused goals if any
    next = {
      ...next,
      targets: next.targets.map((t) =>
        t.linkType === "account" && t.accountId === accountId
          ? { ...t, accountId: strategy.destinationAccountId! }
          : t,
      ),
    };
    return moveTransactionsThenRemoveAccount(
      next,
      accountId,
      strategy.destinationAccountId,
    );
  }

  // delete_all_history
  if (strategy.confirmedName?.trim() !== account.name) {
    return {
      ok: false,
      error: "Type the account name exactly to confirm permanent deletion.",
    };
  }
  if (!strategy.secondConfirm) {
    return {
      ok: false,
      error: "Second confirmation is required for deleting all history.",
    };
  }

  next = purgeAccountHistory(
    next,
    accountId,
    strategy.transferOrphanHandling ?? "convert_to_adjustment",
  );
  return {
    ok: true,
    plan: {
      ...next,
      accounts: next.accounts.filter((a) => a.id !== accountId),
    },
  };
}

export function restoreSoftDeletedAccount(
  plan: BudgetPlan,
  accountId: string,
): DeleteAccountResult {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "Account not found." };
  if (!account.deletedAt) {
    return { ok: false, error: "Account is not soft-deleted." };
  }
  if (
    account.deletionMethod &&
    account.deletionMethod !== "soft_delete" &&
    account.deletionMethod !== "move_then_delete"
  ) {
    return { ok: false, error: "This deletion cannot be restored." };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      accounts: plan.accounts.map((a) =>
        a.id === accountId
          ? {
              ...a,
              deletedAt: undefined,
              deletionMethod: undefined,
              deletedTransactionCount: undefined,
              // Remain closed — user can reopen separately
              isHidden: true,
            }
          : a,
      ),
    },
  };
}

export function purgeSoftDeletedAccount(
  plan: BudgetPlan,
  accountId: string,
  options: {
    confirmedName: string;
    secondConfirm: boolean;
    transferOrphanHandling?: TransferOrphanHandling;
  },
): DeleteAccountResult {
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, error: "Account not found." };
  if (!account.deletedAt) {
    return { ok: false, error: "Only soft-deleted accounts can be purged." };
  }
  if (options.confirmedName.trim() !== account.name) {
    return { ok: false, error: "Type the account name to purge." };
  }
  if (!options.secondConfirm) {
    return { ok: false, error: "Second confirmation required for purge." };
  }
  const next = purgeAccountHistory(
    plan,
    accountId,
    options.transferOrphanHandling ?? "convert_to_adjustment",
  );
  return {
    ok: true,
    plan: {
      ...next,
      accounts: next.accounts.filter((a) => a.id !== accountId),
    },
  };
}

export function getRecentlyDeletedAccounts(plan: BudgetPlan): Account[] {
  return plan.accounts
    .filter((a) => Boolean(a.deletedAt))
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
}

export function isPastRetention(
  account: Account,
  retentionDays = DEFAULT_DELETED_ACCOUNT_RETENTION_DAYS,
): boolean {
  if (!account.deletedAt) return false;
  const deleted = new Date(account.deletedAt).getTime();
  const ms = retentionDays * 24 * 60 * 60 * 1000;
  return Date.now() - deleted > ms;
}

export function bulkApplyAccountDelete(
  plan: BudgetPlan,
  accountIds: string[],
  strategy: Omit<AccountDeleteStrategy, "confirmedName"> & {
    /** For delete_all_history bulk, names are not typed — require explicit flag */
    allowBulkHistoryDelete?: boolean;
  },
): DeleteAccountResult {
  let next = plan;
  for (const id of accountIds) {
    const account = next.accounts.find((a) => a.id === id);
    if (!account || account.deletedAt || !isAccountClosed(account)) {
      continue;
    }
    const modeStrategy: AccountDeleteStrategy = {
      ...strategy,
      confirmedName:
        strategy.mode === "delete_all_history" ? account.name : undefined,
      secondConfirm:
        strategy.mode === "delete_all_history"
          ? Boolean(strategy.allowBulkHistoryDelete)
          : strategy.secondConfirm,
    };
    const result = applyAccountDeleteStrategy(next, id, modeStrategy);
    if (!result.ok) {
      return {
        ok: false,
        error: `${account.name}: ${result.error}`,
      };
    }
    next = result.plan;
  }
  return { ok: true, plan: next };
}

/** Detect orphaned transferPairId references. */
export function findOrphanedTransferLinks(plan: BudgetPlan): string[] {
  const ids = new Set(plan.transactions.map((t) => t.id));
  return plan.transactions
    .filter((t) => t.transferPairId && !ids.has(t.transferPairId))
    .map((t) => t.id);
}
