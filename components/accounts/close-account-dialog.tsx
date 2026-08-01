"use client";

import { useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildClosePreview, isAccountClosed } from "@/lib/accounts/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";

export function CloseAccountDialog({
  accountId,
  open,
  onClose,
  onClosed,
}: {
  accountId: string;
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const closeAccount = useBudgetStore((s) => s.closeAccount);
  const account = plan.accounts.find((a) => a.id === accountId);
  const preview = buildClosePreview(plan, accountId);

  const [strategy, setStrategy] = useState<"transfer" | "adjustment">("transfer");
  const [transferTo, setTransferTo] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !account || !preview || isAccountClosed(account)) return null;

  const destinations = plan.accounts.filter(
    (a) =>
      a.id !== accountId &&
      !a.deletedAt &&
      !isAccountClosed(a) &&
      !a.isHidden,
  );

  const nonZero = preview.workingBalanceCents !== 0;

  function handleClose() {
    setError(null);
    if (!confirmed) {
      setError("Confirm that you want to close this account.");
      return;
    }

    const result = closeAccount(
      nonZero
        ? {
            accountId,
            strategy,
            transferToAccountId:
              strategy === "transfer" ? transferTo || undefined : undefined,
            confirmed: true,
            reason: "user_closed",
          }
        : {
            accountId,
            strategy: "zero",
            confirmed: true,
            reason: "user_closed",
          },
    );

    if (!result.ok) {
      setError(result.error ?? "Could not close account.");
      return;
    }
    onClosed?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-account-title"
    >
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 id="close-account-title" className="text-lg font-semibold">
            Close {account.name}
          </h2>
          <p className="text-xs text-muted mt-1">
            Transaction history will be preserved. The account will be hidden
            and excluded from active selectors.
          </p>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-canvas p-3 text-xs">
            <div>
              <dt className="text-muted">Working balance</dt>
              <dd className="font-semibold">
                <MoneyText cents={preview.workingBalanceCents} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Cleared</dt>
              <dd>
                <MoneyText cents={preview.clearedBalanceCents} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Uncleared</dt>
              <dd>
                <MoneyText cents={preview.unclearedBalanceCents} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Scheduled</dt>
              <dd>{preview.scheduledCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Unreconciled</dt>
              <dd>{preview.unreconciledCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Linked transfers</dt>
              <dd>{preview.linkedTransferCount}</dd>
            </div>
          </dl>

          {nonZero && (
            <div className="space-y-2">
              <p className="text-xs text-danger">
                Balance is not zero. Choose how to handle the remaining balance
                before closing.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="close-strategy"
                  checked={strategy === "transfer"}
                  onChange={() => setStrategy("transfer")}
                  className="mt-1"
                />
                <span>
                  Transfer remaining balance to another account
                  {strategy === "transfer" && (
                    <select
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      className="input mt-2"
                    >
                      <option value="">Select account…</option>
                      {destinations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="close-strategy"
                  checked={strategy === "adjustment"}
                  onChange={() => setStrategy("adjustment")}
                  className="mt-1"
                />
                <span>
                  Create a clearly labeled closing adjustment (zeros the
                  balance)
                </span>
              </label>
            </div>
          )}

          {preview.scheduledCount > 0 && (
            <p className="text-xs text-muted">
              {preview.scheduledCount} scheduled transaction
              {preview.scheduledCount === 1 ? "" : "s"} will be paused for
              review.
            </p>
          )}

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I understand history is preserved, the account will be hidden, and
              new transactions will be disabled after close (
              {formatDisplayDate(new Date().toISOString().slice(0, 10))}).
            </span>
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Close Account
          </button>
        </div>
      </div>
    </div>
  );
}
