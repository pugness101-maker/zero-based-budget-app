"use client";

import { Upload } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";

export function ImportPrompt({ onImport }: { onImport: () => void }) {
  const dismissed = useBudgetStore((s) => s.importPromptDismissed);
  const batches = useBudgetStore((s) => s.importBatches);
  const dismiss = useBudgetStore((s) => s.dismissImportPrompt);

  if (dismissed || batches.some((b) => b.status === "committed")) return null;

  return (
    <div className="mx-4 md:mx-6 mt-4 rounded-xl border border-accent/30 bg-accent-muted/40 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <Upload className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">
            Import your past bank data
          </p>
          <p className="text-xs text-muted mt-0.5">
            Upload CSV statements or a JSON backup. A safety backup is created
            before every import, and you can undo the whole batch.
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            dismiss();
            onImport();
          }}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Import data
        </button>
      </div>
    </div>
  );
}
