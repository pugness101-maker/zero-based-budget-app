"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildApplyTemplatePreview,
  type TemplateGroupMapping,
} from "@/lib/categories/apply-default-template";
import { DEFAULT_CATEGORY_GROUP_DEFS } from "@/lib/seed/default-templates";

export function ApplyTemplateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const apply = useBudgetStore((s) => s.applySimplifiedDefaultTemplate);
  const preview = useMemo(() => buildApplyTemplatePreview(plan), [plan]);

  const [mapping, setMapping] = useState<TemplateGroupMapping>(() => {
    const initial: TemplateGroupMapping = {};
    for (const g of preview.existingGroups) {
      initial[g.id] = g.suggestedDefaultId;
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function submit() {
    setError(null);
    const result = apply(mapping);
    if (!result.ok) {
      setError(result.error ?? "Could not apply template.");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-template-title"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 id="apply-template-title" className="text-lg font-semibold">
            Apply simplified default template
          </h2>
          <p className="text-xs text-muted mt-1">
            Preview the 15 default groups. Map each existing group to a default,
            or keep it separate. A backup is created first. Existing budgets are
            never overwritten unless you confirm here.
          </p>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
              Default groups ({preview.defaultGroups.length})
            </p>
            <ol className="list-decimal pl-5 text-xs space-y-0.5 text-muted">
              {preview.defaultGroups.map((g) => (
                <li key={g.id}>
                  {g.name}
                  {g.name === "Hidden" ? " (collapsed, last)" : ""}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Map existing groups
            </p>
            {preview.existingGroups.map((g) => (
              <label
                key={g.id}
                className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2"
              >
                <span className="font-medium">
                  {g.name}{" "}
                  <span className="text-xs text-muted font-normal">
                    ({g.categoryCount} categories)
                  </span>
                </span>
                <select
                  className="input text-sm"
                  value={mapping[g.id] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [g.id]: e.target.value || null,
                    }))
                  }
                >
                  <option value="">Keep as separate group</option>
                  {DEFAULT_CATEGORY_GROUP_DEFS.map((d) => (
                    <option key={d.id} value={d.id}>
                      Map to {d.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {preview.groupsToAdd.length > 0 && (
            <p className="text-xs text-muted">
              Will add missing defaults: {preview.groupsToAdd.join(", ")}
            </p>
          )}

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
            onClick={submit}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Apply template
          </button>
        </div>
      </div>
    </div>
  );
}
