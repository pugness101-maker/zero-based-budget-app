"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildAccountDeletePreview,
  type AccountDeleteMode,
  type BalanceResolution,
  type GoalDisposition,
  type TransferOrphanHandling,
} from "@/lib/accounts/deletion";
import { isAccountClosed } from "@/lib/accounts/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";

export function DeleteAccountDialog({
  accountId,
  open,
  onClose,
  onDeleted,
}: {
  accountId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const deleteAccountWithStrategy = useBudgetStore(
    (s) => s.deleteAccountWithStrategy,
  );

  const preview = useMemo(
    () => buildAccountDeletePreview(plan, accountId),
    [plan, accountId],
  );

  const destinations = useMemo(
    () =>
      plan.accounts.filter(
        (a) =>
          a.id !== accountId &&
          !a.deletedAt &&
          !isAccountClosed(a),
      ),
    [plan.accounts, accountId],
  );

  const [mode, setMode] = useState<AccountDeleteMode | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [secondConfirm, setSecondConfirm] = useState(false);
  const [balanceAction, setBalanceAction] = useState<
    "transfer" | "adjustment" | ""
  >("");
  const [balanceDest, setBalanceDest] = useState("");
  const [goalAction, setGoalAction] = useState<
    "delete" | "reassign" | "archive" | ""
  >("");
  const [goalDest, setGoalDest] = useState("");
  const [orphanHandling, setOrphanHandling] =
    useState<TransferOrphanHandling>("convert_to_adjustment");
  const [confirmIncompatible, setConfirmIncompatible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !preview) return null;

  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const needsBalance = preview.finalBalanceCents !== 0;
  const needsGoals =
    preview.goalCount > 0 &&
    mode !== null &&
    mode !== "soft_delete" &&
    mode !== "empty_purge";

  function buildBalanceResolution(): BalanceResolution | undefined {
    if (!needsBalance) return { type: "already_zero" };
    if (balanceAction === "transfer") {
      return { type: "transfer", toAccountId: balanceDest };
    }
    if (balanceAction === "adjustment") return { type: "adjustment" };
    return undefined;
  }

  function buildGoalDisposition(): GoalDisposition | undefined {
    if (!needsGoals) return undefined;
    if (goalAction === "delete") return { type: "delete" };
    if (goalAction === "archive") return { type: "archive" };
    if (goalAction === "reassign") {
      return { type: "reassign", toAccountId: goalDest };
    }
    return undefined;
  }

  function submit() {
    setError(null);
    if (!mode) {
      setError("Choose how to delete this account.");
      return;
    }
    if (needsBalance && !balanceAction) {
      setError(
        "Final balance is not zero. Transfer remaining balance, create a closing adjustment, or cancel.",
      );
      return;
    }
    if (balanceAction === "transfer" && !balanceDest) {
      setError("Choose an account for the remaining balance.");
      return;
    }
    if (needsGoals && !goalAction) {
      setError("Choose what to do with linked goals.");
      return;
    }
    if (goalAction === "reassign" && !goalDest) {
      setError("Choose an account to reassign goals to.");
      return;
    }

    const result = deleteAccountWithStrategy(accountId, {
      mode,
      confirmedName: confirmName,
      secondConfirm,
      destinationAccountId: destinationId || undefined,
      balanceResolution: buildBalanceResolution(),
      goalDisposition: buildGoalDisposition(),
      transferOrphanHandling: orphanHandling,
      confirmedIncompatibleMove: confirmIncompatible,
    });
    if (!result.ok) {
      setError(result.error ?? "Delete failed.");
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 id="delete-account-title" className="text-lg font-semibold">
            Delete {preview.name}
          </h2>
          <p className="text-xs text-muted mt-1">
            Choose how to handle history. Permanent deletion cannot be undone
            after the undo window expires.
          </p>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-canvas p-3 text-xs">
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="font-medium">
                {preview.type.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Final balance</dt>
              <dd className="font-medium">
                <MoneyText cents={preview.finalBalanceCents} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Closed</dt>
              <dd className="font-medium">
                {preview.closedAt
                  ? formatDisplayDate(preview.closedAt.slice(0, 10))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Transactions</dt>
              <dd className="font-medium">{preview.transactionCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Transfers</dt>
              <dd className="font-medium">{preview.transferCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Scheduled</dt>
              <dd className="font-medium">{preview.scheduledCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Reconciled</dt>
              <dd className="font-medium">{preview.reconciliationCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Import refs</dt>
              <dd className="font-medium">{preview.importRefCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Goals</dt>
              <dd className="font-medium">{preview.goalCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Report impact if history removed</dt>
              <dd className="font-medium">
                Net worth Δ{" "}
                <MoneyText cents={preview.reportImpact.netWorthDeltaCents} /> ·{" "}
                {preview.reportImpact.transactionsRemoved} txn removed
              </dd>
            </div>
          </dl>

          {preview.goals.length > 0 && (
            <ul className="text-xs text-muted list-disc pl-4">
              {preview.goals.map((g) => (
                <li key={g.id}>
                  {g.name} ({g.type.replaceAll("_", " ")})
                </li>
              ))}
            </ul>
          )}

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
              Delete options
            </legend>
            {(
              [
                {
                  id: "empty_purge" as const,
                  label: "A. Permanently delete empty account",
                  detail: "Only when there is no history or goal links.",
                  disabled: !preview.canEmptyPurge,
                },
                {
                  id: "delete_all_history" as const,
                  label: "B. Delete account and all history",
                  detail:
                    "Removes transactions, transfers, scheduled items, and goals. Requires typing the name.",
                  disabled: false,
                },
                {
                  id: "move_then_delete" as const,
                  label: "C. Move transactions, then delete",
                  detail: "Relocate history to another account, then remove.",
                  disabled: preview.transactionCount === 0,
                },
                {
                  id: "soft_delete" as const,
                  label: "D. Delete but preserve historical records",
                  detail:
                    "Recommended when history exists. Restorable from Recently Deleted.",
                  disabled: false,
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className={`flex gap-2 rounded-lg border px-3 py-2 ${
                  opt.disabled
                    ? "opacity-40 cursor-not-allowed border-border"
                    : mode === opt.id
                      ? "border-accent bg-accent-muted/40"
                      : "border-border hover:bg-black/5 cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="delete-mode"
                  disabled={opt.disabled}
                  checked={mode === opt.id}
                  onChange={() => setMode(opt.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted">{opt.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {needsBalance && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-semibold text-amber-900">
                Balance must be $0.00 before deletion
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="bal"
                  checked={balanceAction === "transfer"}
                  onChange={() => setBalanceAction("transfer")}
                />
                Transfer remaining balance
              </label>
              {balanceAction === "transfer" && (
                <select
                  value={balanceDest}
                  onChange={(e) => setBalanceDest(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <option value="">Select account…</option>
                  {destinations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="bal"
                  checked={balanceAction === "adjustment"}
                  onChange={() => setBalanceAction("adjustment")}
                />
                Create closing adjustment
              </label>
            </div>
          )}

          {needsGoals && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold">Linked goals</p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="goal"
                  checked={goalAction === "delete"}
                  onChange={() => setGoalAction("delete")}
                />
                Delete goals
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="goal"
                  checked={goalAction === "reassign"}
                  onChange={() => setGoalAction("reassign")}
                />
                Reassign to another account
              </label>
              {goalAction === "reassign" && (
                <select
                  value={goalDest}
                  onChange={(e) => setGoalDest(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <option value="">Select account…</option>
                  {destinations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="goal"
                  checked={goalAction === "archive"}
                  onChange={() => setGoalAction("archive")}
                />
                Archive goals
              </label>
            </div>
          )}

          {mode === "move_then_delete" && (
            <div className="space-y-2">
              <label className="block text-xs space-y-1">
                Destination account
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <option value="">Select…</option>
                  {destinations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.kind})
                    </option>
                  ))}
                </select>
              </label>
              {destinationId &&
                preview.incompatibleMoveKinds.includes(
                  destinations.find((d) => d.id === destinationId)?.kind ??
                    "on_budget",
                ) && (
                  <label className="flex items-center gap-2 text-xs text-amber-800">
                    <input
                      type="checkbox"
                      checked={confirmIncompatible}
                      onChange={(e) =>
                        setConfirmIncompatible(e.target.checked)
                      }
                    />
                    I understand this move crosses incompatible account kinds
                  </label>
                )}
            </div>
          )}

          {mode === "delete_all_history" && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
              <p className="text-xs text-red-800">
                This permanently removes history. An automatic backup is created
                first. Undo may not be available after the undo window expires.
              </p>
              {preview.transferCount > 0 && (
                <label className="block text-xs space-y-1">
                  Linked transfers on other accounts
                  <select
                    value={orphanHandling}
                    onChange={(e) =>
                      setOrphanHandling(
                        e.target.value as TransferOrphanHandling,
                      )
                    }
                    className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                  >
                    <option value="convert_to_adjustment">
                      Convert to balance adjustment
                    </option>
                    <option value="convert_to_ordinary">
                      Convert to ordinary transaction
                    </option>
                  </select>
                </label>
              )}
              <label className="block text-xs space-y-1">
                Type <span className="font-semibold">{preview.name}</span> to
                confirm
                <input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={secondConfirm}
                  onChange={(e) => setSecondConfirm(e.target.checked)}
                />
                I understand this cannot be restored after the undo window
              </label>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            E. Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!mode}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}
