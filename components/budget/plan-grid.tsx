"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  StickyNote,
} from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import type { CategoryMonthMetrics, GroupMonthMetrics } from "@/lib/types/budget";
import { MoneyText } from "@/components/shared/money-text";
import { parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CategoryInspector } from "@/components/budget/category-inspector";
import { PlanSummary } from "@/components/budget/plan-summary";

export function PlanGrid() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const toggleGroupCollapsed = useBudgetStore((s) => s.toggleGroupCollapsed);
  const setSelectedCategory = useBudgetStore((s) => s.setSelectedCategory);
  const setAssigned = useBudgetStore((s) => s.setAssigned);

  const summary = buildPlanMonthSummary(plan, monthKey);

  return (
    <div>
      <PlanSummary summary={summary} />

      {/* Desktop table */}
      <div className="hidden md:block px-4 py-4 md:px-6">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold w-28">Assigned</th>
                <th className="px-3 py-2.5 font-semibold w-28">Activity</th>
                <th className="px-3 py-2.5 font-semibold w-28">Available</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((group) => (
                <GroupRows
                  key={group.groupId}
                  group={group}
                  collapsed={Boolean(
                    plan.categoryGroups.find((g) => g.id === group.groupId)
                      ?.collapsed,
                  )}
                  onToggle={() => toggleGroupCollapsed(group.groupId)}
                  onSelect={setSelectedCategory}
                  onAssign={setAssigned}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3 px-3 py-3">
        {summary.groups.map((group) => {
          const collapsed = Boolean(
            plan.categoryGroups.find((g) => g.id === group.groupId)?.collapsed,
          );
          return (
            <section
              key={group.groupId}
              className="rounded-xl border border-border bg-surface overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleGroupCollapsed(group.groupId)}
                className="flex w-full items-center justify-between px-3 py-3 text-left"
              >
                <span className="font-semibold">{group.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <MoneyText cents={group.availableCents} />
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>
              {!collapsed && (
                <ul className="divide-y divide-border border-t border-border">
                  {group.categories.map((cat) => (
                    <li key={cat.categoryId}>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(cat.categoryId)}
                        className="flex w-full flex-col gap-2 px-3 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium flex items-center gap-1.5">
                            {cat.name}
                            {cat.notes && (
                              <StickyNote className="h-3.5 w-3.5 text-muted" />
                            )}
                            {cat.overspendingType && (
                              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            )}
                          </span>
                          <MoneyText
                            cents={cat.availableCents}
                            className="font-semibold"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted">
                          <span>
                            Assigned <MoneyText cents={cat.assignedCents} />
                          </span>
                          <span>
                            Activity{" "}
                            <MoneyText cents={cat.activityCents} signed />
                          </span>
                        </div>
                        <Progress
                          assigned={cat.assignedCents}
                          target={cat.targetAmountCents}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <CategoryInspector />
    </div>
  );
}

function GroupRows({
  group,
  collapsed,
  onToggle,
  onSelect,
  onAssign,
}: {
  group: GroupMonthMetrics;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAssign: (id: string, cents: number) => void;
}) {
  return (
    <>
      <tr className="bg-canvas/80 border-t border-border">
        <td colSpan={4} className="px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-semibold hover:bg-black/5"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>{group.name}</span>
            <span className="ml-auto text-xs font-normal text-muted tabular-nums">
              <MoneyText cents={group.availableCents} /> available
            </span>
          </button>
        </td>
      </tr>
      {!collapsed &&
        group.categories.map((cat) => (
          <CategoryRow
            key={cat.categoryId}
            category={cat}
            onSelect={() => onSelect(cat.categoryId)}
            onAssign={(cents) => onAssign(cat.categoryId, cents)}
          />
        ))}
    </>
  );
}

function CategoryRow({
  category,
  onSelect,
  onAssign,
}: {
  category: CategoryMonthMetrics;
  onSelect: () => void;
  onAssign: (cents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const startEdit = () => {
    setValue((category.assignedCents / 100).toFixed(2));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseMoneyInput(value);
    if (parsed !== null && parsed >= 0) onAssign(parsed);
    setEditing(false);
  };

  return (
    <tr className="border-t border-border/70 hover:bg-accent-muted/40">
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-left font-medium hover:text-accent"
        >
          {category.name}
          {category.notes && <StickyNote className="h-3.5 w-3.5 text-muted" />}
          {category.overspendingType && (
            <span
              className="inline-flex items-center gap-1 text-xs text-warning"
              title={
                category.overspendingType === "credit"
                  ? "Credit overspending"
                  : "Cash overspending"
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {category.overspendingType === "credit" ? "Credit" : "Cash"}
            </span>
          )}
        </button>
        <div className="mt-1 max-w-[14rem]">
          <Progress
            assigned={category.assignedCents}
            target={category.targetAmountCents}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 rounded-md border border-accent bg-white px-2 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label={`Assigned for ${category.name}`}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-md px-2 py-1 tabular-nums hover:bg-black/5"
          >
            <MoneyText cents={category.assignedCents} />
          </button>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <MoneyText cents={category.activityCents} signed />
      </td>
      <td
        className={cn(
          "px-3 py-2 font-semibold tabular-nums",
          category.availableCents < 0 && "text-danger",
        )}
      >
        <button type="button" onClick={onSelect} className="hover:underline">
          <MoneyText cents={category.availableCents} />
        </button>
      </td>
    </tr>
  );
}

function Progress({
  assigned,
  target,
}: {
  assigned: number;
  target: number | null;
}) {
  if (target === null || target <= 0) return null;
  const pct = Math.min(100, Math.round((assigned / target) * 100));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-black/5"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 100 ? "bg-success" : "bg-accent",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
