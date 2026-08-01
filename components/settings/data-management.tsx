"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { ClearDataDialog } from "@/components/settings/clear-data-dialog";
import { ExportPanel } from "@/components/settings/export-panel";
import {
  countBackupRecords,
  serializeFullBackup,
} from "@/lib/exports/full-backup";
import {
  downloadTextFile,
  formatBackupFilename,
} from "@/lib/persistence/download";
import { useBudgetStore } from "@/lib/store/budget-store";

export function DataManagement({
  onOpenImport,
}: {
  onOpenImport: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const backups = useBudgetStore((s) => s.backups);
  const importBatches = useBudgetStore((s) => s.importBatches);
  const auditEvents = useBudgetStore((s) => s.auditEvents);
  const payeeAliasRules = useBudgetStore((s) => s.payeeAliasRules);
  const categoryImportRules = useBudgetStore((s) => s.categoryImportRules);
  const createBackup = useBudgetStore((s) => s.createBackup);
  const resetDemoData = useBudgetStore((s) => s.resetDemoData);
  const undoClearData = useBudgetStore((s) => s.undoClearData);
  const lastClearBackupId = useBudgetStore((s) => s.lastClearBackupId);
  const showToast = useBudgetStore((s) => s.showToast);
  const restoreJsonBackup = useBudgetStore((s) => s.restoreJsonBackup);

  const [clearOpen, setClearOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const restoreInputRef = useRef<HTMLInputElement>(null);

  function exportBackup() {
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

  async function onRestoreFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const result = restoreJsonBackup(text, "replace");
    if (result.ok) {
      showToast(`Restored backup from ${file.name}`);
    } else {
      showToast(result.error ?? "Restore failed.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-red-200 bg-surface p-4 space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-red-900">
              Data Management
            </h2>
            <p className="mt-1 text-sm text-muted">
              Export or restore backups, clear local budget data, or reset the
              college-student demo. Destructive actions create an automatic
              backup first. Authentication and subscription data are never
              erased.
            </p>
          </div>
        </div>

        {lastClearBackupId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm flex flex-wrap items-center gap-2 justify-between">
            <span>Clear Data can still be undone from the last backup.</span>
            <button
              type="button"
              onClick={() => {
                const result = undoClearData();
                showToast(
                  result.ok
                    ? "Clear data undone."
                    : (result.error ?? "Undo failed."),
                );
              }}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
            >
              Undo Clear Data
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportBackup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            <Upload className="h-3.5 w-3.5" />
            Restore Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onRestoreFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Data
          </button>
          <button
            type="button"
            disabled={resetConfirm !== "RESET"}
            onClick={() => {
              if (
                confirm(
                  "This permanently replaces your local plan with the college-student demo. A backup is created first. Continue?",
                )
              ) {
                resetDemoData();
                setResetConfirm("");
                showToast("Demo data reset.");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Demo Data
          </button>
        </div>

        <label className="block text-xs text-muted space-y-1 max-w-xs">
          Type RESET to enable Reset Demo Data
          <input
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="RESET"
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
      </section>

      <ExportPanel onOpenImport={onOpenImport} />

      <ClearDataDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onRequestImportBackup={() => restoreInputRef.current?.click()}
      />
    </div>
  );
}
