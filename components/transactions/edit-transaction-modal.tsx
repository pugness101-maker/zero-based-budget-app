"use client";

import { useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getActiveAccounts, isAccountClosed } from "@/lib/accounts/lifecycle";
import {
  amountFromInflowOutflow,
  validateInflowOutflowExclusive,
} from "@/lib/transactions/edit";
import { parseMoneyInput, centsToDollarString } from "@/lib/money";
import type { ClearedStatus, Transaction, TransactionSplit } from "@/lib/types/budget";
import { TransactionDetailsPanel } from "@/components/transactions/transaction-details";

function newSplitId() {
  return `split-${crypto.randomUUID().slice(0, 8)}`;
}

export function EditTransactionModal({
  transactionId,
  open,
  onClose,
}: {
  transactionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const txn = plan.transactions.find((t) => t.id === transactionId);
  if (!open || !transactionId || !txn) return null;
  return (
    <EditTransactionForm key={transactionId} txn={txn} onClose={onClose} />
  );
}

function EditTransactionForm({
  txn,
  onClose,
}: {
  txn: Transaction;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const editTransaction = useBudgetStore((s) => s.editTransaction);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);

  const pair = txn.transferPairId
    ? plan.transactions.find((t) => t.id === txn.transferPairId)
    : undefined;

  const [accountId, setAccountId] = useState(txn.accountId);
  const [date, setDate] = useState(txn.date);
  const [payeeName, setPayeeName] = useState(txn.payeeName);
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? "");
  const [memo, setMemo] = useState(txn.memo ?? "");
  const [outflow, setOutflow] = useState(
    txn.amountCents < 0 ? centsToDollarString(Math.abs(txn.amountCents)) : "",
  );
  const [inflow, setInflow] = useState(
    txn.amountCents > 0 ? centsToDollarString(txn.amountCents) : "",
  );
  const [cleared, setCleared] = useState<ClearedStatus>(txn.cleared);
  const [flag, setFlag] = useState(txn.flag ?? "");
  const [transferAccountId, setTransferAccountId] = useState(
    pair?.accountId ?? "",
  );
  const [splits, setSplits] = useState<TransactionSplit[]>(
    txn.splits?.length
      ? txn.splits.map((s) => ({ ...s }))
      : [],
  );
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = getActiveAccounts(plan.accounts, {
    includeHidden: true,
    includeClosed: true,
  });

  function save() {
    setError(null);
    const outCents = outflow.trim() ? parseMoneyInput(outflow) : 0;
    const inCents = inflow.trim() ? parseMoneyInput(inflow) : 0;
    if (outCents === null || inCents === null) {
      setError("Enter valid money amounts.");
      return;
    }
    const exclusive = validateInflowOutflowExclusive(outCents, inCents);
    if (exclusive) {
      setError(exclusive);
      return;
    }
    if (outCents === 0 && inCents === 0) {
      setError("Enter an outflow or inflow amount.");
      return;
    }

    const amountCents = amountFromInflowOutflow(outCents, inCents);
    const result = editTransaction(txn.id, {
      accountId,
      date,
      payeeName,
      categoryId: categoryId || null,
      memo: memo || undefined,
      amountCents,
      cleared,
      flag: flag || undefined,
      splits: splits.length ? splits : undefined,
      transferAccountId: txn.isTransfer ? transferAccountId : undefined,
    });
    if (!result.ok) {
      setError(result.error ?? "Could not save.");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-txn-title"
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-surface shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h2 id="edit-txn-title" className="text-lg font-semibold">
            Edit Transaction
          </h2>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
        </div>

        <div className="p-4 space-y-3">
          {showDetails && (
            <TransactionDetailsPanel transactionId={txn.id} />
          )}

          <Field label="Account">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input"
              disabled={txn.isTransfer}
            >
              {accounts.map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={
                    isAccountClosed(a) && a.id !== txn.accountId
                  }
                >
                  {a.name}
                  {isAccountClosed(a) ? " (closed)" : ""}
                </option>
              ))}
            </select>
          </Field>

          {txn.isTransfer && (
            <Field label="Transfer other account">
              <select
                value={transferAccountId}
                onChange={(e) => setTransferAccountId(e.target.value)}
                className="input"
              >
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option
                      key={a.id}
                      value={a.id}
                      disabled={isAccountClosed(a) && a.id !== pair?.accountId}
                    >
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Cleared">
              <select
                value={cleared}
                onChange={(e) => setCleared(e.target.value as ClearedStatus)}
                className="input"
              >
                <option value="uncleared">Uncleared</option>
                <option value="cleared">Cleared</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </Field>
          </div>

          <Field label="Payee">
            <input
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              className="input"
              disabled={txn.isTransfer}
            />
          </Field>

          {!txn.isTransfer && (
            <Field label="Category">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input"
                disabled={splits.length > 0}
              >
                <option value="">Ready to Assign / none</option>
                {plan.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Outflow">
              <input
                value={outflow}
                onChange={(e) => {
                  setOutflow(e.target.value);
                  if (e.target.value.trim()) setInflow("");
                }}
                className="input"
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
            <Field label="Inflow">
              <input
                value={inflow}
                onChange={(e) => {
                  setInflow(e.target.value);
                  if (e.target.value.trim()) setOutflow("");
                }}
                className="input"
                inputMode="decimal"
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Memo">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Flag">
            <input
              value={flag}
              onChange={(e) => setFlag(e.target.value)}
              className="input"
              placeholder="Optional"
            />
          </Field>

          {!txn.isTransfer && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Splits
                </p>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() =>
                    setSplits((prev) => [
                      ...prev,
                      {
                        id: newSplitId(),
                        categoryId: null,
                        amountCents: 0,
                      },
                    ])
                  }
                >
                  Add split
                </button>
              </div>
              {splits.map((s, idx) => (
                <div key={s.id} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                  <select
                    value={s.categoryId ?? ""}
                    onChange={(e) =>
                      setSplits((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, categoryId: e.target.value || null }
                            : x,
                        ),
                      )
                    }
                    className="input"
                  >
                    <option value="">Category</option>
                    {plan.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={
                      s.amountCents
                        ? centsToDollarString(Math.abs(s.amountCents))
                        : ""
                    }
                    onChange={(e) => {
                      const parsed = parseMoneyInput(e.target.value);
                      setSplits((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                amountCents:
                                  parsed === null
                                    ? 0
                                    : ((txn.amountCents < 0 ? -parsed : parsed) as typeof x.amountCents),
                              }
                            : x,
                        ),
                      );
                    }}
                    placeholder="Amount"
                  />
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-danger"
                    onClick={() =>
                      setSplits((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-muted">
                Split totals must exactly equal the parent amount. Scheduled /
                repeating settings ship with the next scheduling increment.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex flex-wrap justify-between gap-2 border-t border-border bg-surface px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Delete this transaction?")) return;
              deleteTransaction(txn.id);
              onClose();
            }}
            className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
