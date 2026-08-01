"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBudgetStore } from "@/lib/store/budget-store";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate, toISODate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { ImportWizard } from "@/components/imports/import-wizard";
import { ImportPrompt } from "@/components/imports/import-prompt";
import { getActiveAccounts, isAccountClosed } from "@/lib/accounts/lifecycle";
import { AccountSelect } from "@/components/shared/account-select";
import type { Account, ClearedStatus } from "@/lib/types/budget";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionActions } from "@/components/transactions/transaction-actions";
import { CategorySelect } from "@/components/shared/category-select";
import { PayeeCombobox } from "@/components/shared/payee-combobox";
import { getSelectableCategories } from "@/lib/categories/lifecycle";
import {
  resolveTransferDirection,
} from "@/lib/payees/transfers";
import { suggestCategoryForPayeeSelection } from "@/lib/payees/catalog";
import { SortableHeader } from "@/components/transactions/sort-header";
import { SortMenu } from "@/components/transactions/sort-menu";
import {
  DEFAULT_ALL_TRANSACTIONS_SORT,
  buildSortContext,
  criteriaFromPreset,
  cycleSortCriteria,
  sortTransactions,
  type TransactionSortField,
} from "@/lib/transactions/sort";
import { getSortCriteriaForScope } from "@/lib/transactions/sort-preferences";

export function TransactionsView() {
  const searchParams = useSearchParams();
  const plan = useBudgetStore((s) => s.plan);
  const addTransaction = useBudgetStore((s) => s.addTransaction);
  const addTransfer = useBudgetStore((s) => s.addTransfer);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);
  const bulkEditTransactions = useBudgetStore((s) => s.bulkEditTransactions);
  const bulkDeleteTransactions = useBudgetStore((s) => s.bulkDeleteTransactions);
  const setTransactionSort = useBudgetStore((s) => s.setTransactionSort);
  const resetTransactionSort = useBudgetStore((s) => s.resetTransactionSort);

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
  const [editTxnId, setEditTxnId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const batchFilter = searchParams.get("batch");

  const sortCriteria = useMemo(
    () => getSortCriteriaForScope(plan.preferences, "allTransactions"),
    [plan.preferences],
  );

  const sortCtx = useMemo(
    () => buildSortContext(plan.accounts, plan.categories),
    [plan.accounts, plan.categories],
  );

  const rows = useMemo(() => {
    const filtered = plan.transactions.filter((t) => {
      if (batchFilter && t.importBatchId !== batchFilter) return false;
      if (accountFilter && t.accountId !== accountFilter) return false;
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${t.payeeName} ${t.memo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortTransactions(
      filtered,
      sortCriteria,
      sortCtx,
      DEFAULT_ALL_TRANSACTIONS_SORT,
    );
  }, [
    plan.transactions,
    accountFilter,
    categoryFilter,
    query,
    batchFilter,
    sortCriteria,
    sortCtx,
  ]);

  function persistSort(next: typeof sortCriteria) {
    setTransactionSort("allTransactions", next);
  }

  function onCycleHeader(field: TransactionSortField, shiftKey: boolean) {
    persistSort(
      cycleSortCriteria(sortCriteria, field, {
        shiftKey,
        defaultCriteria: DEFAULT_ALL_TRANSACTIONS_SORT,
      }),
    );
  }

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
          {getSelectableCategories(plan, { includeHidden: true }).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.hidden ? " (hidden)" : ""}
            </option>
          ))}
        </select>
      </div>

      <SortMenu
        criteria={sortCriteria}
        onSelectPreset={(preset) => persistSort(criteriaFromPreset(preset))}
        onClear={() => persistSort([...DEFAULT_ALL_TRANSACTIONS_SORT])}
        onResetDefault={() => {
          resetTransactionSort("allTransactions");
        }}
      />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
          <span className="text-muted">{selected.size} selected</span>
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              const categoryId = e.target.value;
              if (!categoryId) return;
              setBulkError(null);
              const result = bulkEditTransactions(Array.from(selected), {
                categoryId: categoryId === "__none" ? null : categoryId,
              });
              if (!result.ok) setBulkError(result.error ?? "Bulk edit failed");
              e.target.value = "";
            }}
          >
            <option value="">Bulk edit category…</option>
            <option value="__none">None / RTA</option>
            {plan.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
            onClick={() => {
              const payeeName = prompt("New payee name for selected?");
              if (!payeeName?.trim()) return;
              setBulkError(null);
              const result = bulkEditTransactions(Array.from(selected), {
                payeeName: payeeName.trim(),
              });
              if (!result.ok) setBulkError(result.error ?? "Bulk edit failed");
            }}
          >
            Bulk Edit Payee
          </button>
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              const cleared = e.target.value as ClearedStatus | "";
              if (!cleared) return;
              setBulkError(null);
              bulkEditTransactions(Array.from(selected), { cleared });
              e.target.value = "";
            }}
          >
            <option value="">Bulk cleared status…</option>
            <option value="uncleared">Uncleared</option>
            <option value="cleared">Cleared</option>
            <option value="reconciled">Reconciled</option>
          </select>
          <select
            className="input w-auto"
            defaultValue=""
            onChange={(e) => {
              const accountId = e.target.value;
              if (!accountId) return;
              setBulkError(null);
              const result = bulkEditTransactions(Array.from(selected), {
                accountId,
              });
              if (!result.ok) setBulkError(result.error ?? "Bulk move failed");
              e.target.value = "";
            }}
          >
            <option value="">Bulk move account…</option>
            {getActiveAccounts(plan.accounts).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs font-medium text-danger"
            onClick={() => {
              if (!confirm(`Delete ${selected.size} transaction(s)?`)) return;
              bulkDeleteTransactions(Array.from(selected));
              setSelected(new Set());
            }}
          >
            Bulk Delete
          </button>
          {bulkError && <p className="w-full text-xs text-danger">{bulkError}</p>}
        </div>
      )}

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
              accounts={getActiveAccounts(plan.accounts)}
              plan={plan}
              onSubmit={(data) => {
                try {
                  addTransaction(data);
                  setShowForm(false);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Could not add.");
                }
              }}
              onTransfer={(data) => {
                const result = addTransfer(data);
                if (!result.ok) {
                  alert(result.error ?? "Could not transfer.");
                  return;
                }
                setShowForm(false);
              }}
            />
          ) : (
            <AddTransferForm
              accounts={getActiveAccounts(plan.accounts).filter(
                (a) => a.kind !== "tracking",
              )}
              onSubmit={(data) => {
                const result = addTransfer(data);
                if (!result.ok) {
                  alert(result.error ?? "Could not transfer.");
                  return;
                }
                setShowForm(false);
              }}
            />
          )}
        </div>
      )}

      <div className="hidden md:block max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="sticky top-0 z-10 w-10 bg-canvas px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={
                    rows.length > 0 && rows.every((t) => selected.has(t.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(rows.map((t) => t.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </th>
              <SortableHeader
                field="date"
                label="Date"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="account"
                label="Account"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="payee"
                label="Payee"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="category"
                label="Category"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="amount"
                label="Amount"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
                align="right"
              />
              <SortableHeader
                field="cleared"
                label="Cleared"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="createdAt"
                label="Created"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <SortableHeader
                field="updatedAt"
                label="Edited"
                criteria={sortCriteria}
                onCycle={onCycleHeader}
              />
              <th className="sticky top-0 z-10 w-28 bg-canvas px-3 py-2.5" />
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
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      aria-label={`Select ${t.payeeName}`}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDisplayDate(t.date)}
                  </td>
                  <td className="px-3 py-2">{account?.name}</td>
                  <td className="px-3 py-2 font-medium">{t.payeeName}</td>
                  <td className="px-3 py-2 text-muted">{category}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    <MoneyText cents={t.amountCents} signed />
                  </td>
                  <td className="px-3 py-2 capitalize text-muted">
                    {t.cleared}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted text-xs">
                    {t.createdAt
                      ? formatDisplayDate(t.createdAt.slice(0, 10))
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted text-xs">
                    {t.updatedAt
                      ? formatDisplayDate(t.updatedAt.slice(0, 10))
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <TransactionActions
                      onEdit={() => setEditTxnId(t.id)}
                      onDelete={() => {
                        if (confirm("Delete this transaction?")) {
                          deleteTransaction(t.id);
                        }
                      }}
                    />
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
                <label className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(t.id)}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium truncate">
                      {t.payeeName}
                    </span>
                    <span className="block text-xs text-muted">
                      {formatDisplayDate(t.date)} · {account?.name}
                      {t.isTransfer ? " · Transfer" : ""}
                    </span>
                  </span>
                </label>
                <div className="flex flex-col items-end gap-1">
                  <MoneyText
                    cents={t.amountCents}
                    signed
                    className="font-semibold"
                  />
                  <TransactionActions
                    onEdit={() => setEditTxnId(t.id)}
                    onDelete={() => {
                      if (confirm("Delete this transaction?")) {
                        deleteTransaction(t.id);
                      }
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      </div>

      <EditTransactionModal
        transactionId={editTxnId}
        open={Boolean(editTxnId)}
        onClose={() => setEditTxnId(null)}
      />
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
  plan,
  onSubmit,
  onTransfer,
}: {
  accounts: Account[];
  plan: import("@/lib/types/budget").BudgetPlan;
  onSubmit: (data: {
    accountId: string;
    date: string;
    payeeName: string;
    categoryId: string | null;
    amountCents: number;
    cleared: "uncleared";
    isTransfer: false;
  }) => void;
  onTransfer: (data: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: string;
  }) => void;
}) {
  const selectable = accounts.filter((a) => !isAccountClosed(a));
  const [accountId, setAccountId] = useState(selectable[0]?.id ?? "");
  const [payeeName, setPayeeName] = useState("");
  const [transferAccountId, setTransferAccountId] = useState<string | null>(
    null,
  );
  const [categoryId, setCategoryId] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"outflow" | "inflow">("outflow");
  const [date, setDate] = useState(toISODate(new Date()));
  const [error, setError] = useState<string | null>(null);

  const destName = transferAccountId
    ? accounts.find((a) => a.id === transferAccountId)?.name
    : null;

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
        const amountCents = direction === "outflow" ? -parsed : parsed;
        if (transferAccountId) {
          const dir = resolveTransferDirection({
            currentAccountId: accountId,
            destinationAccountId: transferAccountId,
            amountCents,
          });
          onTransfer({ ...dir, date });
          return;
        }
        onSubmit({
          accountId,
          date,
          payeeName: payeeName.trim(),
          categoryId: categoryId || null,
          amountCents,
          cleared: "uncleared",
          isTransfer: false,
        });
      }}
    >
      <AccountSelect
        accounts={accounts}
        value={accountId}
        onChange={(id) => {
          setAccountId(id);
          if (transferAccountId === id) setTransferAccountId(null);
        }}
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input"
      />
      <PayeeCombobox
        value={payeeName}
        currentAccountId={accountId}
        onChange={(next) => {
          setPayeeName(next.payeeName);
          if (next.mode === "transfer") {
            setTransferAccountId(next.transferAccountId);
            setCategoryId("");
            return;
          }
          setTransferAccountId(null);
          const suggested = suggestCategoryForPayeeSelection({
            currentCategoryId: categoryId || null,
            categoryTouched,
            suggestedCategoryId: next.suggestedCategoryId,
          });
          if (suggested) setCategoryId(suggested);
        }}
      />
      {transferAccountId ? (
        <div className="input flex items-center text-sm text-muted">
          Transfer · {destName ?? "account"}
        </div>
      ) : (
        <CategorySelect
          plan={plan}
          value={categoryId}
          onChange={(id) => {
            setCategoryTouched(true);
            setCategoryId(id);
          }}
        />
      )}
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
        {transferAccountId ? "Save transfer" : "Save transaction"}
      </button>
    </form>
  );
}

function AddTransferForm({
  accounts,
  onSubmit,
}: {
  accounts: Account[];
  onSubmit: (data: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: string;
    memo?: string;
  }) => void;
}) {
  const selectable = accounts.filter((a) => !isAccountClosed(a));
  const [fromAccountId, setFrom] = useState(selectable[0]?.id ?? "");
  const [toAccountId, setTo] = useState(
    selectable[1]?.id ?? selectable[0]?.id ?? "",
  );
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
      <AccountSelect
        accounts={accounts}
        value={fromAccountId}
        onChange={setFrom}
      />
      <AccountSelect
        accounts={accounts}
        value={toAccountId}
        onChange={setTo}
      />
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
