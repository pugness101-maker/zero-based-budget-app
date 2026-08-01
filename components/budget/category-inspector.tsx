"use client";

import { X, AlertTriangle } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import { MoneyText } from "@/components/shared/money-text";
import { DisabledAction } from "@/components/shared/disabled-action";
import { formatDisplayDate } from "@/lib/dates";

export function CategoryInspector({
  onEditCategory,
}: {
  onEditCategory?: (categoryId: string) => void;
} = {}) {
  const selectedCategoryId = useBudgetStore((s) => s.selectedCategoryId);
  const setSelectedCategory = useBudgetStore((s) => s.setSelectedCategory);
  const hideCategory = useBudgetStore((s) => s.hideCategory);
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);

  if (!selectedCategoryId) return null;

  const summary = buildPlanMonthSummary(plan, monthKey);
  const category = summary.groups
    .flatMap((g) => g.categories)
    .find((c) => c.categoryId === selectedCategoryId);
  const group = summary.groups.find((g) =>
    g.categories.some((c) => c.categoryId === selectedCategoryId),
  );
  const meta = plan.categories.find((c) => c.id === selectedCategoryId);
  const target = plan.targets.find((t) => t.categoryId === selectedCategoryId);

  // Hidden categories still openable from settings — fall back to meta
  const displayName = category?.name ?? meta?.name;
  const displayGroup =
    group?.name ??
    plan.categoryGroups.find((g) => g.id === meta?.groupId)?.name;

  const recent = plan.transactions
    .filter(
      (t) =>
        t.categoryId === selectedCategoryId ||
        t.splits?.some((s) => s.categoryId === selectedCategoryId),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  if (!meta || !displayName) return null;

  const availableCents = category?.availableCents ?? 0;
  const assignedCents = category?.assignedCents ?? 0;
  const activityCents = category?.activityCents ?? 0;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-ink/20 md:bg-transparent"
        aria-label="Close inspector"
        onClick={() => setSelectedCategory(null)}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[360px] md:rounded-none md:border-l"
        role="dialog"
        aria-label={`${displayName} details`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <div>
            <p className="text-xs text-muted">{displayGroup ?? "Category"}</p>
            <h2 className="text-lg font-semibold tracking-tight">
              {displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="rounded-lg p-2 hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Available" cents={availableCents} />
            <Metric label="Assigned" cents={assignedCents} />
            <Metric label="Activity" cents={activityCents} signed />
          </div>

          {category?.overspendingType && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {category.overspendingType === "credit"
                  ? "Credit overspending — card purchase exceeded available funds."
                  : "Cash overspending — cover this before assigning more elsewhere."}
              </p>
            </div>
          )}

          {target && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Target
              </p>
              <p className="mt-1 text-sm">
                <MoneyText cents={target.amountCents} /> /{" "}
                {target.type.replaceAll("_", " ")}
              </p>
              {(category?.underfundedCents ?? 0) > 0 && (
                <p className="mt-1 text-sm text-warning">
                  Underfunded by{" "}
                  <MoneyText cents={category!.underfundedCents} />
                </p>
              )}
            </div>
          )}

          {meta?.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Notes
              </p>
              <p className="mt-1 text-sm">{meta.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Recent transactions
            </p>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">No transactions yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {recent.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.payeeName}</p>
                      <p className="text-xs text-muted">
                        {formatDisplayDate(t.date)}
                      </p>
                    </div>
                    <MoneyText cents={t.amountCents} signed />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {onEditCategory && (
              <button
                type="button"
                onClick={() => onEditCategory(selectedCategoryId)}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Edit Category
              </button>
            )}
            <button
              type="button"
              onClick={() => hideCategory(selectedCategoryId)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
            >
              Hide
            </button>
            <DisabledAction
              label="Move Money"
              reason="Move Money between categories ships next."
            />
          </div>
        </div>
      </aside>
    </>
  );
}

function Metric({
  label,
  cents,
  signed,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-semibold">
        <MoneyText cents={cents} signed={signed} />
      </p>
    </div>
  );
}
