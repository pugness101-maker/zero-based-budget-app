"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  getAccountBalance,
  getRunningBalances,
} from "@/lib/calculations/account-balances";
import { MoneyText } from "@/components/shared/money-text";
import { DisabledAction } from "@/components/shared/disabled-action";
import { formatDisplayDate, toISODate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";

export function AccountRegister({ accountId }: { accountId: string }) {
  const plan = useBudgetStore((s) => s.plan);
  const addTransaction = useBudgetStore((s) => s.addTransaction);
  const setCleared = useBudgetStore((s) => s.setCleared);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);

  const account = plan.accounts.find((a) => a.id === accountId);
  const [showForm, setShowForm] = useState(false);

  const txns = useMemo(
    () =>
      plan.transactions
        .filter((t) => t.accountId === accountId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [plan.transactions, accountId],
  );

  const running = useMemo(() => {
    if (!account) return new Map<string, number>();
    return new Map(
      getRunningBalances(account, plan.transactions).map((r) => [
        r.transactionId,
        r.runningBalanceCents,
      ]),
    );
  }, [account, plan.transactions]);

  if (!account) {
    return (
      <div className="p-6">
        <p className="text-muted">Account not found.</p>
        <Link href="/accounts" className="text-accent text-sm underline">
          Back to accounts
        </Link>
      </div>
    );
  }

  const balance = getAccountBalance(account, plan.transactions);

  return (
    <div className="px-4 py-4 md:px-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Accounts
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {account.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Working balance{" "}
            <MoneyText cents={balance.balanceCents} className="font-semibold text-ink" />
            {" · "}
            Cleared{" "}
            <MoneyText cents={balance.clearedBalanceCents} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Add transaction
          </button>
          <DisabledAction
            label="Reconcile"
            reason="Reconciliation workflow ships in a later Phase 1 increment."
          />
        </div>
      </div>

      {showForm && (
        <TransactionForm
          accountId={accountId}
          categories={plan.categories}
          onCancel={() => setShowForm(false)}
          onSubmit={(data) => {
            addTransaction(data);
            setShowForm(false);
          }}
        />
      )}

      {/* Desktop */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2.5 w-10">✓</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Payee</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5 text-right">Outflow</th>
              <th className="px-3 py-2.5 text-right">Inflow</th>
              <th className="px-3 py-2.5 text-right">Balance</th>
              <th className="px-3 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => {
              const categoryName = t.isTransfer
                ? "Transfer"
                : plan.categories.find((c) => c.id === t.categoryId)?.name ??
                  (t.amountCents > 0 ? "Ready to Assign" : "—");
              return (
                <tr key={t.id} className="border-t border-border/70">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label={
                        t.cleared === "uncleared"
                          ? "Mark cleared"
                          : "Mark uncleared"
                      }
                      onClick={() =>
                        setCleared(
                          t.id,
                          t.cleared === "uncleared" ? "cleared" : "uncleared",
                        )
                      }
                      className="text-muted hover:text-accent"
                    >
                      {t.cleared === "uncleared" ? (
                        <Circle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDisplayDate(t.date)}
                  </td>
                  <td className="px-3 py-2 font-medium">{t.payeeName}</td>
                  <td className="px-3 py-2 text-muted">{categoryName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.amountCents < 0 ? (
                      <MoneyText cents={Math.abs(t.amountCents)} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.amountCents > 0 ? (
                      <MoneyText cents={t.amountCents} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    <MoneyText cents={running.get(t.id) ?? 0} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteTransaction(t.id)}
                      className="text-xs text-muted hover:text-danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="md:hidden divide-y divide-border rounded-xl border border-border bg-surface">
        {txns.map((t) => (
          <li key={t.id} className="px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{t.payeeName}</p>
                <p className="text-xs text-muted">
                  {formatDisplayDate(t.date)}
                  {t.isTransfer ? " · Transfer" : ""}
                </p>
              </div>
              <MoneyText cents={t.amountCents} signed className="font-semibold" />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setCleared(
                    t.id,
                    t.cleared === "uncleared" ? "cleared" : "uncleared",
                  )
                }
                className={cn(
                  "text-xs font-medium",
                  t.cleared === "uncleared" ? "text-muted" : "text-success",
                )}
              >
                {t.cleared === "uncleared" ? "Uncleared" : "Cleared"}
              </button>
              <button
                type="button"
                onClick={() => deleteTransaction(t.id)}
                className="text-xs text-muted hover:text-danger"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransactionForm({
  accountId,
  categories,
  onCancel,
  onSubmit,
}: {
  accountId: string;
  categories: { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (data: {
    accountId: string;
    date: string;
    payeeName: string;
    categoryId: string | null;
    memo?: string;
    amountCents: number;
    cleared: "uncleared";
    isTransfer: false;
  }) => void;
}) {
  const [payeeName, setPayeeName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = useState(toISODate(new Date()));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="rounded-xl border border-border bg-surface p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMoneyInput(amount);
        if (!payeeName.trim()) {
          setError("Payee is required.");
          return;
        }
        if (parsed === null || parsed <= 0) {
          setError("Enter a valid amount.");
          return;
        }
        onSubmit({
          accountId,
          date,
          payeeName: payeeName.trim(),
          categoryId: categoryId || null,
          memo: memo.trim() || undefined,
          amountCents: direction === "outflow" ? -parsed : parsed,
          cleared: "uncleared",
          isTransfer: false,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            required
          />
        </Field>
        <Field label="Payee">
          <input
            value={payeeName}
            onChange={(e) => setPayeeName(e.target.value)}
            className="input"
            required
          />
        </Field>
        <Field label="Category">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">Ready to Assign / none</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            value={direction}
            onChange={(e) =>
              setDirection(e.target.value as "outflow" | "inflow")
            }
            className="input"
          >
            <option value="outflow">Outflow</option>
            <option value="inflow">Inflow</option>
          </select>
        </Field>
        <Field label="Amount">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="Memo">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input"
          />
        </Field>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
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
