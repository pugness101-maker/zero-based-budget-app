"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import {
  accountLastTransactionDate,
  accountTransactionCount,
  canPermanentlyDelete,
  isAccountClosed,
  isAccountHidden,
} from "@/lib/accounts/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";

export function AccountsSettings() {
  const plan = useBudgetStore((s) => s.plan);
  const showHidden = Boolean(plan.preferences.showHiddenAccounts);
  const setShowHiddenAccounts = useBudgetStore((s) => s.setShowHiddenAccounts);
  const unhideAccount = useBudgetStore((s) => s.unhideAccount);
  const reopenAccount = useBudgetStore((s) => s.reopenAccount);
  const deleteAccount = useBudgetStore((s) => s.deleteAccount);
  const bulkHideAccounts = useBudgetStore((s) => s.bulkHideAccounts);
  const bulkCloseAccounts = useBudgetStore((s) => s.bulkCloseAccounts);
  const bulkReopenAccounts = useBudgetStore((s) => s.bulkReopenAccounts);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);

  const hidden = plan.accounts.filter(
    (a) => !a.deletedAt && isAccountHidden(a),
  );
  const closed = plan.accounts.filter(
    (a) => !a.deletedAt && isAccountClosed(a),
  );
  const imported = useMemo(
    () =>
      plan.accounts.filter(
        (a) => !a.deletedAt && a.importedSource === "ynab",
      ),
    [plan.accounts],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllImported() {
    if (selected.size === imported.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(imported.map((a) => a.id)));
  }

  const selectedIds = Array.from(selected);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Accounts</h2>
        <p className="mt-1 text-sm text-muted">
          Hide clutter without losing history, or close accounts you no longer
          use. Delete is only available for empty accounts with no history.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Show hidden accounts</span>
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => setShowHiddenAccounts(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Hidden Accounts
        </h3>
        {hidden.length === 0 ? (
          <p className="text-sm text-muted">No hidden accounts.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {hidden.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <Link href={`/accounts/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <button
                  type="button"
                  onClick={() => unhideAccount(a.id)}
                  className="text-xs text-accent hover:underline"
                >
                  Unhide
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Closed Accounts
        </h3>
        {closed.length === 0 ? (
          <p className="text-sm text-muted">No closed accounts.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {closed.map((a) => {
              const bal = getAccountBalance(a, plan.transactions).balanceCents;
              const canDelete = canPermanentlyDelete(plan, a.id);
              return (
                <li key={a.id} className="px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {a.type.replaceAll("_", " ")} · Final{" "}
                        <MoneyText cents={bal} />
                        {a.closedAt
                          ? ` · Closed ${formatDisplayDate(a.closedAt.slice(0, 10))}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => reopenAccount(a.id, false)}
                        className="text-xs text-accent hover:underline"
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        disabled={!canDelete}
                        title={
                          canDelete
                            ? "Permanently delete"
                            : "Close preserves history — delete only when empty"
                        }
                        onClick={() => {
                          if (!confirm("Permanently delete this account?")) return;
                          deleteAccount(a.id);
                        }}
                        className="text-xs text-muted hover:text-danger disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {imported.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Imported YNAB accounts
          </h3>
          <p className="text-xs text-muted">
            Bulk hide, close (zero balance only), or reopen imported accounts.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllImported}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
            >
              {selected.size === imported.length ? "Clear selection" : "Select all"}
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                bulkHideAccounts(selectedIds);
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Hide
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                if (
                  !confirm(
                    "Close selected accounts with zero balance? Non-zero accounts must be closed individually.",
                  )
                ) {
                  return;
                }
                const result = bulkCloseAccounts(selectedIds);
                if (!result.ok) setBulkError(result.error ?? "Bulk close failed.");
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Close
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                bulkReopenAccounts(selectedIds, false);
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Reopen
            </button>
          </div>
          {bulkError && <p className="text-xs text-danger">{bulkError}</p>}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {imported.map((a) => {
              const bal = getAccountBalance(a, plan.transactions).balanceCents;
              const count = accountTransactionCount(plan.transactions, a.id);
              const last = accountLastTransactionDate(plan.transactions, a.id);
              return (
                <li key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="mt-1"
                    aria-label={`Select ${a.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      <MoneyText cents={bal} className="font-medium" />
                    </div>
                    <p className="text-xs text-muted">
                      Source: {a.importedSource} · {count} txn
                      {last ? ` · Last ${formatDisplayDate(last)}` : ""}
                      {isAccountClosed(a)
                        ? " · Closed"
                        : a.isHidden
                          ? " · Hidden"
                          : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
