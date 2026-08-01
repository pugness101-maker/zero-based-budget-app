"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBudgetStore } from "@/lib/store/budget-store";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate, toISODate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { ImportWizard } from "@/components/imports/import-wizard";
import { ImportPrompt } from "@/components/imports/import-prompt";

export function TransactionsView() {
  const searchParams = useSearchParams();
  const plan = useBudgetStore((s) => s.plan);
  const addTransaction = useBudgetStore((s) => s.addTransaction);
  const addTransfer = useBudgetStore((s) => s.addTransfer);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);

  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(
    () => searchParams.get("new") === "1",
  );
  const [mode, setMode] = useState<"transaction" | "transfer">("transaction");
  const [wizardOpen, setWizardOpen] = useState(
    () => searchParams.get("import") === "1",
  );
  const batchFilter = searchParams.get("batch");

  const rows = useMemo(() => {
    return [...plan.transactions]
      .filter((t) => {
        if (batchFilter && t.importBatchId !== batchFilter) return false;
        if (accountFilter && t.accountId !== accountFilter) return false;
        if (categoryFilter && t.categoryId !== categoryFilter) return false;
        if (query) {
          const q = query.toLowerCase();
          const hay = `${t.payeeName} ${t.memo ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [
    plan.transactions,
    accountFilter,
    categoryFilter,
    query,
    batchFilter,
  ]);

  return (
    <div className="space-y-4">
      <ImportPrompt onImport={() => setWizardOpen(true)} />

      <div className="px-4 md:px-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            All Transactions
          </h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} matching · transfers excluded from spending reports
            {batchFilter ? " · filtered to import batch" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Import Data
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {showForm ? "Close form" : "Add"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search payee or memo"
          className="input"
        />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="input"
        >
          <option value="">All accounts</option>
          {plan.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input"
        >
          <option value="">All categories</option>
          {plan.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="flex gap-2">
            <ModeButton
              active={mode === "transaction"}
              onClick={() => setMode("transaction")}
            >
              Transaction
            </ModeButton>
            <ModeButton
              active={mode === "transfer"}
              onClick={() => setMode("transfer")}
            >
              Transfer
            </ModeButton>
          </div>

          {mode === "transaction" ? (
            <AddTxnForm
              accounts={plan.accounts}
              categories={plan.categories}
              onSubmit={(data) => {
                addTransaction(data);
                setShowForm(false);
              }}
            />
          ) : (
            <AddTransferForm
              accounts={plan.accounts.filter((a) => a.kind !== "tracking")}
              onSubmit={(data) => {
                addTransfer(data);
                setShowForm(false);
              }}
            />
          )}
        </div>
      )}

      <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Account</th>
              <th className="px-3 py-2.5">Payee</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const account = plan.accounts.find((a) => a.id === t.accountId);
              const category = t.isTransfer
                ? "Transfer"
                : plan.categories.find((c) => c.id === t.categoryId)?.name ??
                  (t.amountCents > 0 ? "Ready to Assign" : "—");
              return (
                <tr key={t.id} className="border-t border-border/70">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDisplayDate(t.date)}
                  </td>
                  <td className="px-3 py-2">{account?.name}</td>
                  <td className="px-3 py-2 font-medium">{t.payeeName}</td>
                  <td className="px-3 py-2 text-muted">{category}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    <MoneyText cents={t.amountCents} signed />
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

      <ul className="md:hidden divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((t) => {
          const account = plan.accounts.find((a) => a.id === t.accountId);
          return (
            <li key={t.id} className="px-3 py-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{t.payeeName}</p>
                  <p className="text-xs text-muted">
                    {formatDisplayDate(t.date)} · {account?.name}
                    {t.isTransfer ? " · Transfer" : ""}
                  </p>
                </div>
                <MoneyText cents={t.amountCents} signed className="font-semibold" />
              </div>
            </li>
          );
        })}
      </ul>
      </div>

      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-accent-muted px-3 py-1.5 text-sm font-medium text-accent"
          : "rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-black/5"
      }
    >
      {children}
    </button>
  );
}

function AddTxnForm({
  accounts,
  categories,
  onSubmit,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSubmit: (data: {
    accountId: string;
    date: string;
    payeeName: string;
    categoryId: string | null;
    amountCents: number;
    cleared: "uncleared";
    isTransfer: false;
  }) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [payeeName, setPayeeName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = useState(toISODate(new Date()));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMoneyInput(amount);
        if (!payeeName.trim() || parsed === null || parsed <= 0) {
          setError("Payee and a valid amount are required.");
          return;
        }
        onSubmit({
          accountId,
          date,
          payeeName: payeeName.trim(),
          categoryId: categoryId || null,
          amountCents: direction === "outflow" ? -parsed : parsed,
          cleared: "uncleared",
          isTransfer: false,
        });
      }}
    >
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="input"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input"
      />
      <input
        value={payeeName}
        onChange={(e) => setPayeeName(e.target.value)}
        placeholder="Payee"
        className="input"
      />
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
      <select
        value={direction}
        onChange={(e) => setDirection(e.target.value as "outflow" | "inflow")}
        className="input"
      >
        <option value="outflow">Outflow</option>
        <option value="inflow">Inflow</option>
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        className="input"
        inputMode="decimal"
      />
      {error && (
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-danger">{error}</p>
      )}
      <button
        type="submit"
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover sm:col-span-2 lg:col-span-3 w-fit"
      >
        Save transaction
      </button>
    </form>
  );
}

function AddTransferForm({
  accounts,
  onSubmit,
}: {
  accounts: { id: string; name: string }[];
  onSubmit: (data: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: string;
    memo?: string;
  }) => void;
}) {
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setTo] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMoneyInput(amount);
        if (fromAccountId === toAccountId) {
          setError("Choose two different accounts.");
          return;
        }
        if (parsed === null || parsed <= 0) {
          setError("Enter a valid amount.");
          return;
        }
        onSubmit({
          fromAccountId,
          toAccountId,
          amountCents: parsed,
          date,
        });
      }}
    >
      <select
        value={fromAccountId}
        onChange={(e) => setFrom(e.target.value)}
        className="input"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            From: {a.name}
          </option>
        ))}
      </select>
      <select
        value={toAccountId}
        onChange={(e) => setTo(e.target.value)}
        className="input"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            To: {a.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input"
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        className="input"
        inputMode="decimal"
      />
      {error && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm text-danger">{error}</p>
      )}
      <button
        type="submit"
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover w-fit"
      >
        Save transfer
      </button>
    </form>
  );
}
