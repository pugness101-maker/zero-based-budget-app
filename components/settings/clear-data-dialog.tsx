"use client";

import { useMemo, useState } from "react";
import {
  CLEAR_SCOPE_OPTIONS,
  countClearableRecords,
  type AfterClearChoice,
  type ClearDataScope,
} from "@/lib/data/clear-data";
import { serializeFullBackup } from "@/lib/exports/full-backup";
import { formatDisplayDate } from "@/lib/dates";
import {
  downloadTextFile,
  formatBackupFilename,
} from "@/lib/persistence/download";
import { useBudgetStore } from "@/lib/store/budget-store";

const CONFIRM_PHRASE = "CLEAR MY DATA";

type Step = "options" | "confirm" | "done";

export function ClearDataDialog({
  open,
  onClose,
  onRequestImportBackup,
}: {
  open: boolean;
  onClose: () => void;
  onRequestImportBackup?: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const importBatches = useBudgetStore((s) => s.importBatches);
  const auditEvents = useBudgetStore((s) => s.auditEvents);
  const backups = useBudgetStore((s) => s.backups);
  const payeeAliasRules = useBudgetStore((s) => s.payeeAliasRules);
  const categoryImportRules = useBudgetStore((s) => s.categoryImportRules);
  const clearData = useBudgetStore((s) => s.clearData);
  const undoClearData = useBudgetStore((s) => s.undoClearData);
  const lastClearBackupId = useBudgetStore((s) => s.lastClearBackupId);
  const showToast = useBudgetStore((s) => s.showToast);

  const [step, setStep] = useState<Step>("options");
  const [scope, setScope] = useState<ClearDataScope>("all");
  const [after, setAfter] = useState<AfterClearChoice>("blank");
  const [phrase, setPhrase] = useState("");
  const [secondConfirm, setSecondConfirm] = useState(false);
  const [uncategorizeOk, setUncategorizeOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedBackupId, setCompletedBackupId] = useState<string | null>(
    null,
  );

  const counts = useMemo(
    () =>
      countClearableRecords({
        plan,
        importBatches,
        auditEvents,
      }),
    [plan, importBatches, auditEvents],
  );

  const latestBackupDate = backups[0]?.createdAt ?? null;

  if (!open) return null;

  function resetLocal() {
    setStep("options");
    setScope("all");
    setAfter("blank");
    setPhrase("");
    setSecondConfirm(false);
    setUncategorizeOk(false);
    setError(null);
    setCompletedBackupId(null);
  }

  function handleClose() {
    resetLocal();
    onClose();
  }

  function downloadPreClearBackup(backupId: string) {
    const backup = useBudgetStore
      .getState()
      .backups.find((b) => b.id === backupId);
    if (!backup) {
      showToast("Backup not found.");
      return;
    }
    const content = serializeFullBackup({
      plan: backup.planSnapshot,
      payeeAliasRules: backup.extras?.payeeAliasRules ?? payeeAliasRules,
      categoryImportRules:
        backup.extras?.categoryImportRules ?? categoryImportRules,
      importBatches: backup.extras?.importBatches ?? importBatches,
      auditEvents: backup.extras?.auditEvents ?? auditEvents,
      backups,
    });
    const result = downloadTextFile({
      content,
      filename: formatBackupFilename(),
      mimeType: "application/json",
    });
    if (result.ok) showToast("Pre-clear backup downloaded.");
    else showToast(result.error);
  }

  function runClear() {
    setError(null);
    if (phrase.trim() !== CONFIRM_PHRASE) {
      setError(`Type ${CONFIRM_PHRASE} to continue.`);
      return;
    }
    if (scope === "all" && !secondConfirm) {
      setError("Confirm a second time that you want to erase all app data.");
      return;
    }
    if (
      scope === "categories_and_groups" &&
      counts.transactions > 0 &&
      !uncategorizeOk
    ) {
      setError(
        "Acknowledge that transaction category links will be cleared (no orphaned references).",
      );
      return;
    }

    const result = clearData({ scope, after });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCompletedBackupId(result.backupId);
    setStep("done");
  }

  function finishAndRefresh() {
    if (after === "import_backup" && onRequestImportBackup) {
      handleClose();
      onRequestImportBackup();
      return;
    }
    handleClose();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-data-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "done") handleClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-red-200 bg-surface p-4 sm:p-5 shadow-xl space-y-4">
        <div>
          <h2
            id="clear-data-title"
            className="text-lg font-semibold text-red-800"
          >
            Clear Data
          </h2>
          <p className="mt-1 text-sm text-red-700/90">
            This permanently erases selected local budget data. A full backup is
            created first. Your login and subscription (if any) are never
            removed.
          </p>
        </div>

        {step === "options" && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
                What to clear
              </legend>
              <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-lg border border-border p-2">
                {CLEAR_SCOPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="clear-scope"
                      checked={scope === opt.id}
                      onChange={() => setScope(opt.id)}
                      className="mt-0.5 accent-red-600"
                    />
                    <span>
                      <span className="font-medium block">{opt.label}</span>
                      <span className="text-xs text-muted">
                        {opt.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm space-y-1">
              <p className="font-medium text-amber-950">Current record counts</p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-amber-950/90">
                <li>Accounts: {counts.accounts}</li>
                <li>Transactions: {counts.transactions}</li>
                <li>Categories: {counts.categories}</li>
                <li>Category groups: {counts.categoryGroups}</li>
                <li>Goals: {counts.goals}</li>
                <li>Scheduled: {counts.scheduled}</li>
                <li>Payees: {counts.payees}</li>
                <li>Monthly budgets: {counts.monthlyBudgets}</li>
                <li>Import batches: {counts.importBatches}</li>
                <li>Audit events: {counts.auditEvents}</li>
              </ul>
              <p className="text-xs text-amber-900/80 pt-1">
                Latest backup:{" "}
                {latestBackupDate
                  ? formatDisplayDate(latestBackupDate.slice(0, 10))
                  : "None yet (one will be created automatically)"}
              </p>
            </div>

            {(scope === "all" || scope === "demo_data_only") && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
                  After clearing
                </legend>
                {(
                  [
                    ["blank", "Start with blank budget (default)"],
                    [
                      "simplified_template",
                      "Restore simplified default category template",
                    ],
                    ["demo", "Restore demo data"],
                    ["import_backup", "Import a backup next"],
                  ] as const
                ).map(([id, label]) => (
                  <label
                    key={id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="after-clear"
                      checked={after === id}
                      onChange={() => setAfter(id)}
                      className="accent-red-600"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <p className="text-sm">
              You are about to clear:{" "}
              <span className="font-semibold">
                {CLEAR_SCOPE_OPTIONS.find((o) => o.id === scope)?.label}
              </span>
              . An automatic full backup will be saved to Recent Backups.
            </p>

            {scope === "categories_and_groups" && counts.transactions > 0 && (
              <label className="flex gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uncategorizeOk}
                  onChange={(e) => setUncategorizeOk(e.target.checked)}
                  className="mt-0.5 accent-red-600"
                />
                <span>
                  Uncategorize {counts.transactions} transaction
                  {counts.transactions === 1 ? "" : "s"} (required — prevents
                  orphaned category references).
                </span>
              </label>
            )}

            {scope === "all" && (
              <label className="flex gap-2 text-sm rounded-lg border border-red-300 bg-red-50 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={secondConfirm}
                  onChange={(e) => setSecondConfirm(e.target.checked)}
                  className="mt-0.5 accent-red-600"
                />
                <span className="font-medium text-red-900">
                  Second confirmation: I understand this erases all app budget
                  data and cannot be undone without the automatic backup.
                </span>
              </label>
            )}

            <label className="block text-sm space-y-1">
              <span className="text-muted">
                Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span>{" "}
                to confirm
              </span>
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-md border border-red-300 px-2 py-1.5 text-sm font-mono"
                placeholder={CONFIRM_PHRASE}
              />
            </label>

            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("options");
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-black/5"
              >
                Back
              </button>
              <button
                type="button"
                onClick={runClear}
                disabled={phrase.trim() !== CONFIRM_PHRASE}
                className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear Data
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <p className="text-sm text-ink">
              Clear complete. A backup was saved
              {completedBackupId ? ` (${completedBackupId})` : ""}. Demo seed
              data will not repopulate unless you choose Restore demo data.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const result = undoClearData();
                  if (result.ok) {
                    showToast("Clear data undone.");
                    handleClose();
                  } else {
                    setError(result.error ?? "Undo failed.");
                  }
                }}
                disabled={!lastClearBackupId && !completedBackupId}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
              >
                Undo Clear Data
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadPreClearBackup(
                    completedBackupId ?? lastClearBackupId ?? "",
                  )
                }
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-black/5"
              >
                Download backup
              </button>
              <button
                type="button"
                onClick={finishAndRefresh}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                {after === "import_backup"
                  ? "Import a backup"
                  : "Continue & refresh"}
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
