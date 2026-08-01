import { validateSplitTotals } from "@/lib/calculations/plan";
import {
  assertCanAddTransaction,
  assertCanTransferTo,
} from "@/lib/accounts/operations";
import { isAccountClosed } from "@/lib/accounts/lifecycle";
import { ensurePayeeOnPlan } from "@/lib/payees/catalog";
import { convertTransactionToTransfer } from "@/lib/payees/transfers";
import type {
  BudgetPlan,
  ClearedStatus,
  Transaction,
  TransactionSplit,
} from "@/lib/types/budget";
import type { Cents } from "@/lib/money";

export type TransactionSource =
  | "manual"
  | "import"
  | "scheduled"
  | "transfer"
  | "adjustment";

export interface TransactionEditInput {
  accountId: string;
  date: string;
  payeeName: string;
  categoryId: string | null;
  memo?: string;
  /** Signed amount: positive inflow, negative outflow */
  amountCents: Cents;
  cleared: ClearedStatus;
  flag?: string;
  splits?: TransactionSplit[];
  /** For transfers — destination account of the other leg */
  transferAccountId?: string;
}

export type EditResult =
  | { ok: true; plan: BudgetPlan; transaction: Transaction }
  | { ok: false; error: string };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function validateInflowOutflowExclusive(
  outflowCents: number,
  inflowCents: number,
): string | null {
  if (outflowCents > 0 && inflowCents > 0) {
    return "A transaction cannot have both a non-zero inflow and non-zero outflow.";
  }
  if (outflowCents < 0 || inflowCents < 0) {
    return "Outflow and inflow must be non-negative amounts.";
  }
  if (!Number.isInteger(outflowCents) || !Number.isInteger(inflowCents)) {
    return "Money must be stored as integer cents.";
  }
  return null;
}

export function amountFromInflowOutflow(
  outflowCents: number,
  inflowCents: number,
): Cents {
  if (inflowCents > 0) return inflowCents as Cents;
  return (-outflowCents) as Cents;
}

export function applyTransactionEdit(
  plan: BudgetPlan,
  transactionId: string,
  input: TransactionEditInput,
): EditResult {
  const existing = plan.transactions.find((t) => t.id === transactionId);
  if (!existing) return { ok: false, error: "Transaction not found." };

  if (!Number.isInteger(input.amountCents)) {
    return { ok: false, error: "Money must be stored as integer cents." };
  }

  const account = plan.accounts.find((a) => a.id === input.accountId);
  if (!account) return { ok: false, error: "Account not found." };

  // Closed accounts cannot receive new or edited normal transactions
  if (isAccountClosed(account) && !existing.isTransfer) {
    return {
      ok: false,
      error:
        "This account is closed. Reopen it before editing normal transactions.",
    };
  }

  if (input.accountId !== existing.accountId) {
    const blocked = assertCanAddTransaction(account);
    if (blocked) return { ok: false, error: blocked };
  }

  const draft: Transaction = {
    ...existing,
    accountId: input.accountId,
    date: input.date,
    payeeName: input.payeeName.trim(),
    categoryId: existing.isTransfer ? null : input.categoryId,
    memo: input.memo?.trim() || undefined,
    amountCents: input.amountCents,
    cleared: input.cleared,
    flag: input.flag?.trim() || undefined,
    splits: existing.isTransfer ? undefined : input.splits,
    updatedAt: new Date().toISOString(),
    // Preserve import metadata
    importId: existing.importId,
    importBatchId: existing.importBatchId,
    source: existing.source,
    createdAt: existing.createdAt,
  };

  if (!draft.payeeName) {
    return { ok: false, error: "Payee is required." };
  }

  if (draft.splits?.length && !validateSplitTotals(draft)) {
    return {
      ok: false,
      error: "Split totals must exactly equal the parent transaction amount.",
    };
  }

  if (existing.isTransfer && existing.transferPairId) {
    return applyTransferEdit(plan, existing, draft, input.transferAccountId);
  }

  if (input.transferAccountId) {
    const converted = convertTransactionToTransfer(
      {
        ...plan,
        transactions: plan.transactions.map((t) =>
          t.id === transactionId ? draft : t,
        ),
      },
      transactionId,
      input.transferAccountId,
    );
    if (!converted.ok) return converted;
    const currentLeg =
      converted.outTransaction.accountId === draft.accountId
        ? converted.outTransaction
        : converted.inTransaction;
    return {
      ok: true,
      plan: converted.plan,
      transaction: currentLeg,
    };
  }

  const withPayee = ensurePayeeOnPlan(plan, draft.payeeName, {
    defaultCategoryId: draft.categoryId,
  });
  const payee = withPayee.payees.find(
    (p) => p.name.toLowerCase() === draft.payeeName.toLowerCase(),
  );
  const saved: Transaction = {
    ...draft,
    payeeId: payee?.id ?? draft.payeeId,
  };

  return {
    ok: true,
    plan: {
      ...withPayee,
      transactions: withPayee.transactions.map((t) =>
        t.id === transactionId ? saved : t,
      ),
    },
    transaction: saved,
  };
}

function applyTransferEdit(
  plan: BudgetPlan,
  existing: Transaction,
  draft: Transaction,
  transferAccountId?: string,
): EditResult {
  const pair = plan.transactions.find((t) => t.id === existing.transferPairId);
  if (!pair) {
    return { ok: false, error: "Linked transfer side is missing." };
  }

  const thisIsOutflow = existing.amountCents < 0;
  const absAmount = Math.abs(draft.amountCents) as Cents;

  const thisAccountId = draft.accountId;
  const otherAccountId = transferAccountId ?? pair.accountId;

  if (thisAccountId === otherAccountId) {
    return { ok: false, error: "Transfer accounts must be different." };
  }

  const thisAccount = plan.accounts.find((a) => a.id === thisAccountId);
  const otherAccount = plan.accounts.find((a) => a.id === otherAccountId);

  if (thisAccountId !== existing.accountId) {
    const blocked = assertCanAddTransaction(thisAccount);
    if (blocked) return { ok: false, error: blocked };
  }
  if (otherAccountId !== pair.accountId) {
    const blocked = assertCanTransferTo(otherAccount);
    if (blocked) return { ok: false, error: blocked };
  }

  const thisAmount = (thisIsOutflow ? -absAmount : absAmount) as Cents;
  const otherAmount = (thisIsOutflow ? absAmount : -absAmount) as Cents;
  const now = new Date().toISOString();

  const updatedThis: Transaction = {
    ...draft,
    accountId: thisAccountId,
    amountCents: thisAmount,
    categoryId: null,
    isTransfer: true,
    transferId: existing.transferId,
    transferPairId: pair.id,
    payeeName: thisIsOutflow
      ? `Transfer to ${otherAccount?.name ?? "account"}`
      : `Transfer from ${otherAccount?.name ?? "account"}`,
    source: "transfer",
    updatedAt: now,
    importId: existing.importId,
    importBatchId: existing.importBatchId,
  };

  const updatedPair: Transaction = {
    ...pair,
    accountId: otherAccountId,
    date: draft.date,
    memo: draft.memo,
    amountCents: otherAmount,
    cleared: draft.cleared,
    flag: draft.flag,
    categoryId: null,
    isTransfer: true,
    transferId: existing.transferId,
    transferPairId: existing.id,
    payeeName: thisIsOutflow
      ? `Transfer from ${thisAccount?.name ?? "account"}`
      : `Transfer to ${thisAccount?.name ?? "account"}`,
    source: "transfer",
    updatedAt: now,
    importId: pair.importId,
    importBatchId: pair.importBatchId,
  };

  return {
    ok: true,
    plan: {
      ...plan,
      transactions: plan.transactions.map((t) => {
        if (t.id === existing.id) return updatedThis;
        if (t.id === pair.id) return updatedPair;
        return t;
      }),
    },
    transaction: updatedThis,
  };
}

export function applyBulkTransactionPatch(
  plan: BudgetPlan,
  ids: string[],
  patch: Partial<
    Pick<
      Transaction,
      "categoryId" | "payeeName" | "cleared" | "accountId" | "memo"
    >
  >,
): EditResult {
  const idSet = new Set(ids);
  if (patch.accountId) {
    const account = plan.accounts.find((a) => a.id === patch.accountId);
    const blocked = assertCanAddTransaction(account);
    if (blocked) return { ok: false, error: blocked };
  }

  const now = new Date().toISOString();
  const transactions = plan.transactions.map((t) => {
    if (!idSet.has(t.id)) return t;
    if (t.isTransfer) {
      if (patch.accountId && patch.accountId !== t.accountId) return t;
      return {
        ...t,
        payeeName: patch.payeeName ?? t.payeeName,
        cleared: patch.cleared ?? t.cleared,
        memo: patch.memo !== undefined ? patch.memo : t.memo,
        updatedAt: now,
      };
    }
    return {
      ...t,
      ...patch,
      updatedAt: now,
    };
  });

  const first = transactions.find((t) => idSet.has(t.id));
  if (!first) return { ok: false, error: "No matching transactions." };

  return {
    ok: true,
    plan: { ...plan, transactions },
    transaction: first,
  };
}

export function applyBulkDelete(
  plan: BudgetPlan,
  ids: string[],
): { ok: true; plan: BudgetPlan } {
  const remove = new Set(ids);
  for (const id of ids) {
    const t = plan.transactions.find((x) => x.id === id);
    if (t?.transferPairId) remove.add(t.transferPairId);
  }
  return {
    ok: true,
    plan: {
      ...plan,
      transactions: plan.transactions.filter((t) => !remove.has(t.id)),
    },
  };
}

export function createTransaction(
  plan: BudgetPlan,
  input: Omit<Transaction, "id" | "approved"> & { approved?: boolean },
): EditResult {
  const account = plan.accounts.find((a) => a.id === input.accountId);
  const blocked = assertCanAddTransaction(account);
  if (blocked) return { ok: false, error: blocked };

  if (!Number.isInteger(input.amountCents)) {
    return { ok: false, error: "Money must be stored as integer cents." };
  }

  const now = new Date().toISOString();
  let nextPlan = plan;
  if (!input.isTransfer) {
    nextPlan = ensurePayeeOnPlan(plan, input.payeeName, {
      defaultCategoryId: input.categoryId,
    });
  }
  const payee = nextPlan.payees.find(
    (p) =>
      p.name.toLowerCase() === input.payeeName.trim().toLowerCase(),
  );

  const txn: Transaction = {
    ...input,
    id: newId("txn"),
    payeeName: input.payeeName.trim(),
    payeeId: input.payeeId ?? payee?.id,
    approved: input.approved ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    source:
      input.source ??
      (input.isTransfer
        ? "transfer"
        : input.importBatchId
          ? "import"
          : "manual"),
  };

  if (txn.splits?.length && !validateSplitTotals(txn)) {
    return {
      ok: false,
      error: "Split totals must exactly equal the parent transaction amount.",
    };
  }

  return {
    ok: true,
    plan: { ...nextPlan, transactions: [txn, ...nextPlan.transactions] },
    transaction: txn,
  };
}

export function inferTransactionSource(t: Transaction): TransactionSource {
  if (t.source) return t.source;
  if (t.isTransfer) return "transfer";
  if (t.importBatchId || t.importId) return "import";
  if (t.payeeName === "Closing adjustment") return "adjustment";
  return "manual";
}
