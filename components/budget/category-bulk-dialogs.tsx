"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { MoneyText } from "@/components/shared/money-text";
import {
  buildBulkImpactSummary,
  buildBulkMergePreview,
  needsAvailablePrompt,
  type BulkDeleteMode,
} from "@/lib/categories/bulk";
import type { AvailableDisposition } from "@/lib/categories/deletion";
import { getSelectableCategories } from "@/lib/categories/lifecycle";

export type BulkDialogKind =
  | "hide"
  | "archive"
  | "move"
  | "merge"
  | "delete"
  | null;

export function CategoryBulkDialogs({
  kind,
  categoryIds,
  onClose,
  onApplied,
}: {
  kind: BulkDialogKind;
  categoryIds: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const bulkHideCategories = useBudgetStore((s) => s.bulkHideCategories);
  const bulkArchiveCategories = useBudgetStore((s) => s.bulkArchiveCategories);
  const bulkMoveCategories = useBudgetStore((s) => s.bulkMoveCategories);
  const bulkMergeCategories = useBudgetStore((s) => s.bulkMergeCategories);
  const bulkDeleteCategories = useBudgetStore((s) => s.bulkDeleteCategories);

  const summary = useMemo(
    () => buildBulkImpactSummary(plan, categoryIds, monthKey),
    [plan, categoryIds, monthKey],
  );

  const [groupId, setGroupId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [deleteMode, setDeleteMode] = useState<BulkDeleteMode>("safe_only");
  const [forceConfirm, setForceConfirm] = useState(false);
  const [availableChoice, setAvailableChoice] = useState<
    AvailableDisposition["type"] | "review_each" | ""
  >("");
  const [availableDest, setAvailableDest] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!kind) return null;

  const needsBalance = needsAvailablePrompt(plan, categoryIds, monthKey);
  const names = summary.rows.map((r) => r.name);
  const groups = plan.categoryGroups.filter((g) => !g.deletedAt && !g.hidden);
  const destinations = getSelectableCategories(plan, {
    includeHidden: true,
  }).filter((c) => !categoryIds.includes(c.id));

  function buildAvailable(): AvailableDisposition | undefined {
    if (!needsBalance) return undefined;
    if (availableChoice === "ready_to_assign") return { type: "ready_to_assign" };
    if (availableChoice === "keep_historical") return { type: "keep_historical" };
    if (availableChoice === "move_to_category") {
      return { type: "move_to_category", categoryId: availableDest };
    }
    return undefined;
  }

  function requireAvailable(): boolean {
    if (!needsBalance) return true;
    if (!availableChoice || availableChoice === "review_each") {
      setError(
        availableChoice === "review_each"
          ? "Review each category separately from Edit Category for now, or choose a combined option."
          : "Choose how to handle the combined available balance.",
      );
      return false;
    }
    if (availableChoice === "move_to_category" && !availableDest) {
      setError("Choose a category for the combined available balance.");
      return false;
    }
    return true;
  }

  function submit() {
    setError(null);
    if (kind === "hide" || kind === "archive" || kind === "merge" || kind === "delete") {
      if (!requireAvailable()) return;
    }
    const available = buildAvailable();

    if (kind === "hide") {
      const result = bulkHideCategories(categoryIds, available);
      if (result && "ok" in result && !result.ok) {
        setError(result.error ?? "Hide failed.");
        return;
      }
      onApplied();
      onClose();
      return;
    }
    if (kind === "archive") {
      const result = bulkArchiveCategories(categoryIds, available);
      if (!result.ok) {
        setError(result.error ?? "Archive failed.");
        return;
      }
      onApplied();
      onClose();
      return;
    }
    if (kind === "move") {
      if (!groupId) {
        setError("Choose a destination group.");
        return;
      }
      const result = bulkMoveCategories(categoryIds, groupId);
      if (!result.ok) {
        setError(result.error ?? "Move failed.");
        return;
      }
      onApplied();
      onClose();
      return;
    }
    if (kind === "merge") {
      if (!destinationId) {
        setError("Choose a destination category.");
        return;
      }
      const result = bulkMergeCategories(categoryIds, destinationId, available);
      if (!result.ok) {
        setError(result.error ?? "Merge failed.");
        return;
      }
      onApplied();
      onClose();
      return;
    }
    if (kind === "delete") {
      if (deleteMode === "reassign" && !destinationId) {
        setError("Choose a destination category.");
        return;
      }
      if (deleteMode === "force_uncategorized" && !forceConfirm) {
        setError("Confirm force delete to Uncategorized.");
        return;
      }
      const result = bulkDeleteCategories(categoryIds, deleteMode, {
        destinationId: destinationId || undefined,
        available,
        confirmForce: forceConfirm,
      });
      if (!result.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
      onApplied();
      onClose();
    }
  }

  const mergePreview =
    kind === "merge" && destinationId
      ? buildBulkMergePreview(plan, categoryIds, destinationId)
      : null;

  const title =
    kind === "hide"
      ? "Bulk Hide Categories"
      : kind === "archive"
        ? "Bulk Archive Categories"
        : kind === "move"
          ? "Move Categories"
          : kind === "merge"
            ? "Bulk Merge Categories"
            : "Bulk Delete Categories";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-cat-title"
    >
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 id="bulk-cat-title" className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {summary.categoryCount} categor
            {summary.categoryCount === 1 ? "y" : "ies"} selected
          </p>
        </div>

        <div className="space-y-4 p-4 text-sm">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-canvas p-3 text-xs">
            <div>
              <dt className="text-muted">Categories</dt>
              <dd className="font-semibold">{summary.categoryCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Transactions</dt>
              <dd className="font-semibold">{summary.transactionCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Budget records</dt>
              <dd className="font-semibold">{summary.budgetHistoryCount}</dd>
            </div>
            <div>
              <dt className="text-muted">Targets</dt>
              <dd className="font-semibold">{summary.targetCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Combined available</dt>
              <dd className="font-semibold">
                <MoneyText cents={summary.combinedAvailableCents} />
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">
              Selected
            </p>
            <p className="text-xs text-muted">{names.join(", ")}</p>
          </div>

          {kind === "move" && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                Destination group
              </span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="input"
              >
                <option value="">Choose group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {kind === "merge" && (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                  Destination category
                </span>
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="input"
                >
                  <option value="">Choose destination…</option>
                  {destinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {mergePreview && (
                <div className="rounded-lg border border-border bg-canvas p-3 text-xs space-y-1">
                  <p className="font-medium">Merge preview</p>
                  <p>{mergePreview.sourceCount} source(s) → destination</p>
                  <p>
                    {mergePreview.transactionCount} transactions,{" "}
                    {mergePreview.budgetHistoryCount} budget months,{" "}
                    {mergePreview.scheduledCount} scheduled,{" "}
                    {mergePreview.targetCount} targets,{" "}
                    {mergePreview.payeeRules} payee rules
                  </p>
                </div>
              )}
            </>
          )}

          {kind === "delete" && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
                Deletion option
              </legend>
              {(
                [
                  ["safe_only", "A. Delete safe categories only"],
                  ["budget_history", "B. Delete categories and budget history"],
                  ["reassign", "C. Reassign history then delete"],
                  ["force_uncategorized", "D. Reassign to Uncategorized"],
                  ["archive_unsafe", "E. Archive unsafe categories"],
                ] as const
              ).map(([id, label]) => (
                <label
                  key={id}
                  className="flex gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <input
                    type="radio"
                    name="bulk-delete-mode"
                    checked={deleteMode === id}
                    onChange={() => setDeleteMode(id)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[28rem] text-xs">
                  <thead className="bg-canvas text-left text-muted">
                    <tr>
                      <th className="px-2 py-1.5">Category</th>
                      <th className="px-2 py-1.5">Group</th>
                      <th className="px-2 py-1.5 text-right">Txns</th>
                      <th className="px-2 py-1.5 text-right">Budgets</th>
                      <th className="px-2 py-1.5 text-right">Targets</th>
                      <th className="px-2 py-1.5 text-right">Sched</th>
                      <th className="px-2 py-1.5">Recommended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.categoryId} className="border-t border-border/70">
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 text-muted">{r.groupName}</td>
                        <td className="px-2 py-1.5 text-right">
                          {r.transactionCount}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {r.budgetRecordCount}
                        </td>
                        <td className="px-2 py-1.5 text-right">{r.targetCount}</td>
                        <td className="px-2 py-1.5 text-right">
                          {r.scheduledCount}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          {r.recommended.replaceAll("_", " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {deleteMode === "reassign" && (
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="input"
                >
                  <option value="">Destination category…</option>
                  {destinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {deleteMode === "force_uncategorized" && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={forceConfirm}
                    onChange={(e) => setForceConfirm(e.target.checked)}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  I understand transactions will move to Uncategorized.
                </label>
              )}
            </fieldset>
          )}

          {needsBalance && kind !== "move" && (
            <fieldset className="space-y-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Available balance (
                <MoneyText cents={summary.combinedAvailableCents} />)
              </legend>
              {(
                [
                  ["ready_to_assign", "Move combined balance to Ready to Assign"],
                  ["move_to_category", "Move combined balance to one category"],
                  ["keep_historical", "Preserve in historical months only"],
                  ["review_each", "Review each category separately"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex gap-2 text-sm">
                  <input
                    type="radio"
                    name="bulk-available"
                    checked={availableChoice === id}
                    onChange={() => setAvailableChoice(id)}
                    className="accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
              {availableChoice === "move_to_category" && (
                <select
                  value={availableDest}
                  onChange={(e) => setAvailableDest(e.target.value)}
                  className="input"
                >
                  <option value="">Choose category…</option>
                  {destinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="min-h-11 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
