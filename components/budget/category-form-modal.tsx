"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { parseMoneyInput } from "@/lib/money";
import type { Category, TargetType } from "@/lib/types/budget";
import { buildMergePreview } from "@/lib/categories/lifecycle";
import { DeleteCategoryDialog } from "@/components/budget/delete-category-dialog";
import { formatDisplayDate } from "@/lib/dates";

export function CategoryFormModal({
  open,
  onClose,
  mode,
  categoryId,
  defaultGroupId,
}: {
  open: boolean;
  onClose: () => void;
  mode: "add" | "edit";
  categoryId?: string;
  defaultGroupId?: string;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const addCategory = useBudgetStore((s) => s.addCategory);
  const editCategory = useBudgetStore((s) => s.editCategory);
  const hideCategory = useBudgetStore((s) => s.hideCategory);
  const archiveCategory = useBudgetStore((s) => s.archiveCategory);
  const mergeCategories = useBudgetStore((s) => s.mergeCategories);

  const existing = categoryId
    ? plan.categories.find((c) => c.id === categoryId)
    : undefined;

  if (!open) return null;
  if (mode === "edit" && !existing) return null;

  return (
    <CategoryForm
      key={`${mode}-${categoryId ?? defaultGroupId ?? "new"}`}
      mode={mode}
      existing={existing}
      defaultGroupId={
        defaultGroupId ?? existing?.groupId ?? plan.categoryGroups[0]?.id
      }
      monthKey={monthKey}
      groups={plan.categoryGroups.filter((g) => !g.deletedAt && !g.hidden)}
      allCategories={plan.categories.filter((c) => !c.deletedAt)}
      onClose={onClose}
      onAdd={addCategory}
      onEdit={editCategory}
      onHide={hideCategory}
      onArchive={archiveCategory}
      onMerge={mergeCategories}
    />
  );
}

function CategoryForm({
  mode,
  existing,
  defaultGroupId,
  monthKey,
  groups,
  allCategories,
  onClose,
  onAdd,
  onEdit,
  onHide,
  onArchive,
  onMerge,
}: {
  mode: "add" | "edit";
  existing?: Category;
  defaultGroupId?: string;
  monthKey: string;
  groups: { id: string; name: string }[];
  allCategories: Category[];
  onClose: () => void;
  onAdd: ReturnType<typeof useBudgetStore.getState>["addCategory"];
  onEdit: ReturnType<typeof useBudgetStore.getState>["editCategory"];
  onHide: ReturnType<typeof useBudgetStore.getState>["hideCategory"];
  onArchive: ReturnType<typeof useBudgetStore.getState>["archiveCategory"];
  onMerge: ReturnType<typeof useBudgetStore.getState>["mergeCategories"];
}) {
  const plan = useBudgetStore((s) => s.plan);
  const [name, setName] = useState(existing?.name ?? "");
  const [groupId, setGroupId] = useState(defaultGroupId ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [rollover, setRollover] = useState(existing?.rollover ?? true);
  const [pinned, setPinned] = useState(Boolean(existing?.pinned));
  const [hidden, setHidden] = useState(Boolean(existing?.hidden));
  const [reportIncluded, setReportIncluded] = useState(
    existing?.reportIncluded ?? true,
  );
  const [assigned, setAssigned] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("monthly_fixed");
  const [mergeInto, setMergeInto] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergePreview = useMemo(() => {
    if (!existing || !mergeInto) return null;
    return buildMergePreview(plan, existing.id, mergeInto);
  }, [plan, existing, mergeInto]);

  function save() {
    setError(null);
    if (mode === "add") {
      const starting = assigned.trim() ? parseMoneyInput(assigned) : undefined;
      if (assigned.trim() && starting === null) {
        setError("Enter a valid starting assigned amount.");
        return;
      }
      const targetCents = targetAmount.trim()
        ? parseMoneyInput(targetAmount)
        : null;
      if (targetAmount.trim() && targetCents === null) {
        setError("Enter a valid target amount.");
        return;
      }
      const result = onAdd({
        name,
        groupId,
        notes: notes || undefined,
        rollover,
        pinned,
        monthKey,
        startingAssignedCents: starting ?? undefined,
        target:
          targetCents != null
            ? { type: targetType, amountCents: targetCents }
            : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Could not add category.");
        return;
      }
      onClose();
      return;
    }

    if (!existing) return;
    const result = onEdit(existing.id, {
      name,
      groupId,
      notes: notes || null,
      rollover,
      pinned,
      hidden,
      reportIncluded,
    });
    if (!result.ok) {
      setError(result.error ?? "Could not save.");
      return;
    }
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-lg font-semibold">
              {mode === "add" ? "Add Category" : "Edit Category"}
            </h2>
          </div>
          <div className="p-4 space-y-3">
            <Field label="Category name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label="Category group">
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="input"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input min-h-[3.5rem]"
              />
            </Field>
            <label className="flex items-center justify-between text-sm">
              <span>Rollover leftover available</span>
              <input
                type="checkbox"
                checked={rollover}
                onChange={(e) => setRollover(e.target.checked)}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Pinned</span>
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="accent-[var(--accent)]"
              />
            </label>
            {mode === "edit" && (
              <>
                <label className="flex items-center justify-between text-sm">
                  <span>Hidden</span>
                  <input
                    type="checkbox"
                    checked={hidden}
                    onChange={(e) => setHidden(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span>Include in reports</span>
                  <input
                    type="checkbox"
                    checked={reportIncluded}
                    onChange={(e) => setReportIncluded(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                </label>
              </>
            )}
            {mode === "add" && (
              <>
                <Field label="Starting assigned (this month, optional)">
                  <input
                    value={assigned}
                    onChange={(e) => setAssigned(e.target.value)}
                    className="input"
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Target type (optional)">
                    <select
                      value={targetType}
                      onChange={(e) =>
                        setTargetType(e.target.value as TargetType)
                      }
                      className="input"
                    >
                      <option value="monthly_fixed">Monthly fixed</option>
                      <option value="weekly_fixed">Weekly fixed</option>
                      <option value="refill">Refill</option>
                      <option value="save_by_date">Save by date</option>
                      <option value="custom">Custom</option>
                    </select>
                  </Field>
                  <Field label="Target amount">
                    <input
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      className="input"
                      inputMode="decimal"
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </>
            )}

            {mode === "edit" && existing && (
              <div className="rounded-lg border border-border bg-canvas p-3 space-y-2 text-xs">
                <p className="font-semibold text-muted uppercase tracking-wider">
                  Merge into…
                </p>
                <select
                  value={mergeInto}
                  onChange={(e) => setMergeInto(e.target.value)}
                  className="input"
                >
                  <option value="">Select destination</option>
                  {allCategories
                    .filter((c) => c.id !== existing.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {mergePreview && (
                  <div className="rounded-md border border-border bg-surface p-2 space-y-1">
                    <p className="font-medium">Merge preview</p>
                    <p>
                      {mergePreview.transactionCount} transaction(s),{" "}
                      {mergePreview.budgetHistoryCount} budget month(s),{" "}
                      {mergePreview.scheduledCount} scheduled,{" "}
                      {mergePreview.targetCount} target(s)
                    </p>
                    <p className="text-muted">
                      {mergePreview.dateRange.start
                        ? `${formatDisplayDate(mergePreview.dateRange.start)} – ${formatDisplayDate(mergePreview.dateRange.end!)}`
                        : "No dated activity"}
                    </p>
                    <p className="text-muted">
                      Historical month totals are combined; Ready to Assign is
                      recalculated. Undoable.
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!mergeInto || !mergePreview}
                    onClick={() => {
                      if (
                        !confirm(
                          "Merge this category into the selected destination? This is undoable.",
                        )
                      ) {
                        return;
                      }
                      const result = onMerge(existing.id, mergeInto);
                      if (!result.ok) {
                        setError(result.error ?? "Merge failed.");
                        return;
                      }
                      onClose();
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onHide(existing.id);
                      onClose();
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                  >
                    Hide Category
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onArchive(existing.id);
                      onClose();
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                  >
                    Archive Category
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-3">
            {mode === "edit" && existing ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger"
              >
                Delete Category
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {existing && (
        <DeleteCategoryDialog
          open={deleteOpen}
          categoryId={existing.id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={onClose}
        />
      )}
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
