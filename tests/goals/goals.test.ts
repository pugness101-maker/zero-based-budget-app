import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import { dollarsToCents } from "@/lib/money";
import {
  buildGoalsSummary,
  getFundedTowardTarget,
  progressPercent,
  resolveGoalStatus,
  validateTargetInput,
} from "@/lib/calculations/goals";
import {
  detectGoalIssues,
  repairDuplicateGoals,
  reconnectGoal,
} from "@/lib/goals/repair";
import { forceDeleteToUncategorized } from "@/lib/categories/deletion";
import { UNCATEGORIZED_ID } from "@/lib/categories/deletion";
import type { BudgetPlan, Target } from "@/lib/types/budget";

function reset() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    undoStack: [],
    redoStack: [],
    selectedMonthKey: plan.workingMonthKey,
    toastMessage: null,
  });
}

describe("goal funding calculations", () => {
  beforeEach(() => reset());

  it("funds monthly fixed goals from assigned (never negative)", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-phone")!;
    const { fundedCents } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(fundedCents).toBeGreaterThanOrEqual(0);
    expect(fundedCents).toBe(dollarsToCents(45));
  });

  it("funds savings / save-by-date goals from available balance", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-emergency")!;
    expect(target.type).toBe("refill");
    const { fundedCents } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(fundedCents).toBeGreaterThanOrEqual(0);
  });

  it("computes remaining and progress without negatives", () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(-10, 100)).toBe(0);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(10, 0)).toBe(0);
  });

  it("resolves overdue due soon completed underfunded and on track", () => {
    expect(
      resolveGoalStatus({
        fundedCents: 100,
        targetAmountCents: 100,
        remainingCents: 0,
        dueDate: "2026-01-01",
        today: "2026-08-01",
        monthKey: "2026-08",
        needsReview: false,
      }),
    ).toBe("completed");

    expect(
      resolveGoalStatus({
        fundedCents: 10,
        targetAmountCents: 100,
        remainingCents: 90,
        dueDate: "2026-07-01",
        today: "2026-08-01",
        monthKey: "2026-08",
        needsReview: false,
      }),
    ).toBe("overdue");

    expect(
      resolveGoalStatus({
        fundedCents: 10,
        targetAmountCents: 100,
        remainingCents: 90,
        dueDate: "2026-08-05",
        today: "2026-08-01",
        monthKey: "2026-08",
        needsReview: false,
      }),
    ).toBe("due_soon");

    expect(
      resolveGoalStatus({
        fundedCents: 0,
        targetAmountCents: 100,
        remainingCents: 100,
        dueDate: undefined,
        today: "2026-08-20",
        monthKey: "2026-08",
        needsReview: false,
      }),
    ).toBe("underfunded");

    expect(
      resolveGoalStatus({
        fundedCents: 0,
        targetAmountCents: 100,
        remainingCents: 100,
        dueDate: undefined,
        today: "2026-08-01",
        monthKey: "2026-08",
        needsReview: true,
      }),
    ).toBe("needs_review");
  });

  it("summary excludes needs-review and duplicate goals", () => {
    const plan = useBudgetStore.getState().plan;
    const dup: Target = {
      id: "tgt-phone-zz",
      categoryId: "cat-phone",
      type: "monthly_fixed",
      amountCents: dollarsToCents(20),
    };
    const orphan: Target = {
      id: "tgt-orphan",
      categoryId: "cat-does-not-exist",
      type: "monthly_fixed",
      amountCents: dollarsToCents(50),
    };
    const next: BudgetPlan = {
      ...plan,
      targets: [...plan.targets, dup, orphan],
    };
    const summary = buildGoalsSummary(next, plan.workingMonthKey, new Date("2026-08-01"));
    expect(summary.needsReviewCount).toBeGreaterThanOrEqual(2);
    expect(summary.goals.some((g) => g.targetId === "tgt-orphan" && g.status === "needs_review")).toBe(true);
    expect(summary.goals.find((g) => g.targetId === "tgt-phone-zz")?.includeInSummary).toBe(false);
    // Active summary funded should not include orphan or duplicate
    const activeIds = new Set(
      summary.goals.filter((g) => g.includeInSummary).map((g) => g.targetId),
    );
    expect(activeIds.has("tgt-orphan")).toBe(false);
    expect(activeIds.has("tgt-phone-zz")).toBe(false);
    expect(activeIds.has("tgt-phone")).toBe(true);
  });

  it("shows overfunded when funded exceeds target", () => {
    const plan = useBudgetStore.getState().plan;
    const inflated = {
      ...plan,
      monthlyBudgets: plan.monthlyBudgets.map((b) =>
        b.categoryId === "cat-phone" && b.monthKey === plan.workingMonthKey
          ? { ...b, assignedCents: dollarsToCents(100) }
          : b,
      ),
    };
    const summary = buildGoalsSummary(
      inflated,
      plan.workingMonthKey,
      new Date("2026-08-01"),
    );
    const phone = summary.goals.find((g) => g.targetId === "tgt-phone")!;
    expect(phone.overfundedCents).toBe(dollarsToCents(55));
    expect(phone.remainingCents).toBe(0);
    expect(phone.fundedCents).toBeGreaterThanOrEqual(0);
  });
});

describe("goal deletion and undo", () => {
  beforeEach(() => reset());

  it("deletes only the goal and supports undo/redo", () => {
    const before = useBudgetStore.getState().plan.targets.length;
    const id = "tgt-fun";
    const result = useBudgetStore.getState().deleteTarget(id);
    expect(result.ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.targets.some((t) => t.id === id),
    ).toBe(false);
    expect(useBudgetStore.getState().plan.targets.length).toBe(before - 1);
    // Category still exists
    expect(
      useBudgetStore.getState().plan.categories.some((c) => c.id === "cat-fun-money"),
    ).toBe(true);

    expect(useBudgetStore.getState().undo().ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.targets.some((t) => t.id === id),
    ).toBe(true);

    expect(useBudgetStore.getState().redo().ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.targets.some((t) => t.id === id),
    ).toBe(false);
  });
});

describe("goal validation and category linking", () => {
  beforeEach(() => reset());

  it("requires category positive amount and due date for save-by-date", () => {
    const plan = useBudgetStore.getState().plan;
    expect(
      validateTargetInput(plan, {
        categoryId: "",
        type: "monthly_fixed",
        amountCents: 100,
      }),
    ).toMatch(/category/i);
    expect(
      validateTargetInput(plan, {
        categoryId: "cat-fun-money",
        type: "monthly_fixed",
        amountCents: 0,
      }),
    ).toMatch(/greater than zero/i);
    expect(
      validateTargetInput(plan, {
        categoryId: "cat-fun-money",
        type: "save_by_date",
        amountCents: 100,
      }),
    ).toMatch(/due date/i);
  });

  it("prevents duplicate active goals for one category", () => {
    const plan = useBudgetStore.getState().plan;
    expect(
      validateTargetInput(plan, {
        categoryId: "cat-phone",
        type: "monthly_fixed",
        amountCents: 100,
      }),
    ).toMatch(/already has/i);

    const add = useBudgetStore.getState().addTarget({
      categoryId: "cat-phone",
      type: "monthly_fixed",
      amountCents: dollarsToCents(10),
    });
    expect(add.ok).toBe(false);
  });

  it("links goals by categoryId and never auto-assigns Uncategorized", () => {
    const plan = useBudgetStore.getState().plan;
    const orphaned: BudgetPlan = {
      ...plan,
      targets: [
        ...plan.targets,
        {
          id: "tgt-broken",
          categoryId: "missing-cat",
          type: "monthly_fixed",
          amountCents: dollarsToCents(30),
        },
      ],
    };
    const summary = buildGoalsSummary(orphaned, plan.workingMonthKey);
    const broken = summary.goals.find((g) => g.targetId === "tgt-broken")!;
    expect(broken.status).toBe("needs_review");
    expect(broken.categoryId).toBe("missing-cat");
    expect(broken.categoryName).not.toBe("Uncategorized");
  });
});

describe("goal repair", () => {
  beforeEach(() => reset());

  it("detects and removes duplicate goals while keeping one", () => {
    const plan = useBudgetStore.getState().plan;
    const withDup: BudgetPlan = {
      ...plan,
      targets: [
        ...plan.targets,
        {
          id: "tgt-phone-2",
          categoryId: "cat-phone",
          type: "monthly_fixed",
          amountCents: dollarsToCents(10),
        },
      ],
    };
    const issues = detectGoalIssues(withDup);
    expect(issues.some((i) => i.kind === "duplicate")).toBe(true);

    const repaired = repairDuplicateGoals(withDup);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(repaired.removedIds).toContain("tgt-phone-2");
    expect(
      repaired.plan.targets.filter((t) => t.categoryId === "cat-phone"),
    ).toHaveLength(1);
  });

  it("reconnects orphan goals to a free category", () => {
    const plan = useBudgetStore.getState().plan;
    const withOrphan: BudgetPlan = {
      ...plan,
      targets: [
        ...plan.targets,
        {
          id: "tgt-orphan",
          categoryId: "gone",
          type: "monthly_fixed",
          amountCents: dollarsToCents(40),
        },
      ],
    };
    // cat-books may or may not have a goal — pick a free one
    const taken = new Set(withOrphan.targets.map((t) => t.categoryId));
    const free = withOrphan.categories.find(
      (c) => !c.hidden && !c.deletedAt && !taken.has(c.id),
    )!;
    const result = reconnectGoal(withOrphan, "tgt-orphan", free.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.targets.find((t) => t.id === "tgt-orphan")?.categoryId,
    ).toBe(free.id);
  });

  it("force-delete does not create Uncategorized goals", () => {
    const plan = useBudgetStore.getState().plan;
    const beforeUncat = plan.targets.filter(
      (t) => t.categoryId === UNCATEGORIZED_ID,
    ).length;
    const result = forceDeleteToUncategorized(plan, "cat-fun-money");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const afterUncat = result.plan.targets.filter(
      (t) => t.categoryId === UNCATEGORIZED_ID,
    ).length;
    expect(afterUncat).toBe(beforeUncat);
    expect(
      result.plan.targets.some((t) => t.categoryId === "cat-fun-money"),
    ).toBe(false);
  });
});
