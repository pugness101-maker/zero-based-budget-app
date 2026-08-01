import type { MonthKey } from "@/lib/dates";
import {
  getAssignedForCategory,
  getCategoryAvailable,
} from "@/lib/calculations/plan";
import type { Cents } from "@/lib/money";
import type {
  BudgetPlan,
  Category,
  Target,
  TargetType,
} from "@/lib/types/budget";

export type GoalStatus =
  | "on_track"
  | "underfunded"
  | "due_soon"
  | "overdue"
  | "completed"
  | "needs_review";

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
  overfundedCents: Cents;
  overspendingCents: Cents;
  dueDate?: string;
  status: GoalStatus;
  percent: number;
  notes?: string;
  paused?: boolean;
  /** True when another active goal already owns this categoryId */
  isDuplicate?: boolean;
  /** True when categoryId does not resolve to a usable category */
  isBrokenLink?: boolean;
  /** Excluded from summary totals (review / archived / duplicate / paused) */
  includeInSummary: boolean;
}

export interface GoalsSummary {
  totalTargetCents: Cents;
  fundedCents: Cents;
  remainingCents: Cents;
  onTrackCount: number;
  underfundedCount: number;
  dueSoonCount: number;
  overdueCount: number;
  completedCount: number;
  needsReviewCount: number;
  goals: GoalProgress[];
}

export function isDateBasedGoalType(type: TargetType): boolean {
  return type === "save_by_date";
}

/** Savings-style / balance targets use available; monthly-style use assigned. */
export function goalUsesAvailableBalance(type: TargetType): boolean {
  return (
    type === "save_by_date" ||
    type === "refill" ||
    type === "custom_balance" ||
    type === "custom"
  );
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

function isUsableCategory(category: Category | undefined): category is Category {
  if (!category) return false;
  if (category.deletedAt) return false;
  return true;
}

function isArchivedCategory(category: Category): boolean {
  return Boolean(category.isArchived);
}

/** Pick the canonical active goal per category (stable: lowest id). */
export function selectPrimaryGoalIds(targets: Target[]): Set<string> {
  const byCategory = new Map<string, Target[]>();
  for (const t of targets) {
    if (t.paused) continue;
    const list = byCategory.get(t.categoryId) ?? [];
    list.push(t);
    byCategory.set(t.categoryId, list);
  }
  const primary = new Set<string>();
  for (const list of byCategory.values()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    primary.add(sorted[0]!.id);
  }
  return primary;
}

export function getFundedTowardTarget(
  plan: BudgetPlan,
  target: Target,
  monthKey: MonthKey,
): { fundedCents: Cents; overspendingCents: Cents } {
  const category = plan.categories.find((c) => c.id === target.categoryId);
  if (!isUsableCategory(category)) {
    return { fundedCents: 0 as Cents, overspendingCents: 0 as Cents };
  }

  if (goalUsesAvailableBalance(target.type)) {
    const available = getCategoryAvailable(plan, category, monthKey);
    const overspendingCents = (
      available < 0 ? Math.abs(available) : 0
    ) as Cents;
    return {
      fundedCents: Math.max(0, available) as Cents,
      overspendingCents,
    };
  }

  const assigned = getAssignedForCategory(
    plan.monthlyBudgets,
    target.categoryId,
    monthKey,
  );
  const available = getCategoryAvailable(plan, category, monthKey);
  const overspendingCents = (available < 0 ? Math.abs(available) : 0) as Cents;
  return {
    fundedCents: Math.max(0, assigned) as Cents,
    overspendingCents,
  };
}

export function progressPercent(
  fundedCents: number,
  targetAmountCents: number,
): number {
  if (targetAmountCents <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((fundedCents / targetAmountCents) * 100)),
  );
}

export function expectedFundedByDate(input: {
  targetAmountCents: number;
  dueDate: string | undefined;
  monthKey: MonthKey;
  today: string;
}): number {
  const { targetAmountCents, dueDate, monthKey, today } = input;
  if (targetAmountCents <= 0) return 0;

  if (dueDate) {
    const start = `${monthKey}-01`;
    const startMs = Date.parse(`${start}T00:00:00`);
    const dueMs = Date.parse(`${dueDate}T00:00:00`);
    const todayMs = Date.parse(`${today}T00:00:00`);
    if (!Number.isFinite(startMs) || !Number.isFinite(dueMs)) {
      return monthlyExpected(targetAmountCents, monthKey, today);
    }
    if (dueMs <= startMs) {
      return todayMs >= dueMs ? targetAmountCents : 0;
    }
    const totalDays = Math.max(
      1,
      Math.round((dueMs - startMs) / (1000 * 60 * 60 * 24)),
    );
    const elapsed = Math.max(
      0,
      Math.min(
        totalDays,
        Math.round((todayMs - startMs) / (1000 * 60 * 60 * 24)),
      ),
    );
    return Math.round((targetAmountCents * elapsed) / totalDays);
  }

  return monthlyExpected(targetAmountCents, monthKey, today);
}

function monthlyExpected(
  targetAmountCents: number,
  monthKey: MonthKey,
  today: string,
): number {
  const day = Number(today.slice(8, 10));
  const daysInMonth = Number(monthEndIso(monthKey).slice(8, 10));
  if (!daysInMonth) return 0;
  return Math.round((targetAmountCents * day) / daysInMonth);
}

export function resolveGoalStatus(input: {
  fundedCents: number;
  targetAmountCents: number;
  remainingCents: number;
  dueDate: string | undefined;
  today: string;
  monthKey: MonthKey;
  needsReview: boolean;
}): GoalStatus {
  if (input.needsReview) return "needs_review";
  if (input.fundedCents >= input.targetAmountCents && input.targetAmountCents > 0) {
    return "completed";
  }
  if (input.dueDate && input.remainingCents > 0) {
    const days = daysUntil(input.dueDate, input.today);
    if (days < 0) return "overdue";
    if (days <= 7) return "due_soon";
  }
  const expected = expectedFundedByDate({
    targetAmountCents: input.targetAmountCents,
    dueDate: input.dueDate,
    monthKey: input.monthKey,
    today: input.today,
  });
  if (input.fundedCents >= expected) return "on_track";
  return "underfunded";
}

export function validateTargetInput(
  plan: BudgetPlan,
  input: {
    categoryId: string;
    type: TargetType;
    amountCents: number;
    dueDate?: string;
  },
  options: { excludeTargetId?: string } = {},
): string | null {
  if (!input.categoryId.trim()) return "Category is required.";
  const category = plan.categories.find((c) => c.id === input.categoryId);
  if (!isUsableCategory(category)) {
    return "Choose a valid category.";
  }
  if (category.isArchived) {
    return "Cannot attach a goal to an archived category.";
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return "Target amount must be greater than zero.";
  }
  if (isDateBasedGoalType(input.type) && !input.dueDate) {
    return "Due date is required for date-based goals.";
  }
  const duplicate = plan.targets.find(
    (t) =>
      !t.paused &&
      t.categoryId === input.categoryId &&
      t.id !== options.excludeTargetId,
  );
  if (duplicate) {
    return "This category already has an active goal.";
  }
  return null;
}

export function buildGoalsSummary(
  plan: BudgetPlan,
  monthKey: MonthKey,
  now = new Date(),
): GoalsSummary {
  const today = todayIso(now);
  const primaryIds = selectPrimaryGoalIds(plan.targets);
  const goals: GoalProgress[] = [];

  for (const target of plan.targets) {
    const category = plan.categories.find((c) => c.id === target.categoryId);
    const brokenLink = !isUsableCategory(category);
    const invalidData =
      target.amountCents <= 0 ||
      (isDateBasedGoalType(target.type) && !target.dueDate);
    const isDuplicate = !target.paused && !primaryIds.has(target.id);
    const archived =
      Boolean(target.paused) ||
      (isUsableCategory(category) && isArchivedCategory(category));
    const needsReview = brokenLink || invalidData || isDuplicate;

    const group =
      category && !category.deletedAt
        ? plan.categoryGroups.find((g) => g.id === category.groupId)
        : undefined;

    const { fundedCents, overspendingCents } = brokenLink
      ? { fundedCents: 0 as Cents, overspendingCents: 0 as Cents }
      : getFundedTowardTarget(plan, target, monthKey);

    const targetAmountCents = Math.max(0, target.amountCents) as Cents;
    const remainingCents = Math.max(
      0,
      targetAmountCents - fundedCents,
    ) as Cents;
    const overfundedCents = Math.max(
      0,
      fundedCents - targetAmountCents,
    ) as Cents;
    const percent = progressPercent(fundedCents, targetAmountCents);

    const status = resolveGoalStatus({
      fundedCents,
      targetAmountCents,
      remainingCents,
      dueDate: target.dueDate,
      today,
      monthKey,
      needsReview,
    });

    goals.push({
      targetId: target.id,
      categoryId: target.categoryId,
      categoryName:
        category && !category.deletedAt ? category.name : "Unknown category",
      groupName: brokenLink ? "Needs Review" : (group?.name ?? "Other"),
      type: target.type,
      targetAmountCents,
      fundedCents,
      remainingCents,
      overfundedCents,
      overspendingCents,
      dueDate: target.dueDate,
      status,
      percent,
      notes: target.notes,
      paused: target.paused,
      isDuplicate,
      isBrokenLink: brokenLink,
      includeInSummary: !archived && !needsReview,
    });
  }

  goals.sort((a, b) => {
    if (a.status === "needs_review" && b.status !== "needs_review") return -1;
    if (b.status === "needs_review" && a.status !== "needs_review") return 1;
    return a.categoryName.localeCompare(b.categoryName);
  });

  const active = goals.filter((g) => g.includeInSummary);

  return {
    totalTargetCents: active.reduce(
      (s, g) => s + g.targetAmountCents,
      0,
    ) as Cents,
    fundedCents: active.reduce((s, g) => s + g.fundedCents, 0) as Cents,
    remainingCents: active.reduce((s, g) => s + g.remainingCents, 0) as Cents,
    onTrackCount: active.filter((g) => g.status === "on_track").length,
    underfundedCount: active.filter((g) => g.status === "underfunded").length,
    dueSoonCount: active.filter((g) => g.status === "due_soon").length,
    overdueCount: active.filter((g) => g.status === "overdue").length,
    completedCount: active.filter((g) => g.status === "completed").length,
    needsReviewCount: goals.filter((g) => g.status === "needs_review").length,
    goals,
  };
}

export function filterGoals(
  goals: GoalProgress[],
  filter: GoalFilter,
): GoalProgress[] {
  const base = goals.filter((g) => !g.paused || g.status === "needs_review");
  if (filter === "all") return base;
  return base.filter((g) => g.status === filter);
}
