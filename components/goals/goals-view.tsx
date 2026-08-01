"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildGoalsSummary,
  filterGoals,
  type GoalFilter,
  type GoalProgress,
} from "@/lib/calculations/goals";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TargetType } from "@/lib/types/budget";

const FILTERS: { id: GoalFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on_track", label: "On Track" },
  { id: "underfunded", label: "Underfunded" },
  { id: "due_soon", label: "Due Soon" },
  { id: "completed", label: "Completed" },
];

const STATUS_LABEL: Record<GoalProgress["status"], string> = {
  on_track: "On Track",
  underfunded: "Underfunded",
  due_soon: "Due Soon",
  completed: "Completed",
};

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: "monthly_fixed", label: "Monthly fixed" },
  { value: "weekly_fixed", label: "Weekly fixed" },
  { value: "refill", label: "Refill up to" },
  { value: "save_by_date", label: "Save by date" },
  { value: "custom_balance", label: "Custom balance" },
  { value: "debt_payment", label: "Debt payment" },
  { value: "custom", label: "Custom" },
];

export function GoalsView() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const addTarget = useBudgetStore((s) => s.addTarget);
  const updateTarget = useBudgetStore((s) => s.updateTarget);

  const [filter, setFilter] = useState<GoalFilter>("all");
  const [editor, setEditor] = useState<
    null | { mode: "add" } | { mode: "edit"; targetId: string }
  >(null);

  const summary = useMemo(
    () => buildGoalsSummary(plan, monthKey),
    [plan, monthKey],
  );
  const visible = filterGoals(summary.goals, filter);

  return (
    <div className="px-4 py-4 md:px-6 space-y-5 max-w-6xl overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="mt-1 text-sm text-muted">
            Targets for the selected budget month, calculated from assigned
            amounts and category available.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "add" })}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          Add Goal
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Monthly target" cents={summary.totalTargetCents} />
        <SummaryCard label="Funded" cents={summary.fundedCents} />
        <SummaryCard label="Remaining" cents={summary.remainingCents} />
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            On track
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {summary.onTrackCount + summary.completedCount}
            <span className="text-sm font-normal text-muted">
              {" "}
              / {summary.goals.length}
            </span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "bg-accent text-white"
                : "bg-surface border border-border text-muted hover:bg-black/5",
            )}
          >
            {f.label}
            {f.id !== "all" && (
              <span className="ml-1 opacity-80">
                (
                {f.id === "on_track"
                  ? summary.onTrackCount
                  : f.id === "underfunded"
                    ? summary.underfundedCount
                    : f.id === "due_soon"
                      ? summary.dueSoonCount
                      : summary.completedCount}
                )
              </span>
            )}
          </button>
        ))}
      </div>

      {editor && (
        <GoalEditor
          mode={editor.mode}
          targetId={editor.mode === "edit" ? editor.targetId : undefined}
          onClose={() => setEditor(null)}
          onSave={(data) => {
            if (editor.mode === "add") {
              addTarget(data);
            } else {
              updateTarget(editor.targetId, data);
            }
            setEditor(null);
          }}
        />
      )}

      {visible.length === 0 ? (
        <EmptyGoals
          hasAny={summary.goals.length > 0}
          onAdd={() => setEditor({ mode: "add" })}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((goal) => (
            <li
              key={goal.targetId}
              className="rounded-xl border border-border bg-surface p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{goal.groupName}</p>
                  <h2 className="font-semibold tracking-tight truncate">
                    {goal.categoryName}
                  </h2>
                </div>
                <StatusBadge status={goal.status} />
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <Metric label="Target" cents={goal.targetAmountCents} />
                <Metric label="Funded" cents={goal.fundedCents} />
                <Metric label="Remaining" cents={goal.remainingCents} />
              </div>

              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>{goal.percent}%</span>
                  {goal.dueDate && (
                    <span>Due {formatDisplayDate(goal.dueDate)}</span>
                  )}
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-black/5"
                  role="progressbar"
                  aria-valuenow={goal.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      goal.status === "completed"
                        ? "bg-success"
                        : goal.status === "underfunded" ||
                            goal.status === "due_soon"
                          ? "bg-warning"
                          : "bg-accent",
                    )}
                    style={{ width: `${goal.percent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted capitalize">
                  {goal.type.replaceAll("_", " ")}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setEditor({ mode: "edit", targetId: goal.targetId })
                  }
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Goal
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
        <MoneyText cents={cents} />
      </p>
    </div>
  );
}

function Metric({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="font-medium">
        <MoneyText cents={cents} />
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: GoalProgress["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
        status === "completed" && "bg-success/10 text-success",
        status === "on_track" && "bg-accent-muted text-accent",
        status === "underfunded" && "bg-warning/10 text-warning",
        status === "due_soon" && "bg-danger/10 text-danger",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyGoals({
  hasAny,
  onAdd,
}: {
  hasAny: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">
        {hasAny ? "No goals match this filter" : "No goals yet"}
      </h2>
      <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
        {hasAny
          ? "Try another filter, or add a new goal for a category."
          : "Create a target for a category to track funding progress this month."}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        <Plus className="h-4 w-4" />
        Add Goal
      </button>
    </div>
  );
}

function GoalEditor({
  mode,
  targetId,
  onClose,
  onSave,
}: {
  mode: "add" | "edit";
  targetId?: string;
  onClose: () => void;
  onSave: (data: {
    categoryId: string;
    type: TargetType;
    amountCents: number;
    dueDate?: string;
    notes?: string;
  }) => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const existing = targetId
    ? plan.targets.find((t) => t.id === targetId)
    : undefined;

  const categoriesWithGoals = new Set(plan.targets.map((t) => t.categoryId));
  const categoryOptions = plan.categories.filter(
    (c) =>
      !c.hidden &&
      (mode === "edit" || !categoriesWithGoals.has(c.id) || c.id === existing?.categoryId),
  );

  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? categoryOptions[0]?.id ?? "",
  );
  const [type, setType] = useState<TargetType>(
    existing?.type ?? "monthly_fixed",
  );
  const [amount, setAmount] = useState(
    existing ? (existing.amountCents / 100).toFixed(2) : "",
  );
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="rounded-xl border border-border bg-surface p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMoneyInput(amount);
        if (!categoryId) {
          setError("Choose a category.");
          return;
        }
        if (parsed === null || parsed <= 0) {
          setError("Enter a valid target amount.");
          return;
        }
        onSave({
          categoryId,
          type,
          amountCents: parsed,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
        });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          {mode === "add" ? "Add Goal" : "Edit Goal"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Category
          </span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
            disabled={mode === "edit"}
          >
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TargetType)}
            className="input"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Target amount
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Due date
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Notes
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Save goal
      </button>
    </form>
  );
}
