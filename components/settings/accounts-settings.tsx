"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import {
  accountLastTransactionDate,
  accountTransactionCount,
  isAccountClosed,
  isAccountHidden,
} from "@/lib/accounts/lifecycle";
import {
  DEFAULT_DELETED_ACCOUNT_RETENTION_DAYS,
  getRecentlyDeletedAccounts,
  isPastRetention,
} from "@/lib/accounts/deletion";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";

export function AccountsSettings() {
  const plan = useBudgetStore((s) => s.plan);
  const showHidden = Boolean(plan.preferences.showHiddenAccounts);
  const setShowHiddenAccounts = useBudgetStore((s) => s.setShowHiddenAccounts);
  const unhideAccount = useBudgetStore((s) => s.unhideAccount);
  const reopenAccount = useBudgetStore((s) => s.reopenAccount);
  const bulkHideAccounts = useBudgetStore((s) => s.bulkHideAccounts);
  const bulkCloseAccounts = useBudgetStore((s) => s.bulkCloseAccounts);
  const bulkReopenAccounts = useBudgetStore((s) => s.bulkReopenAccounts);
  const bulkDeleteClosedAccounts = useBudgetStore(
    (s) => s.bulkDeleteClosedAccounts,
  );
  const restoreDeletedAccount = useBudgetStore((s) => s.restoreDeletedAccount);
  const purgeDeletedAccount = useBudgetStore((s) => s.purgeDeletedAccount);
  const setDeletedAccountRetentionDays = useBudgetStore(
    (s) => s.setDeletedAccountRetentionDays,
  );

  const [selectedImported, setSelectedImported] = useState<Set<string>>(
    new Set(),
  );
  const [selectedClosed, setSelectedClosed] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [bulkReview, setBulkReview] = useState<{
    mode: "soft_delete" | "empty_purge" | "move_then_delete";
    destinationId?: string;
  } | null>(null);
  const [moveDest, setMoveDest] = useState("");

  const retention =
    plan.preferences.deletedAccountRetentionDays ??
    DEFAULT_DELETED_ACCOUNT_RETENTION_DAYS;

  const hidden = plan.accounts.filter(
    (a) => !a.deletedAt && isAccountHidden(a),
  );
  const closed = plan.accounts.filter(
    (a) => !a.deletedAt && isAccountClosed(a),
  );
  const recentlyDeleted = getRecentlyDeletedAccounts(plan);
  const imported = useMemo(
    () =>
      plan.accounts.filter(
        (a) => !a.deletedAt && a.importedSource === "ynab",
      ),
    [plan.accounts],
  );

  const openDestinations = plan.accounts.filter(
    (a) => !a.deletedAt && !isAccountClosed(a),
  );

  function toggleClosed(id: string) {
    setSelectedClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleImported(id: string) {
    setSelectedImported((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const closedIds = Array.from(selectedClosed);
  const importedIds = Array.from(selectedImported);

  function runBulk() {
    if (!bulkReview) return;
    setBulkError(null);
    const result = bulkDeleteClosedAccounts(closedIds, {
      mode: bulkReview.mode,
      destinationAccountId: bulkReview.destinationId,
      allowBulkHistoryDelete: false,
      secondConfirm: true,
      goalDisposition: { type: "archive" },
      balanceResolution: { type: "adjustment" },
    });
    if (!result.ok) {
      setBulkError(result.error ?? "Bulk delete failed.");
      return;
    }
    setBulkReview(null);
    setSelectedClosed(new Set());
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Accounts</h2>
        <p className="mt-1 text-sm text-muted">
          Hide clutter without losing history, close accounts you no longer use,
          or delete closed accounts with a guided safety workflow.
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
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedClosed(
                    selectedClosed.size === closed.length
                      ? new Set()
                      : new Set(closed.map((a) => a.id)),
                  )
                }
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
              >
                {selectedClosed.size === closed.length
                  ? "Clear selection"
                  : "Select all"}
              </button>
              <button
                type="button"
                disabled={closedIds.length === 0}
                onClick={() => setBulkReview({ mode: "soft_delete" })}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Soft-delete selected
              </button>
              <button
                type="button"
                disabled={closedIds.length === 0}
                onClick={() => setBulkReview({ mode: "empty_purge" })}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Permanently delete empty
              </button>
              <button
                type="button"
                disabled={closedIds.length === 0}
                onClick={() =>
                  setBulkReview({ mode: "move_then_delete", destinationId: "" })
                }
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Move history…
              </button>
            </div>
            {bulkError && <p className="text-xs text-danger">{bulkError}</p>}
            {bulkReview && (
              <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Review bulk action ({bulkReview.mode})
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1">Account</th>
                      <th>Balance</th>
                      <th>Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closed
                      .filter((a) => selectedClosed.has(a.id))
                      .map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="py-1 font-medium">{a.name}</td>
                          <td>
                            <MoneyText
                              cents={
                                getAccountBalance(a, plan.transactions)
                                  .balanceCents
                              }
                            />
                          </td>
                          <td>
                            {accountTransactionCount(plan.transactions, a.id)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {bulkReview.mode === "move_then_delete" && (
                  <select
                    value={moveDest}
                    onChange={(e) => {
                      setMoveDest(e.target.value);
                      setBulkReview({
                        mode: "move_then_delete",
                        destinationId: e.target.value,
                      });
                    }}
                    className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                  >
                    <option value="">Destination account…</option>
                    {openDestinations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkReview(null)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      bulkReview.mode === "move_then_delete" && !moveDest
                    }
                    onClick={runBulk}
                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {closed.map((a) => {
                const bal = getAccountBalance(a, plan.transactions).balanceCents;
                return (
                  <li key={a.id} className="px-3 py-2 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedClosed.has(a.id)}
                          onChange={() => toggleClosed(a.id)}
                          className="mt-1"
                          aria-label={`Select ${a.name}`}
                        />
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
                          onClick={() => setDeleteAccountId(a.id)}
                          className="text-xs text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Recently Deleted
        </h3>
        <label className="flex items-center gap-2 text-xs text-muted">
          Recovery period (days)
          <input
            type="number"
            min={1}
            max={365}
            value={retention}
            onChange={(e) =>
              setDeletedAccountRetentionDays(Number(e.target.value) || 30)
            }
            className="w-16 rounded-md border border-border px-2 py-1"
          />
        </label>
        {recentlyDeleted.length === 0 ? (
          <p className="text-sm text-muted">No recently deleted accounts.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {recentlyDeleted.map((a) => {
              const preserved =
                a.deletionMethod === "soft_delete"
                  ? (a.deletedTransactionCount ??
                    accountTransactionCount(plan.transactions, a.id))
                  : 0;
              const past = isPastRetention(a, retention);
              return (
                <li key={a.id} className="px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted">
                        Deleted{" "}
                        {a.deletedAt
                          ? formatDisplayDate(a.deletedAt.slice(0, 10))
                          : "—"}{" "}
                        · {a.deletionMethod ?? "soft_delete"} ·{" "}
                        {a.deletionMethod === "soft_delete"
                          ? `${preserved} txn preserved`
                          : "history removed"}
                        {past ? " · Past retention" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.deletionMethod === "soft_delete" && (
                        <button
                          type="button"
                          onClick={() => restoreDeletedAccount(a.id)}
                          className="text-xs text-accent hover:underline"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const name = prompt(
                            `Type “${a.name}” to permanently purge:`,
                          );
                          if (name == null) return;
                          if (
                            !confirm(
                              "Permanently purge? This cannot be undone.",
                            )
                          ) {
                            return;
                          }
                          const result = purgeDeletedAccount(a.id, {
                            confirmedName: name,
                            secondConfirm: true,
                          });
                          if (!result.ok) {
                            setBulkError(result.error ?? "Purge failed.");
                          }
                        }}
                        className="text-xs text-danger hover:underline"
                      >
                        Permanently purge
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
              onClick={() =>
                setSelectedImported(
                  selectedImported.size === imported.length
                    ? new Set()
                    : new Set(imported.map((a) => a.id)),
                )
              }
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
            >
              {selectedImported.size === imported.length
                ? "Clear selection"
                : "Select all"}
            </button>
            <button
              type="button"
              disabled={importedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                bulkHideAccounts(importedIds);
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Hide
            </button>
            <button
              type="button"
              disabled={importedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                if (
                  !confirm(
                    "Close selected accounts with zero balance? Non-zero accounts must be closed individually.",
                  )
                ) {
                  return;
                }
                const result = bulkCloseAccounts(importedIds);
                if (!result.ok) setBulkError(result.error ?? "Bulk close failed.");
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Close
            </button>
            <button
              type="button"
              disabled={importedIds.length === 0}
              onClick={() => {
                setBulkError(null);
                bulkReopenAccounts(importedIds, false);
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40"
            >
              Bulk Reopen
            </button>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {imported.map((a) => {
              const bal = getAccountBalance(a, plan.transactions).balanceCents;
              const count = accountTransactionCount(plan.transactions, a.id);
              const last = accountLastTransactionDate(plan.transactions, a.id);
              return (
                <li key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedImported.has(a.id)}
                    onChange={() => toggleImported(a.id)}
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

      {deleteAccountId && (
        <DeleteAccountDialog
          accountId={deleteAccountId}
          open
          onClose={() => setDeleteAccountId(null)}
        />
      )}
    </section>
  );
}
