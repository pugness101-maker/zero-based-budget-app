"use client";

import { useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import {
  buildClosePreview,
  isAccountClosed,
} from "@/lib/accounts/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { CloseAccountDialog } from "@/components/accounts/close-account-dialog";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";
import type {
  Account,
  AccountBudgetKind,
  AccountType,
  BudgetPlan,
} from "@/lib/types/budget";

const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "line_of_credit",
  "mortgage",
  "auto_loan",
  "student_loan",
  "personal_loan",
  "investment_tracking",
  "asset_tracking",
  "liability_tracking",
];

export function EditAccountModal({
  accountId,
  open,
  onClose,
}: {
  accountId: string;
  open: boolean;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const account = plan.accounts.find((a) => a.id === accountId);

  if (!open || !account) return null;

  return (
    <EditAccountForm
      key={accountId}
      account={account}
      plan={plan}
      onClose={onClose}
    />
  );
}

function EditAccountForm({
  account,
  plan,
  onClose,
}: {
  account: Account;
  plan: BudgetPlan;
  onClose: () => void;
}) {
  const updateAccount = useBudgetStore((s) => s.updateAccount);
  const hideAccount = useBudgetStore((s) => s.hideAccount);
  const unhideAccount = useBudgetStore((s) => s.unhideAccount);

  const [name, setName] = useState(account.name);
  const [note, setNote] = useState(account.note ?? "");
  const [type, setType] = useState<AccountType>(account.type);
  const [kind, setKind] = useState<AccountBudgetKind>(account.kind);
  const [isHidden, setIsHidden] = useState(Boolean(account.isHidden));
  const [error, setError] = useState<string | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const balance = getAccountBalance(account, plan.transactions);
  const closed = isAccountClosed(account);
  const preview = buildClosePreview(plan, account.id);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-account-title"
      >
        <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <h2 id="edit-account-title" className="text-lg font-semibold">
              Edit Account
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Working balance{" "}
              <MoneyText
                cents={balance.balanceCents}
                className="font-medium text-ink"
              />
            </p>
          </div>

          <div className="p-4 space-y-3">
            <Field label="Account name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                disabled={closed}
              />
            </Field>
            <Field label="Account notes">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input min-h-[4rem]"
                disabled={closed}
              />
            </Field>
            <Field label="Account type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="input"
                disabled={closed}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="On-budget or tracking">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AccountBudgetKind)}
                className="input"
                disabled={closed}
              >
                <option value="on_budget">On budget</option>
                <option value="credit">Credit</option>
                <option value="tracking">Tracking</option>
              </select>
            </Field>

            {!closed && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Hidden
                  <span className="block text-xs text-muted font-normal">
                    Removes from normal sidebar; keeps history and reports.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={isHidden}
                  onChange={(e) => setIsHidden(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
            )}

            {preview && (
              <div className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-muted space-y-1">
                <p>
                  Cleared <MoneyText cents={preview.clearedBalanceCents} /> ·
                  Uncleared{" "}
                  <MoneyText cents={preview.unclearedBalanceCents} />
                </p>
                <p>
                  {preview.scheduledCount} scheduled ·{" "}
                  {preview.unreconciledCount} unreconciled ·{" "}
                  {preview.linkedTransferCount} linked transfers
                </p>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              {!closed && (
                <button
                  type="button"
                  onClick={() => setShowClose(true)}
                  className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5"
                >
                  Close Account
                </button>
              )}
              <button
                type="button"
                disabled={!closed || Boolean(account.deletedAt)}
                title={
                  closed
                    ? "Open delete workflow"
                    : "Close the account before deleting"
                }
                onClick={() => setShowDelete(true)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/5"
              >
                Delete Account
              </button>
            </div>
            {!closed && (
              <p className="text-xs text-muted">
                Close the account first, then use Delete for the guided safety
                workflow (soft delete, move history, or purge).
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            {!closed && (
              <button
                type="button"
                onClick={() => {
                  if (!name.trim()) {
                    setError("Account name is required.");
                    return;
                  }
                  updateAccount(account.id, {
                    name: name.trim(),
                    note: note.trim() || undefined,
                    type,
                    kind,
                  });
                  if (isHidden && !account.isHidden) hideAccount(account.id);
                  else if (!isHidden && account.isHidden)
                    unhideAccount(account.id);
                  onClose();
                }}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      <CloseAccountDialog
        accountId={account.id}
        open={showClose}
        onClose={() => setShowClose(false)}
        onClosed={() => {
          setShowClose(false);
          onClose();
        }}
      />
      <DeleteAccountDialog
        accountId={account.id}
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onDeleted={() => {
          setShowDelete(false);
          onClose();
        }}
      />
    </>
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
