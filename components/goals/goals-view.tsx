"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  Wrench,
  Archive,
  ExternalLink,
} from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildGoalsSummary,
  filterGoals,
  type GoalFilter,
  type GoalProgress,
} from "@/lib/calculations/goals";
import { detectGoalIssues } from "@/lib/goals/repair";
import {
  goalTypeLabel,
  goalTypesForLink,
  isContributionGoalType,
  isDateBasedGoalType,
} from "@/lib/goals/types";
import { GoalCategoryCombobox } from "@/components/goals/goal-category-combobox";
import { GoalAccountCombobox } from "@/components/goals/goal-account-combobox";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { GoalLinkType, TargetType } from "@/lib/types/budget";

const FILTERS: { id: GoalFilter; label: string }[] = [
  { id: "all", label: "All Goals" },
  { id: "category", label: "Category Goals" },
  { id: "account", label: "Account Goals" },
  { id: "on_track", label: "On Track" },
  { id: "underfunded", label: "Underfunded" },
  { id: "due_soon", label: "Due Soon" },
  { id: "completed", label: "Completed" },
  { id: "needs_review", label: "Needs Review" },
];

const STATUS_LABEL: Record<GoalProgress["status"], string> = {
  on_track: "On Track",
  underfunded: "Underfunded",
  due_soon: "Due Soon",
  overdue: "Overdue",
  completed: "Completed",
  needs_review: "Needs Review",
};

export function GoalsView() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const addTarget = useBudgetStore((s) => s.addTarget);
  const updateTarget = useBudgetStore((s) => s.updateTarget);
  const deleteTarget = useBudgetStore((s) => s.deleteTarget);
  const archiveTarget = useBudgetStore((s) => s.archiveTarget);
  const repairDuplicateGoals = useBudgetStore((s) => s.repairDuplicateGoals);
  const reconnectGoal = useBudgetStore((s) => s.reconnectGoal);

  const [filter, setFilter] = useState<GoalFilter>("all");
  const [editor, setEditor] = useState<
    null | { mode: "add" } | { mode: "edit"; targetId: string }
  >(null);
  const [reconnectFor, setReconnectFor] = useState<string | null>(null);
  const [reconnectLink, setReconnectLink] = useState<GoalLinkType>("category");
  const [reconnectId, setReconnectId] = useState("");
  const [repairMessage, setRepairMessage] = useState<string | null>(null);

  const summary = useMemo(
    () => buildGoalsSummary(plan, monthKey),
    [plan, monthKey],
  );
  const issues = useMemo(() => detectGoalIssues(plan), [plan]);
  const visible = filterGoals(summary.goals, filter);
  const summaryGoalCount =
    summary.onTrackCount +
    summary.completedCount +
    summary.underfundedCount +
    summary.dueSoonCount +
    summary.overdueCount;

  function confirmDelete(targetId: string) {
    if (
      !confirm(
        "Delete this goal? The category, account, transactions, and budget history will not be deleted.",
      )
    ) {
      return;
    }
    deleteTarget(targetId);
    if (editor?.mode === "edit" && editor.targetId === targetId) {
      setEditor(null);
    }
  }

  return (
    <div className="px-4 py-4 md:px-6 space-y-5 max-w-6xl overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="mt-1 text-sm text-muted">
            Link goals to categories or accounts. Category goals use assigned or
            available; account goals use balances and contributions.
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

      {issues.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-warning">
                {issues.length} goal{issues.length === 1 ? "" : "s"} need review
              </p>
              <p className="text-xs text-muted mt-0.5">
                Broken links stay Needs Review — they are never auto-assigned to
                Uncategorized.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const result = repairDuplicateGoals();
                if (!result.ok) {
                  setRepairMessage(result.error ?? "Repair failed");
                  return;
                }
                setRepairMessage(
                  result.removedCount
                    ? `Removed ${result.removedCount} duplicate goal(s).`
                    : "No duplicate goals to remove.",
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-black/5"
            >
              <Wrench className="h-3.5 w-3.5" />
              Remove duplicates
            </button>
          </div>
          {repairMessage && (
            <p className="text-xs text-muted">{repairMessage}</p>
          )}
        </div>
      )}

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
              / {summaryGoalCount}
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
          </button>
        ))}
      </div>

      {editor && (
        <GoalEditor
          mode={editor.mode}
          targetId={editor.mode === "edit" ? editor.targetId : undefined}
          onClose={() => setEditor(null)}
          onDelete={
            editor.mode === "edit"
              ? () => confirmDelete(editor.targetId)
              : undefined
          }
          onSave={(data) => {
            if (editor.mode === "add") {
              const result = addTarget(data);
              if (!result.ok) {
                alert(result.error);
                return;
              }
            } else {
              const result = updateTarget(editor.targetId, data);
              if (!result.ok) {
                alert(result.error ?? "Could not update goal.");
                return;
              }
            }
            setEditor(null);
          }}
        />
      )}

      {visible.length === 0 ? (
        <EmptyGoals
          hasAny={summary.goals.some((g) => !g.paused)}
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
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <LinkBadge linkType={goal.linkType} />
                    <StatusBadge status={goal.status} />
                  </div>
                  <h2 className="font-semibold tracking-tight truncate">
                    {goal.name}
                  </h2>
                  <p className="text-xs text-muted truncate">
                    {goal.linkedName} · {goal.groupOrSection}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <Metric label="Target" cents={goal.targetAmountCents} />
                <Metric label="Funded" cents={goal.fundedCents} />
                <Metric label="Remaining" cents={goal.remainingCents} />
              </div>

              {goal.overfundedCents > 0 && (
                <p className="text-xs text-success">
                  Overfunded by <MoneyText cents={goal.overfundedCents} />
                </p>
              )}
              {goal.overspendingCents > 0 && (
                <p className="text-xs text-danger">
                  Overspending <MoneyText cents={goal.overspendingCents} />
                </p>
              )}

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
                        : goal.status === "needs_review"
                          ? "bg-muted"
                          : goal.status === "underfunded" ||
                              goal.status === "due_soon" ||
                              goal.status === "overdue"
                            ? "bg-warning"
                            : "bg-accent",
                    )}
                    style={{ width: `${goal.percent}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted">{goalTypeLabel(goal.type)}</p>

              {reconnectFor === goal.targetId && (
                <div className="space-y-2 rounded-lg border border-border p-2">
                  <select
                    className="input"
                    value={reconnectLink}
                    onChange={(e) => {
                      setReconnectLink(e.target.value as GoalLinkType);
                      setReconnectId("");
                    }}
                  >
                    <option value="category">Category</option>
                    <option value="account">Account</option>
                  </select>
                  {reconnectLink === "category" ? (
                    <GoalCategoryCombobox
                      plan={plan}
                      value={reconnectId}
                      onChange={setReconnectId}
                      excludeCategoryIds={
                        new Set(
                          plan.targets
                            .filter(
                              (t) =>
                                !t.paused &&
                                t.linkType === "category" &&
                                t.categoryId &&
                                t.id !== goal.targetId,
                            )
                            .map((t) => t.categoryId!),
                        )
                      }
                    />
                  ) : (
                    <GoalAccountCombobox
                      plan={plan}
                      value={reconnectId}
                      onChange={setReconnectId}
                      excludeAccountIds={
                        new Set(
                          plan.targets
                            .filter(
                              (t) =>
                                !t.paused &&
                                t.linkType === "account" &&
                                t.accountId &&
                                t.id !== goal.targetId &&
                                !t.allowDuplicateAccountGoal,
                            )
                            .map((t) => t.accountId!),
                        )
                      }
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white"
                      onClick={() => {
                        if (!reconnectId) return;
                        const result =
                          reconnectLink === "category"
                            ? reconnectGoal(goal.targetId, {
                                linkType: "category",
                                categoryId: reconnectId,
                              })
                            : reconnectGoal(goal.targetId, {
                                linkType: "account",
                                accountId: reconnectId,
                              });
                        if (!result.ok) {
                          alert(result.error);
                          return;
                        }
                        setReconnectFor(null);
                        setReconnectId("");
                      }}
                    >
                      Reconnect
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-xs"
                      onClick={() => setReconnectFor(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1 pt-1">
                {goal.linkType === "category" && goal.categoryId && (
                  <Link
                    href={`/plan?category=${goal.categoryId}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-black/5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Category
                  </Link>
                )}
                {goal.linkType === "account" && goal.accountId && (
                  <Link
                    href={`/accounts/${goal.accountId}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-black/5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Account
                  </Link>
                )}
                {(goal.isBrokenLink || goal.isDuplicate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReconnectFor(goal.targetId);
                      setReconnectLink(goal.linkType);
                      setReconnectId("");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-black/5"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setEditor({ mode: "edit", targetId: goal.targetId })
                  }
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => archiveTarget(goal.targetId, true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-black/5"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(goal.targetId)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkBadge({ linkType }: { linkType: GoalLinkType }) {
  return (
    <span className="shrink-0 rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-muted">
      {linkType === "account" ? "Account Goal" : "Category Goal"}
    </span>
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
        status === "overdue" && "bg-danger/15 text-danger",
        status === "needs_review" && "bg-black/10 text-muted",
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
          ? "Try another filter, or add a new goal."
          : "Create a goal linked to a category or account."}
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
  onDelete,
}: {
  mode: "add" | "edit";
  targetId?: string;
  onClose: () => void;
  onDelete?: () => void;
  onSave: (data: {
    name?: string;
    linkType: GoalLinkType;
    categoryId?: string | null;
    accountId?: string | null;
    type: TargetType;
    amountCents: number;
    baselineAmountCents?: number;
    dueDate?: string;
    repeatRule?: string;
    notes?: string;
    includeTransfers?: boolean;
    includeAdjustments?: boolean;
  }) => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const existing = targetId
    ? plan.targets.find((t) => t.id === targetId)
    : undefined;

  const [linkType, setLinkType] = useState<GoalLinkType>(
    existing?.linkType ?? "category",
  );
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [accountId, setAccountId] = useState(existing?.accountId ?? "");
  const [type, setType] = useState<TargetType>(
    existing?.type ?? "monthly_fixed",
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [nameTouched, setNameTouched] = useState(Boolean(existing?.name));
  const [amount, setAmount] = useState(
    existing ? (existing.amountCents / 100).toFixed(2) : "",
  );
  const [baseline, setBaseline] = useState(
    existing?.baselineAmountCents != null
      ? (existing.baselineAmountCents / 100).toFixed(2)
      : "",
  );
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [repeatRule, setRepeatRule] = useState(
    existing?.repeatRule ?? existing?.cadence ?? "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [includeTransfers, setIncludeTransfers] = useState(
    existing?.includeTransfers ?? true,
  );
  const [includeAdjustments, setIncludeAdjustments] = useState(
    existing?.includeAdjustments ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const typeOptions = goalTypesForLink(linkType);

  const excludeCategoryIds = useMemo(
    () =>
      new Set(
        plan.targets
          .filter(
            (t) =>
              !t.paused &&
              t.linkType === "category" &&
              t.categoryId &&
              t.id !== existing?.id,
          )
          .map((t) => t.categoryId!),
      ),
    [plan.targets, existing?.id],
  );

  const excludeAccountIds = useMemo(
    () =>
      new Set(
        plan.targets
          .filter(
            (t) =>
              !t.paused &&
              t.linkType === "account" &&
              t.accountId &&
              t.id !== existing?.id &&
              !t.allowDuplicateAccountGoal,
          )
          .map((t) => t.accountId!),
      ),
    [plan.targets, existing?.id],
  );

  function applyDefaultName(nextLink: GoalLinkType, id: string) {
    if (nameTouched) return;
    if (nextLink === "category") {
      const cat = plan.categories.find((c) => c.id === id);
      if (cat) setName(cat.name);
    } else {
      const acct = plan.accounts.find((a) => a.id === id);
      if (acct) setName(acct.name);
    }
  }

  return (
    <form
      className="rounded-xl border border-border bg-surface p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseMoneyInput(amount);
        const baselineParsed = baseline.trim()
          ? parseMoneyInput(baseline)
          : null;
        if (linkType === "category" && !categoryId) {
          setError("Category is required.");
          return;
        }
        if (linkType === "account" && !accountId) {
          setError("Account is required.");
          return;
        }
        if (parsed === null) {
          setError("Enter a valid target amount.");
          return;
        }
        if (type !== "debt_payoff" && parsed <= 0) {
          setError("Target amount must be greater than zero.");
          return;
        }
        if (isDateBasedGoalType(type) && !dueDate) {
          setError("Due date is required for date-based goals.");
          return;
        }
        if (!typeOptions.some((t) => t.value === type)) {
          setError("Choose a compatible goal type for this link.");
          return;
        }
        onSave({
          name: name.trim() || undefined,
          linkType,
          categoryId: linkType === "category" ? categoryId : null,
          accountId: linkType === "account" ? accountId : null,
          type,
          amountCents: parsed,
          baselineAmountCents:
            baselineParsed === null ? undefined : baselineParsed,
          dueDate: dueDate || undefined,
          repeatRule: repeatRule.trim() || undefined,
          notes: notes.trim() || undefined,
          includeTransfers: isContributionGoalType(type)
            ? includeTransfers
            : undefined,
          includeAdjustments: isContributionGoalType(type)
            ? includeAdjustments
            : undefined,
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
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Goal name
          </span>
          <input
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            className="input"
            placeholder="Auto-fills from category or account"
          />
        </label>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Link Goal To
          </legend>
          <div className="flex gap-2">
            {(["category", "account"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setLinkType(opt);
                  const nextTypes = goalTypesForLink(opt);
                  if (!nextTypes.some((t) => t.value === type)) {
                    setType(nextTypes[0]!.value);
                  }
                  if (opt === "category") setAccountId("");
                  else setCategoryId("");
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium border",
                  linkType === opt
                    ? "bg-accent text-white border-accent"
                    : "bg-surface border-border text-muted",
                )}
              >
                {opt === "category" ? "Category" : "Account"}
              </button>
            ))}
          </div>
        </fieldset>

        {linkType === "category" ? (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Category
            </span>
            <GoalCategoryCombobox
              plan={plan}
              value={categoryId}
              excludeCategoryIds={excludeCategoryIds}
              onChange={(id) => {
                setCategoryId(id);
                applyDefaultName("category", id);
              }}
            />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Account
            </span>
            <GoalAccountCombobox
              plan={plan}
              value={accountId}
              excludeAccountIds={excludeAccountIds}
              onChange={(id) => {
                setAccountId(id);
                applyDefaultName("account", id);
              }}
            />
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Goal type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TargetType)}
            className="input"
          >
            {typeOptions.map((t) => (
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

        {(type === "debt_payoff" || type === "maintain_minimum_balance") && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Baseline / starting amount
            </span>
            <input
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
              className="input"
              inputMode="decimal"
              placeholder="Optional"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Due date{isDateBasedGoalType(type) ? " (required)" : ""}
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input"
            required={isDateBasedGoalType(type)}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            Repeat cadence
          </span>
          <input
            value={repeatRule}
            onChange={(e) => setRepeatRule(e.target.value)}
            className="input"
            placeholder="e.g. monthly, weekly"
          />
        </label>

        {isContributionGoalType(type) && (
          <>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={includeTransfers}
                onChange={(e) => setIncludeTransfers(e.target.checked)}
              />
              Include transfers into the account
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={includeAdjustments}
                onChange={(e) => setIncludeAdjustments(e.target.checked)}
              />
              Include adjustments
            </label>
          </>
        )}

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
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger"
          >
            Delete Goal
          </button>
        )}
      </div>
    </form>
  );
}
