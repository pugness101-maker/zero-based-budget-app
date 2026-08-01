import {
  assertCanAddTransaction,
  assertCanTransferTo,
} from "@/lib/accounts/operations";
import type {
  BudgetPlan,
  ClearedStatus,
  Transaction,
} from "@/lib/types/budget";
import type { Cents } from "@/lib/money";

export type TransferCreateInput = {
  fromAccountId: string;
  toAccountId: string;
  amountCents: Cents;
  date: string;
  memo?: string;
  cleared?: ClearedStatus;
};

export type TransferResult =
  | {
      ok: true;
      plan: BudgetPlan;
      outTransaction: Transaction;
      inTransaction: Transaction;
    }
  | { ok: false; error: string };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Same accounts, date, and absolute amount already linked as a transfer. */
export function findDuplicateTransfer(
  plan: BudgetPlan,
  input: TransferCreateInput,
): Transaction | undefined {
  const abs = Math.abs(input.amountCents);
  return plan.transactions.find((t) => {
    if (!t.isTransfer || t.amountCents >= 0) return false;
    if (t.accountId !== input.fromAccountId) return false;
    if (t.date !== input.date) return false;
    if (Math.abs(t.amountCents) !== abs) return false;
    const pair = plan.transactions.find((p) => p.id === t.transferPairId);
    return pair?.accountId === input.toAccountId;
  });
}

export function createLinkedTransfer(
  plan: BudgetPlan,
  input: TransferCreateInput,
): TransferResult {
  if (input.fromAccountId === input.toAccountId) {
    return { ok: false, error: "Transfer accounts must be different." };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    return { ok: false, error: "Enter a valid transfer amount." };
  }

  const from = plan.accounts.find((a) => a.id === input.fromAccountId);
  const to = plan.accounts.find((a) => a.id === input.toAccountId);
  const fromBlocked = assertCanAddTransaction(from);
  if (fromBlocked) return { ok: false, error: fromBlocked };
  const toBlocked = assertCanTransferTo(to);
  if (toBlocked) return { ok: false, error: toBlocked };

  if (findDuplicateTransfer(plan, input)) {
    return {
      ok: false,
      error: "An identical transfer already exists for this date and amount.",
    };
  }

  const abs = Math.abs(input.amountCents) as Cents;
  const transferId = newId("xfer");
  const outId = newId("txn");
  const inId = newId("txn");
  const now = new Date().toISOString();
  const cleared = input.cleared ?? "uncleared";

  const outTxn: Transaction = {
    id: outId,
    accountId: input.fromAccountId,
    date: input.date,
    payeeName: `Transfer to ${to?.name ?? "account"}`,
    categoryId: null,
    memo: input.memo,
    amountCents: (-abs) as Cents,
    cleared,
    approved: true,
    isTransfer: true,
    transferId,
    transferPairId: inId,
    source: "transfer",
    createdAt: now,
    updatedAt: now,
  };

  const inTxn: Transaction = {
    id: inId,
    accountId: input.toAccountId,
    date: input.date,
    payeeName: `Transfer from ${from?.name ?? "account"}`,
    categoryId: null,
    memo: input.memo,
    amountCents: abs,
    cleared,
    approved: true,
    isTransfer: true,
    transferId,
    transferPairId: outId,
    source: "transfer",
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    plan: {
      ...plan,
      transactions: [outTxn, inTxn, ...plan.transactions],
    },
    outTransaction: outTxn,
    inTransaction: inTxn,
  };
}

/**
 * Resolve from/to for a transfer started from the current account register.
 * Outflow on current → money leaves current for destination.
 * Inflow on current → money arrives from destination (destination is the from-leg).
 */
export function resolveTransferDirection(input: {
  currentAccountId: string;
  destinationAccountId: string;
  amountCents: Cents;
}): { fromAccountId: string; toAccountId: string; amountCents: Cents } {
  const abs = Math.abs(input.amountCents) as Cents;
  if (input.amountCents < 0) {
    return {
      fromAccountId: input.currentAccountId,
      toAccountId: input.destinationAccountId,
      amountCents: abs,
    };
  }
  return {
    fromAccountId: input.destinationAccountId,
    toAccountId: input.currentAccountId,
    amountCents: abs,
  };
}

/** Convert a normal transaction into a linked transfer pair. */
export function convertTransactionToTransfer(
  plan: BudgetPlan,
  transactionId: string,
  destinationAccountId: string,
): TransferResult {
  const existing = plan.transactions.find((t) => t.id === transactionId);
  if (!existing) return { ok: false, error: "Transaction not found." };
  if (existing.isTransfer) {
    return { ok: false, error: "Transaction is already a transfer." };
  }
  if (existing.splits?.length) {
    return { ok: false, error: "Split transactions cannot become transfers." };
  }

  const direction = resolveTransferDirection({
    currentAccountId: existing.accountId,
    destinationAccountId,
    amountCents: existing.amountCents,
  });

  const without = {
    ...plan,
    transactions: plan.transactions.filter((t) => t.id !== transactionId),
  };

  const created = createLinkedTransfer(without, {
    ...direction,
    date: existing.date,
    memo: existing.memo,
    cleared: existing.cleared,
  });
  if (!created.ok) return created;

  // Preserve original id on the "current account" leg for stable UI refs
  const currentIsOutflow = existing.amountCents < 0;
  const keepIdLeg = currentIsOutflow
    ? created.outTransaction
    : created.inTransaction;
  const otherLeg = currentIsOutflow
    ? created.inTransaction
    : created.outTransaction;

  const remappedKeep: Transaction = {
    ...keepIdLeg,
    id: existing.id,
    transferPairId: otherLeg.id,
    createdAt: existing.createdAt,
    importId: existing.importId,
    importBatchId: existing.importBatchId,
  };
  const remappedOther: Transaction = {
    ...otherLeg,
    transferPairId: existing.id,
  };

  return {
    ok: true,
    plan: {
      ...created.plan,
      transactions: created.plan.transactions.map((t) => {
        if (t.id === keepIdLeg.id) return remappedKeep;
        if (t.id === otherLeg.id) return remappedOther;
        return t;
      }),
    },
    outTransaction: currentIsOutflow ? remappedKeep : remappedOther,
    inTransaction: currentIsOutflow ? remappedOther : remappedKeep,
  };
}

export function isCreditCardAccount(
  plan: BudgetPlan,
  accountId: string,
): boolean {
  const account = plan.accounts.find((a) => a.id === accountId);
  return account?.type === "credit_card" || account?.kind === "credit";
}
