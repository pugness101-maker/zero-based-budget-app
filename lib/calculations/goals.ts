import type { MonthKey } from "@/lib/dates";
import { getAssignedForCategory, getCategoryAvailable } from "@/lib/calculations/plan";
import type { Cents } from "@/lib/money";
import type { BudgetPlan, Target, TargetType } from "@/lib/types/budget";

export type GoalStatus =
  | "on_track"
  | "underfunded"
  | "due_soon"
  | "completed";

export type GoalFilter = "all" | GoalStatus;

export interface GoalProgress {
  targetId: string;
  categoryId: string;
  categoryName: string;
  groupName: string;
  type: TargetType;
  targetAmountCents: Cents;
  fundedCents: Cents;
  remainingCents: Cents;
  dueDate?: string;
  status: GoalStatus;
  percent: number;
  notes?: string;
  paused?: boolean;
}

export interface GoalsSummary {
  totalTargetCents: Cents;
  fundedCents: Cents;
  remainingCents: Cents;
  onTrackCount: number;
  underfundedCount: number;
  dueSoonCount: number;
  completedCount: number;
  goals: GoalProgress[];
}

function daysUntil(isoDate: string, todayIso: string): number {
  const due = Date.parse(`${isoDate}T00:00:00`);
  const today = Date.parse(`${todayIso}T00:00:00`);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function monthEndIso(monthKey: MonthKey): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Funded = assigned this month; refill goals also consider available. */
export function getFundedTowardTarget(
  plan: BudgetPlan,
  target: Target,
  monthKey: MonthKey,
): Cents {
  const assigned = getAssignedForCategory(
    plan.monthlyBudgets,
    target.categoryId,
    monthKey,
  );
  if (target.type === "refill" || target.type === "custom_balance") {
    const category = plan.categories.find((c) => c.id === target.categoryId);
    if (!category) return assigned;
    const available = getCategoryAvailable(plan, category, monthKey);
    return Math.max(assigned, available);
  }
  return assigned;
}

export function resolveGoalStatus(
  fundedCents: Cents,
  targetAmountCents: Cents,
  dueDate: string | undefined,
  today: string,
): GoalStatus {
  if (fundedCents >= targetAmountCents) return "completed";
  if (dueDate) {
    const days = daysUntil(dueDate, today);
    if (days >= 0 && days <= 7) return "due_soon";
  }
  if (fundedCents < targetAmountCents) return "underfunded";
  return "on_track";
}

export function buildGoalsSummary(
  plan: BudgetPlan,
  monthKey: MonthKey,
  now = new Date(),
): GoalsSummary {
  const today = todayIso(now);
  const goals: GoalProgress[] = [];

  for (const target of plan.targets) {
    if (target.paused) continue;
    const category = plan.categories.find((c) => c.id === target.categoryId);
    if (!category || category.hidden) continue;
    const group = plan.categoryGroups.find((g) => g.id === category.groupId);

    const dueDate = target.dueDate ?? monthEndIso(monthKey);
    const fundedCents = getFundedTowardTarget(plan, target, monthKey);
    const remainingCents = Math.max(0, target.amountCents - fundedCents);
    let status = resolveGoalStatus(
      fundedCents,
      target.amountCents,
      dueDate,
      today,
    );

    // Fully funded but still within month counts as completed; otherwise
    // underfunded that is ahead of a simple pace can show on_track.
    if (status === "underfunded") {
      const day = Number(today.slice(8, 10));
      const daysInMonth = Number(monthEndIso(monthKey).slice(8, 10));
      const expected = Math.round((target.amountCents * day) / daysInMonth);
      if (fundedCents >= expected) status = "on_track";
    }

    const percent =
      target.amountCents <= 0
        ? 100
        : Math.min(100, Math.round((fundedCents / target.amountCents) * 100));

    goals.push({
      targetId: target.id,
      categoryId: category.id,
      categoryName: category.name,
      groupName: group?.name ?? "Other",
      type: target.type,
      targetAmountCents: target.amountCents,
      fundedCents,
      remainingCents,
      dueDate,
      status,
      percent,
      notes: target.notes,
      paused: target.paused,
    });
  }

  goals.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  return {
    totalTargetCents: goals.reduce((s, g) => s + g.targetAmountCents, 0),
    fundedCents: goals.reduce((s, g) => s + Math.min(g.fundedCents, g.targetAmountCents), 0),
    remainingCents: goals.reduce((s, g) => s + g.remainingCents, 0),
    onTrackCount: goals.filter((g) => g.status === "on_track").length,
    underfundedCount: goals.filter((g) => g.status === "underfunded").length,
    dueSoonCount: goals.filter((g) => g.status === "due_soon").length,
    completedCount: goals.filter((g) => g.status === "completed").length,
    goals,
  };
}

export function filterGoals(
  goals: GoalProgress[],
  filter: GoalFilter,
): GoalProgress[] {
  if (filter === "all") return goals;
  return goals.filter((g) => g.status === filter);
}
