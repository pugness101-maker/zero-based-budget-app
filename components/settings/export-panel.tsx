"use client";

import { useMemo, useState } from "react";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  buildAccountsCsv,
  buildBudgetHistoryCsv,
  buildCategoriesCsv,
  buildGoalsCsv,
  buildTransactionsCsv,
  countFilteredTransactions,
  type ExportFilters,
} from "@/lib/exports/csv";
import {
  countBackupRecords,
  parseFullBackup,
  serializeFullBackup,
} from "@/lib/exports/full-backup";
import { buildRestorePreview } from "@/lib/imports/restore-backup";
import {
  downloadTextFile,
  formatBackupFilename,
  formatCsvFilename,
} from "@/lib/persistence/download";
import { isAutomaticBackupReason } from "@/lib/persistence/prune-backups";
import { useBudgetStore } from "@/lib/store/budget-store";
import { formatDisplayDate } from "@/lib/dates";
import type { MergeMode } from "@/lib/types/import";

const defaultFilters: ExportFilters = {
  includeTransfers: true,
  includeHiddenAccounts: true,
  includeClosedAccounts: true,
  includeHiddenCategories: true,
  includeArchivedCategories: true,
};

export function ExportPanel({ onOpenImport }: { onOpenImport: () => void }) {
  const plan = useBudgetStore((s) => s.plan);
  const backups = useBudgetStore((s) => s.backups);
  const importBatches = useBudgetStore((s) => s.importBatches);
  const auditEvents = useBudgetStore((s) => s.auditEvents);
  const payeeAliasRules = useBudgetStore((s) => s.payeeAliasRules);
  const categoryImportRules = useBudgetStore((s) => s.categoryImportRules);
  const createBackup = useBudgetStore((s) => s.createBackup);
  const deleteBackup = useBudgetStore((s) => s.deleteBackup);
  const restoreStoredBackup = useBudgetStore((s) => s.restoreStoredBackup);
  const restoreJsonBackup = useBudgetStore((s) => s.restoreJsonBackup);
  const reverseImport = useBudgetStore((s) => s.reverseImport);
  const showToast = useBudgetStore((s) => s.showToast);

  const [filters, setFilters] = useState<ExportFilters>(defaultFilters);
  const [restoreMode, setRestoreMode] = useState<MergeMode>("merge");
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const txnPreviewCount = useMemo(
    () => countFilteredTransactions(plan, filters),
    [plan, filters],
  );

  function patchFilters(patch: Partial<ExportFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function exportFull() {
    createBackup("Manual full export", "manual");
    const content = serializeFullBackup({
      plan,
      payeeAliasRules,
      categoryImportRules,
      importBatches,
      auditEvents,
      backups,
    });
    const filename = formatBackupFilename();
    const result = downloadTextFile({
      content,
      filename,
      mimeType: "application/json",
    });
    if (result.ok) {
      showToast(
        `Exported ${filename} · ${countBackupRecords(plan)} records`,
      );
    } else {
      showToast(result.error);
    }
  }

  function exportCsv(
    kind: string,
    builder: () => { csv: string; rowCount: number },
  ) {
    const { csv, rowCount } = builder();
    const filename = formatCsvFilename(kind);
    const result = downloadTextFile({
      content: csv,
      filename,
      mimeType: "text/csv;charset=utf-8",
    });
    if (result.ok) {
      showToast(`Exported ${filename} · ${rowCount} rows`);
    } else {
      showToast(result.error);
    }
  }

  const restorePreview = useMemo(() => {
    if (!restoreFile) return null;
    const parsed = parseFullBackup(restoreFile);
    if (!parsed.ok || !parsed.plan) {
      return { ok: false as const, errors: parsed.errors };
    }
    return {
      ok: true as const,
      parsed,
      preview: buildRestorePreview(plan, parsed.plan),
    };
  }, [restoreFile, plan]);

  function runFileRestore() {
    if (!restoreFile) return;
    if (restoreMode === "replace" && !confirmReplace) {
      showToast("Confirm replace before restoring.");
      return;
    }
    const result = restoreJsonBackup(restoreFile, restoreMode);
    if (result.ok) {
      showToast(
        `Restore complete (${restoreMode}) from ${restoreFileName || "backup"}`,
      );
      setRestoreFile(null);
      setRestoreFileName("");
      setConfirmReplace(false);
    } else {
      showToast(result.error ?? "Restore failed — rolled back.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">Import / Export</h2>
      </div>
      <p className="text-sm text-muted">
        Import CSV statements, YNAB-style exports, or a JSON backup. Exports
        download real files. Every destructive import creates a restore point.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenImport}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Import past data
        </button>
        <button
          type="button"
          onClick={exportFull}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Export Full Backup
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          CSV export filters
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-muted">Start date</span>
            <input
              type="date"
              value={filters.startDate ?? ""}
              onChange={(e) =>
                patchFilters({ startDate: e.target.value || undefined })
              }
              className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted">End date</span>
            <input
              type="date"
              value={filters.endDate ?? ""}
              onChange={(e) =>
                patchFilters({ endDate: e.target.value || undefined })
              }
              className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {(
            [
              ["includeTransfers", "Include transfers"],
              ["includeHiddenAccounts", "Include hidden accounts"],
              ["includeClosedAccounts", "Include closed accounts"],
              ["includeHiddenCategories", "Include hidden categories"],
              ["includeArchivedCategories", "Include archived categories"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(filters[key])}
                onChange={(e) => patchFilters({ [key]: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              {label}
            </label>
          ))}
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted">Accounts (optional)</span>
          <select
            multiple
            className="w-full rounded-md border border-border px-2 py-1.5 text-sm min-h-[4.5rem]"
            value={filters.accountIds ?? []}
            onChange={(e) => {
              const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
              patchFilters({ accountIds: ids.length ? ids : undefined });
            }}
          >
            {plan.accounts
              .filter((a) => !a.deletedAt)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs space-y-1 block">
          <span className="text-muted">Categories (optional)</span>
          <select
            multiple
            className="w-full rounded-md border border-border px-2 py-1.5 text-sm min-h-[4.5rem]"
            value={filters.categoryIds ?? []}
            onChange={(e) => {
              const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
              patchFilters({ categoryIds: ids.length ? ids : undefined });
            }}
          >
            {plan.categories
              .filter((c) => !c.deletedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5">
            Cleared
            <select
              className="rounded-md border border-border px-2 py-1"
              value={(filters.cleared ?? []).join(",") || "all"}
              onChange={(e) => {
                const v = e.target.value;
                patchFilters({
                  cleared:
                    v === "all"
                      ? undefined
                      : (v.split(",") as ExportFilters["cleared"]),
                });
              }}
            >
              <option value="all">Any</option>
              <option value="cleared">Cleared</option>
              <option value="uncleared">Uncleared</option>
              <option value="reconciled">Reconciled</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5">
            Type
            <select
              className="rounded-md border border-border px-2 py-1"
              value={(filters.transactionTypes ?? []).join(",") || "all"}
              onChange={(e) => {
                const v = e.target.value;
                patchFilters({
                  transactionTypes:
                    v === "all"
                      ? undefined
                      : ([v] as ExportFilters["transactionTypes"]),
                });
              }}
            >
              <option value="all">Any</option>
              <option value="standard">Standard</option>
              <option value="transfer">Transfer</option>
              <option value="split">Split</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">
          Transaction export preview:{" "}
          <span className="font-semibold text-foreground">{txnPreviewCount}</span>{" "}
          rows
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              exportCsv("transactions", () =>
                buildTransactionsCsv(plan, filters),
              )
            }
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export Transactions CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportCsv("accounts", () => buildAccountsCsv(plan, filters))
            }
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export Accounts CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportCsv("categories", () =>
                buildCategoriesCsv(plan, plan.workingMonthKey, filters),
              )
            }
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export Categories CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportCsv("goals", () =>
                buildGoalsCsv(plan, plan.workingMonthKey),
              )
            }
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export Goals CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportCsv("budget-history", () =>
                buildBudgetHistoryCsv(plan, filters),
              )
            }
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export Budget History CSV
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Restore backup
        </p>
        <input
          type="file"
          accept="application/json,.json"
          className="block w-full text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setRestoreFileName(file.name);
            setRestoreFile(await file.text());
            setConfirmReplace(false);
          }}
        />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="restore-mode"
              checked={restoreMode === "merge"}
              onChange={() => setRestoreMode("merge")}
            />
            Merge (default)
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name="restore-mode"
              checked={restoreMode === "replace"}
              onChange={() => setRestoreMode("replace")}
            />
            Replace all data
          </label>
        </div>
        {restorePreview && !restorePreview.ok && (
          <p className="text-sm text-red-600">
            {restorePreview.errors.join(" ")}
          </p>
        )}
        {restorePreview?.ok && (
          <div className="text-xs space-y-1 text-muted">
            <p>
              Schema v{restorePreview.parsed.schemaVersion} ·{" "}
              {restorePreview.preview.accountCount} accounts ·{" "}
              {restorePreview.preview.transactionCount} transactions ·{" "}
              {restorePreview.preview.categoryCount} categories ·{" "}
              {restorePreview.preview.goalCount} goals
            </p>
            {restorePreview.preview.conflicts.length > 0 && (
              <p>
                {restorePreview.preview.conflicts.length} conflict
                {restorePreview.preview.conflicts.length === 1 ? "" : "s"} on
                merge (current IDs win).
              </p>
            )}
            {restoreMode === "replace" && (
              <label className="flex items-center gap-2 text-sm text-foreground pt-1">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  onChange={(e) => setConfirmReplace(e.target.checked)}
                />
                I understand this will overwrite current data
              </label>
            )}
            <button
              type="button"
              onClick={runFileRestore}
              className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Restore Backup
            </button>
          </div>
        )}
      </div>

      {importBatches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Recent imports
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {importBatches.slice(0, 5).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.fileName}</p>
                  <p className="text-xs text-muted">
                    {b.status} · {b.importedRows} imported
                  </p>
                </div>
                {b.status === "committed" && (
                  <button
                    type="button"
                    onClick={() => reverseImport(b.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Stored backups
        </p>
        {backups.length === 0 ? (
          <p className="text-xs text-muted">No automatic or manual backups yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {backups.map((b) => {
              const count = b.recordCount ?? countBackupRecords(b.planSnapshot);
              return (
                <li
                  key={b.id}
                  className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.label}</p>
                    <p className="text-xs text-muted">
                      {formatDisplayDate(b.createdAt.slice(0, 10))} ·{" "}
                      {isAutomaticBackupReason(b.reason)
                        ? "Automatic"
                        : "Manual"}{" "}
                      ({b.reason}) · {count} records
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      title="Download"
                      onClick={() => {
                        const content = serializeFullBackup({
                          plan: b.planSnapshot,
                        });
                        const filename = formatBackupFilename(
                          new Date(b.createdAt),
                        );
                        const result = downloadTextFile({
                          content,
                          filename,
                          mimeType: "application/json",
                        });
                        showToast(
                          result.ok
                            ? `Downloaded ${filename}`
                            : result.error,
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-black/5"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                    <button
                      type="button"
                      title="Restore"
                      onClick={() => {
                        if (
                          !confirm(
                            `Restore “${b.label}” using Merge? Current data is backed up first.`,
                          )
                        ) {
                          return;
                        }
                        const result = restoreStoredBackup(b.id, "merge");
                        showToast(
                          result.ok
                            ? `Restored ${b.label}`
                            : (result.error ?? "Restore failed"),
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-black/5"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => {
                        if (confirm("Delete this stored backup?")) {
                          deleteBackup(b.id);
                          showToast("Backup deleted");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-black/5"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
