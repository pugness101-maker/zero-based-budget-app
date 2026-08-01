import type { MonthKey } from "@/lib/dates";
import { isDateInMonth } from "@/lib/dates";
import {
  getAssignedForCategory,
  getCategoryAvailable,
} from "@/lib/calculations/plan";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import type { Cents } from "@/lib/money";
import {
  isContributionGoalType,
  isDateBasedGoalType,
  normalizeTargetType,
} from "@/lib/goals/types";
import { accountSectionFor } from "@/lib/goals/selectors";
import type {
  Account,
  BudgetPlan,
  Category,
  GoalLinkType,
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

export type GoalFilter =
  | "all"
  | "category"
  | "account"
  | GoalStatus;

export interface GoalProgress {
  targetId: string;
  name: string;
  linkType: GoalLinkType;
  categoryId: string | null;
  accountId: string | null;
  linkedName: string;
  groupOrSection: string;
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
  isDuplicate?: boolean;
  isBrokenLink?: boolean;
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
  return Boolean(category && !category.deletedAt);
}

function isUsableAccount(account: Account | undefined): account is Account {
  return Boolean(account && !account.deletedAt);
}

/** Category goals that fund from available balance. */
export function goalUsesAvailableBalance(type: TargetType): boolean {
  const t = normalizeTargetType(type);
  return (
    t === "target_by_date" ||
    t === "monthly_refill" ||
    t === "maintain_category_balance" ||
    t === "weekly_savings" ||
    t === "custom_repeating"
  );
}

export function selectPrimaryGoalIds(targets: Target[]): Set<string> {
  const byKey = new Map<string, Target[]>();
  for (const t of targets) {
    if (t.paused) continue;
    const key =
      t.linkType === "account"
        ? `account:${t.accountId ?? ""}`
        : `category:${t.categoryId ?? ""}`;
    if (key.endsWith(":")) continue;
    if (t.linkType === "account" && t.allowDuplicateAccountGoal) {
      // Each allowed duplicate is its own primary
      byKey.set(`target:${t.id}`, [t]);
      continue;
    }
    const list = byKey.get(key) ?? [];
    list.push(t);
    byKey.set(key, list);
  }
  const primary = new Set<string>();
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    primary.add(sorted[0]!.id);
  }
  return primary;
}

export function getAccountContributionCents(
  plan: BudgetPlan,
  accountId: string,
  monthKey: MonthKey,
  options: { includeTransfers?: boolean; includeAdjustments?: boolean } = {},
): Cents {
  const includeTransfers = options.includeTransfers ?? true;
  const includeAdjustments = options.includeAdjustments ?? false;
  let total = 0;
  for (const t of plan.transactions) {
    if (t.accountId !== accountId) continue;
    if (!isDateInMonth(t.date, monthKey)) continue;
    if (t.amountCents <= 0) continue;
    if (!includeTransfers && t.isTransfer) continue;
    if (
      !includeAdjustments &&
      (t.source === "adjustment" || t.payeeName === "Closing adjustment")
    ) {
      continue;
    }
    total += t.amountCents;
  }
  return total as Cents;
}

export function getFundedTowardTarget(
  plan: BudgetPlan,
  target: Target,
  monthKey: MonthKey,
): { fundedCents: Cents; remainingCents: Cents; overspendingCents: Cents; percent: number } {
  const type = normalizeTargetType(target.type);
  const targetAmount = Math.max(0, target.amountCents);

  if (target.linkType === "account") {
    const account = plan.accounts.find((a) => a.id === target.accountId);
    if (!isUsableAccount(account)) {
      return {
        fundedCents: 0 as Cents,
        remainingCents: targetAmount as Cents,
        overspendingCents: 0 as Cents,
        percent: 0,
      };
    }
    const balance = getAccountBalance(account, plan.transactions).balanceCents;

    if (type === "debt_payoff") {
      const debt = Math.max(0, -balance);
      const baseline = Math.max(target.baselineAmountCents ?? debt, debt);
      const paidDown = Math.max(0, baseline - debt);
      const percent =
        baseline > 0
          ? Math.min(100, Math.max(0, Math.round((paidDown / baseline) * 100)))
          : debt === 0
            ? 100
            : 0;
      return {
        fundedCents: paidDown as Cents,
        remainingCents: debt as Cents,
        overspendingCents: 0 as Cents,
        percent,
      };
    }

    if (isContributionGoalType(type)) {
      const funded = getAccountContributionCents(plan, account.id, monthKey, {
        includeTransfers: target.includeTransfers ?? true,
        includeAdjustments: target.includeAdjustments ?? false,
      });
      const remaining = Math.max(0, targetAmount - funded);
      return {
        fundedCents: Math.max(0, funded) as Cents,
        remainingCents: remaining as Cents,
        overspendingCents: 0 as Cents,
        percent: progressPercent(funded, targetAmount),
      };
    }

    // Reach / maintain / emergency / save by date / custom account
    const funded = Math.max(0, balance);
    const remaining = Math.max(0, targetAmount - funded);
    return {
      fundedCents: funded as Cents,
      remainingCents: remaining as Cents,
      overspendingCents: 0 as Cents,
      percent: progressPercent(funded, targetAmount),
    };
  }

  // Category-linked
  const category = plan.categories.find((c) => c.id === target.categoryId);
  if (!isUsableCategory(category)) {
    return {
      fundedCents: 0 as Cents,
      remainingCents: targetAmount as Cents,
      overspendingCents: 0 as Cents,
      percent: 0,
    };
  }

  if (goalUsesAvailableBalance(type) && type !== "monthly_fixed") {
    // monthly_fixed always uses assigned; weekly/refill/date/balance use available
  }

  if (type === "monthly_fixed") {
    const assigned = getAssignedForCategory(
      plan.monthlyBudgets,
      category.id,
      monthKey,
    );
    const available = getCategoryAvailable(plan, category, monthKey);
    const funded = Math.max(0, assigned);
    return {
      fundedCents: funded as Cents,
      remainingCents: Math.max(0, targetAmount - funded) as Cents,
      overspendingCents: (available < 0 ? Math.abs(available) : 0) as Cents,
      percent: progressPercent(funded, targetAmount),
    };
  }

  const available = getCategoryAvailable(plan, category, monthKey);
  const funded = Math.max(0, available);
  return {
    fundedCents: funded as Cents,
    remainingCents: Math.max(0, targetAmount - funded) as Cents,
    overspendingCents: (available < 0 ? Math.abs(available) : 0) as Cents,
    percent: progressPercent(funded, targetAmount),
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
  type: TargetType;
  balanceCents?: number;
}): GoalStatus {
  if (input.needsReview) return "needs_review";
  const type = normalizeTargetType(input.type);

  if (type === "debt_payoff") {
    if (input.remainingCents <= 0) return "completed";
  } else if (type === "maintain_minimum_balance") {
    if ((input.balanceCents ?? input.fundedCents) >= input.targetAmountCents) {
      return "completed";
    }
  } else if (
    input.targetAmountCents > 0 &&
    input.fundedCents >= input.targetAmountCents
  ) {
    return "completed";
  } else if (input.targetAmountCents === 0 && input.remainingCents <= 0) {
    return "completed";
  }

  if (input.dueDate && input.remainingCents > 0) {
    const days = daysUntil(input.dueDate, input.today);
    if (days < 0) return "overdue";
    if (days <= 7) return "due_soon";
  }

  if (type === "maintain_minimum_balance") {
    return "underfunded";
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
    linkType: GoalLinkType;
    categoryId?: string | null;
    accountId?: string | null;
    type: TargetType;
    amountCents: number;
    dueDate?: string;
    allowDuplicateAccountGoal?: boolean;
  },
  options: { excludeTargetId?: string } = {},
): string | null {
  const categoryId = input.categoryId ?? null;
  const accountId = input.accountId ?? null;

  if (input.linkType === "category") {
    if (!categoryId) return "Category is required.";
    if (accountId) return "Category goals cannot also link to an account.";
    const category = plan.categories.find((c) => c.id === categoryId);
    if (!isUsableCategory(category)) return "Choose a valid category.";
    if (category.isArchived) {
      return "Cannot attach a goal to an archived category.";
    }
    const duplicate = plan.targets.find(
      (t) =>
        !t.paused &&
        t.linkType === "category" &&
        t.categoryId === categoryId &&
        t.id !== options.excludeTargetId,
    );
    if (duplicate) return "This category already has an active goal.";
  } else if (input.linkType === "account") {
    if (!accountId) return "Account is required.";
    if (categoryId) return "Account goals cannot also link to a category.";
    const account = plan.accounts.find((a) => a.id === accountId);
    if (!isUsableAccount(account)) return "Choose a valid account.";
    if (!input.allowDuplicateAccountGoal) {
      const duplicate = plan.targets.find(
        (t) =>
          !t.paused &&
          t.linkType === "account" &&
          t.accountId === accountId &&
          t.id !== options.excludeTargetId &&
          !t.allowDuplicateAccountGoal,
      );
      if (duplicate) return "This account already has an active goal.";
    }
  } else {
    return "Link goal to a category or an account.";
  }

  if (!categoryId && !accountId) {
    return "Goal must link to a category or an account.";
  }
  if (categoryId && accountId) {
    return "Goal cannot link to both a category and an account.";
  }

  const type = normalizeTargetType(input.type);
  if (input.linkType === "category") {
    const ok = [
      "monthly_fixed",
      "monthly_refill",
      "weekly_savings",
      "target_by_date",
      "maintain_category_balance",
      "custom_repeating",
    ].includes(type);
    if (!ok) return "Choose a category-compatible goal type.";
  } else {
    const ok = [
      "reach_account_balance",
      "maintain_minimum_balance",
      "account_save_by_date",
      "debt_payoff",
      "monthly_account_contribution",
      "investment_contribution",
      "emergency_fund_balance",
      "custom_account_target",
    ].includes(type);
    if (!ok) return "Choose an account-compatible goal type.";
  }

  // Debt payoff may target $0
  if (type === "debt_payoff") {
    if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
      return "Target amount must be zero or greater.";
    }
  } else if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return "Target amount must be greater than zero.";
  }

  if (isDateBasedGoalType(type) && !input.dueDate) {
    return "Due date is required for date-based goals.";
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
    const type = normalizeTargetType(target.type);
    const linkType: GoalLinkType =
      target.linkType ?? (target.accountId ? "account" : "category");

    let brokenLink = false;
    let linkedName = "Unknown";
    let groupOrSection = "Needs Review";
    let balanceCents: number | undefined;

    if (linkType === "category") {
      const category = plan.categories.find((c) => c.id === target.categoryId);
      brokenLink = !isUsableCategory(category);
      if (category && !category.deletedAt) {
        linkedName = category.name;
        const group = plan.categoryGroups.find((g) => g.id === category.groupId);
        groupOrSection = group?.name ?? "Other";
      }
    } else {
      const account = plan.accounts.find((a) => a.id === target.accountId);
      brokenLink = !isUsableAccount(account);
      if (account && !account.deletedAt) {
        linkedName = account.name;
        groupOrSection = accountSectionFor(account);
        balanceCents = getAccountBalance(account, plan.transactions).balanceCents;
      }
    }

    const invalidLink =
      (Boolean(target.categoryId) && Boolean(target.accountId)) ||
      (!target.categoryId && !target.accountId);
    const invalidData =
      invalidLink ||
      (type !== "debt_payoff" && target.amountCents <= 0) ||
      (isDateBasedGoalType(type) && !target.dueDate);
    const isDuplicate = !target.paused && !primaryIds.has(target.id);
    const archived = Boolean(target.paused);
    const needsReview = brokenLink || invalidData || isDuplicate;

    const metrics = brokenLink
      ? {
          fundedCents: 0 as Cents,
          remainingCents: Math.max(0, target.amountCents) as Cents,
          overspendingCents: 0 as Cents,
          percent: 0,
        }
      : getFundedTowardTarget(plan, target, monthKey);

    const targetAmountCents = Math.max(0, target.amountCents) as Cents;
    const overfundedCents = Math.max(
      0,
      metrics.fundedCents - targetAmountCents,
    ) as Cents;

    const status = resolveGoalStatus({
      fundedCents: metrics.fundedCents,
      targetAmountCents,
      remainingCents: metrics.remainingCents,
      dueDate: target.dueDate,
      today,
      monthKey,
      needsReview,
      type,
      balanceCents,
    });

    const name =
      target.name?.trim() ||
      linkedName ||
      "Untitled goal";

    goals.push({
      targetId: target.id,
      name,
      linkType,
      categoryId: target.categoryId,
      accountId: target.accountId,
      linkedName,
      groupOrSection,
      type,
      targetAmountCents,
      fundedCents: metrics.fundedCents,
      remainingCents: metrics.remainingCents,
      overfundedCents,
      overspendingCents: metrics.overspendingCents,
      dueDate: target.dueDate,
      status,
      percent: metrics.percent,
      notes: target.notes,
      paused: target.paused,
      isDuplicate,
      isBrokenLink: brokenLink || invalidLink,
      includeInSummary: !archived && !needsReview,
    });
  }

  goals.sort((a, b) => {
    if (a.status === "needs_review" && b.status !== "needs_review") return -1;
    if (b.status === "needs_review" && a.status !== "needs_review") return 1;
    return a.name.localeCompare(b.name);
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
  if (filter === "category") return base.filter((g) => g.linkType === "category");
  if (filter === "account") return base.filter((g) => g.linkType === "account");
  return base.filter((g) => g.status === filter);
}

// Re-export for existing imports
export { isDateBasedGoalType } from "@/lib/goals/types";
