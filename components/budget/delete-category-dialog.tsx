"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildCategoryDeletePreview,
  type AvailableDisposition,
  type CategoryDeleteMode,
} from "@/lib/categories/deletion";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { getSelectableCategories } from "@/lib/categories/lifecycle";

export function DeleteCategoryDialog({
  categoryId,
  open,
  onClose,
  onDeleted,
}: {
  categoryId: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const deleteCategoryWithStrategy = useBudgetStore(
    (s) => s.deleteCategoryWithStrategy,
  );

  const preview = useMemo(
    () => buildCategoryDeletePreview(plan, categoryId, monthKey),
    [plan, categoryId, monthKey],
  );

  const destinations = useMemo(
    () =>
      getSelectableCategories(plan, { includeHidden: true }).filter(
        (c) => c.id !== categoryId,
      ),
    [plan, categoryId],
  );

  const [mode, setMode] = useState<CategoryDeleteMode | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [forceConfirm, setForceConfirm] = useState(false);
  const [availableChoice, setAvailableChoice] = useState<
    AvailableDisposition["type"] | ""
  >("");
  const [availableDest, setAvailableDest] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open || !preview) return null;

  const needsAvailable =
    preview.availableCents !== 0 && mode != null && mode !== null;
  const recommendedLabel =
    preview.recommended === "archive"
      ? "Remove from current and future budget only"
      : preview.recommended === "move_then_delete"
        ? "Move history, then delete"
        : "Delete category and budget history";

  function buildAvailable(): AvailableDisposition | undefined {
    if (preview!.availableCents === 0) return undefined;
    if (!availableChoice) return undefined;
    if (availableChoice === "ready_to_assign") {
      return { type: "ready_to_assign" };
    }
    if (availableChoice === "keep_historical") {
      return { type: "keep_historical" };
    }
    return {
      type: "move_to_category",
      categoryId: availableDest,
    };
  }

  function submit() {
    setError(null);
    if (!mode) {
      setError("Choose how to handle this category.");
      return;
    }
    if (needsAvailable && !availableChoice) {
      setError("Choose what to do with the available balance.");
      return;
    }
    if (
      availableChoice === "move_to_category" &&
      (!availableDest || availableDest === categoryId)
    ) {
      setError("Choose a destination category for available funds.");
      return;
    }

    const available = buildAvailable();

    if (mode === "budget_history") {
      const result = deleteCategoryWithStrategy(categoryId, {
        mode: "budget_history",
        confirmedName: confirmName,
        available,
      });
      if (!result.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
    } else if (mode === "move_then_delete") {
      if (!destinationId) {
        setError("Choose a destination category.");
        return;
      }
      const result = deleteCategoryWithStrategy(categoryId, {
        mode: "move_then_delete",
        destinationId,
        available: available ?? { type: "keep_historical" },
      });
      if (!result.ok) {
        setError(result.error ?? "Move and delete failed.");
        return;
      }
    } else if (mode === "archive") {
      const result = deleteCategoryWithStrategy(categoryId, {
        mode: "archive",
        available,
      });
      if (!result.ok) {
        setError(result.error ?? "Archive failed.");
        return;
      }
    } else if (mode === "force_uncategorized") {
      if (!forceConfirm) {
        setError("Confirm the second step for force delete.");
        return;
      }
      const result = deleteCategoryWithStrategy(categoryId, {
        mode: "force_uncategorized",
        confirmForce: true,
        available,
      });
      if (!result.ok) {
        setError(result.error ?? "Force delete failed.");
        return;
      }
    }

    onDeleted?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-category-title"
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-surface shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 id="delete-category-title" className="text-lg font-semibold">
            Delete Category
          </h2>
          <p className="mt-1 text-xs text-muted">
            Choose how to handle history. Recommended when history exists:{" "}
            {recommendedLabel}.
          </p>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-canvas p-3 text-xs">
            <Stat label="Category" value={preview.name} />
            <Stat label="Group" value={preview.groupName} />
            <Stat
              label="Transactions"
              value={String(preview.transactionCount)}
            />
            <Stat
              label="Monthly budgets"
              value={String(preview.budgetHistoryCount)}
            />
            <Stat
              label="Scheduled"
              value={String(preview.scheduledCount)}
            />
            <Stat label="Targets" value={String(preview.targetCount)} />
            <div>
              <dt className="text-muted">Available (this month)</dt>
              <dd className="font-semibold">
                <MoneyText cents={preview.availableCents} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Activity range</dt>
              <dd className="font-semibold">
                {preview.earliestActivity
                  ? `${formatDisplayDate(preview.earliestActivity)} – ${formatDisplayDate(preview.latestActivity!)}`
                  : "—"}
              </dd>
            </div>
          </dl>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
              Deletion choice
            </legend>

            <Choice
              checked={mode === "budget_history"}
              disabled={!preview.canDeleteBudgetHistory}
              onChange={() => setMode("budget_history")}
              title="A. Delete category and budget history"
              description="Permanently remove monthly assigned/activity/available history and targets. Only when there are no transactions or linked records."
            />
            {mode === "budget_history" && (
              <div className="ml-6 space-y-2">
                <label className="block text-xs">
                  Type <span className="font-semibold">{preview.name}</span> to
                  confirm
                  <input
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="input mt-1"
                  />
                </label>
              </div>
            )}

            <Choice
              checked={mode === "move_then_delete"}
              onChange={() => setMode("move_then_delete")}
              title="B. Move history, then delete"
              description="Move transactions, budgets, scheduled items, targets, and payee/import mappings to another category, then remove this one."
            />
            {mode === "move_then_delete" && (
              <select
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                className="input ml-6"
              >
                <option value="">Choose destination…</option>
                {destinations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <Choice
              checked={mode === "archive"}
              onChange={() => setMode("archive")}
              title="C. Remove from current and future budget only"
              description="Recommended when history exists. Preserves reports and transactions; archives the category."
              recommended={preview.recommended === "archive" || preview.hasHardLinks}
            />

            <Choice
              checked={mode === "force_uncategorized"}
              onChange={() => setMode("force_uncategorized")}
              title="D. Force delete with Uncategorized reassignment"
              description="Reassign transactions and scheduled items to Uncategorized, delete budgets/targets, keep audit history."
            />
            {mode === "force_uncategorized" && (
              <label className="ml-6 flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  I understand transactions will move to Uncategorized and this
                  cannot leave broken category references.
                </span>
              </label>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-black/5"
            >
              <span className="font-medium">E. Cancel</span>
              <span className="mt-0.5 block text-xs text-muted">
                Keep the category unchanged.
              </span>
            </button>
          </fieldset>

          {needsAvailable && mode !== null && (
            <fieldset className="space-y-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                Available balance (
                <MoneyText cents={preview.availableCents} />)
              </legend>
              <AvailableChoice
                checked={availableChoice === "ready_to_assign"}
                onChange={() => setAvailableChoice("ready_to_assign")}
                title="Move to Ready to Assign"
                description="Adjust assigned so available returns to RTA."
              />
              <AvailableChoice
                checked={availableChoice === "move_to_category"}
                onChange={() => setAvailableChoice("move_to_category")}
                title="Move to another category"
                description="Transfer this month’s available to a different category."
              />
              {availableChoice === "move_to_category" && (
                <select
                  value={availableDest}
                  onChange={(e) => setAvailableDest(e.target.value)}
                  className="input ml-6"
                >
                  <option value="">Choose category…</option>
                  {destinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <AvailableChoice
                checked={availableChoice === "keep_historical"}
                onChange={() => setAvailableChoice("keep_historical")}
                title="Keep only in historical months"
                description={
                  mode === "budget_history"
                    ? "Not available when deleting budget history."
                    : "Leave balances as recorded in past months."
                }
                disabled={mode === "budget_history"}
              />
            </fieldset>
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
            disabled={mode === null}
            onClick={submit}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Choice({
  checked,
  onChange,
  title,
  description,
  disabled,
  recommended,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  disabled?: boolean;
  recommended?: boolean;
}) {
  return (
    <label
      className={`flex gap-2 rounded-lg border px-3 py-2 ${
        disabled
          ? "opacity-50 border-border"
          : checked
            ? "border-accent bg-accent-muted/40"
            : "border-border hover:bg-black/5"
      }`}
    >
      <input
        type="radio"
        name="delete-mode"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 accent-[var(--accent)]"
      />
      <span>
        <span className="font-medium">
          {title}
          {recommended ? (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
              Recommended
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

function AvailableChoice({
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex gap-2 rounded-lg border px-3 py-2 ${
        disabled
          ? "opacity-50 border-border"
          : checked
            ? "border-accent bg-accent-muted/40"
            : "border-border hover:bg-black/5"
      }`}
    >
      <input
        type="radio"
        name="available-disposition"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 accent-[var(--accent)]"
      />
      <span>
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}
