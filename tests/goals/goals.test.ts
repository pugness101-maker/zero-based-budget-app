import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import { dollarsToCents } from "@/lib/money";
import {
  buildGoalsSummary,
  getAccountContributionCents,
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
import { migratePlanTargets, migrateTarget } from "@/lib/goals/migrate";
import {
  buildGroupedAccountOptions,
  buildGroupedCategoryOptions,
  flattenAccountOptions,
  flattenCategoryOptions,
} from "@/lib/goals/selectors";
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

function catTarget(
  partial: Partial<Target> & Pick<Target, "id" | "categoryId" | "amountCents">,
): Target {
  return {
    linkType: "category",
    accountId: null,
    type: "monthly_fixed",
    ...partial,
    categoryId: partial.categoryId,
  };
}

describe("grouped category selector", () => {
  beforeEach(() => reset());

  it("groups categories under group headers in saved order", () => {
    const plan = useBudgetStore.getState().plan;
    const groups = buildGroupedCategoryOptions({ plan });
    expect(groups.length).toBeGreaterThan(1);
    expect(groups[0]!.groupName).toBeTruthy();
    const orders = groups.map((g) => g.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    const bills = groups.find((g) => g.groupName === "Bills");
    expect(bills?.categories.some((c) => c.name === "Phone")).toBe(true);
  });

  it("searches categories by name and by group", () => {
    const plan = useBudgetStore.getState().plan;
    const byName = flattenCategoryOptions(
      buildGroupedCategoryOptions({ plan, query: "phone" }),
    );
    expect(byName.some((c) => c.name === "Phone")).toBe(true);

    const byGroup = buildGroupedCategoryOptions({ plan, query: "food" });
    expect(byGroup.some((g) => g.groupName === "Food")).toBe(true);
    expect(
      byGroup.some((g) => g.categories.some((c) => c.name === "Groceries")),
    ).toBe(true);
  });

  it("hides archived/hidden categories unless toggled", () => {
    const plan = useBudgetStore.getState().plan;
    const hiddenId = plan.categories[0]!.id;
    const next: BudgetPlan = {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === hiddenId ? { ...c, hidden: true } : c,
      ),
    };
    const hidden = flattenCategoryOptions(
      buildGroupedCategoryOptions({ plan: next, includeHiddenArchived: false }),
    );
    expect(hidden.some((c) => c.id === hiddenId)).toBe(false);
    const shown = flattenCategoryOptions(
      buildGroupedCategoryOptions({ plan: next, includeHiddenArchived: true }),
    );
    expect(shown.some((c) => c.id === hiddenId && c.hidden)).toBe(true);
  });
});

describe("account selector", () => {
  beforeEach(() => reset());

  it("groups accounts by type section", () => {
    const plan = useBudgetStore.getState().plan;
    const groups = buildGroupedAccountOptions({ plan });
    expect(groups.some((g) => g.section === "On Budget")).toBe(true);
    expect(groups.some((g) => g.section === "Credit")).toBe(true);
    const onBudget = groups.find((g) => g.section === "On Budget")!;
    expect(onBudget.accounts.some((a) => a.name === "Checking")).toBe(true);
  });

  it("searches accounts by name", () => {
    const plan = useBudgetStore.getState().plan;
    const found = flattenAccountOptions(
      buildGroupedAccountOptions({ plan, query: "hysa" }),
    );
    expect(found.some((a) => a.id === "acct-hysa")).toBe(true);
  });
});

describe("goal funding calculations", () => {
  beforeEach(() => reset());

  it("funds monthly fixed category goals from assigned", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-phone")!;
    const { fundedCents } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(fundedCents).toBe(dollarsToCents(45));
  });

  it("funds category savings/refill from available", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-emergency")!;
    const { fundedCents } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(fundedCents).toBeGreaterThanOrEqual(0);
  });

  it("funds account reach-balance goals from current balance", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-hysa-balance")!;
    const { fundedCents, remainingCents } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(fundedCents).toBeGreaterThan(0);
    expect(remainingCents).toBeGreaterThanOrEqual(0);
  });

  it("tracks debt payoff remaining as current debt", () => {
    const plan = useBudgetStore.getState().plan;
    const target = plan.targets.find((t) => t.id === "tgt-cc-payoff")!;
    const { remainingCents, percent } = getFundedTowardTarget(
      plan,
      target,
      plan.workingMonthKey,
    );
    expect(remainingCents).toBeGreaterThan(0);
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });

  it("completes maintain minimum balance when balance meets target", () => {
    expect(
      resolveGoalStatus({
        fundedCents: 5000,
        targetAmountCents: 1000,
        remainingCents: 0,
        dueDate: undefined,
        today: "2026-08-01",
        monthKey: "2026-08",
        needsReview: false,
        type: "maintain_minimum_balance",
        balanceCents: 5000,
      }),
    ).toBe("completed");
  });

  it("calculates monthly account contributions from inflows", () => {
    const plan = useBudgetStore.getState().plan;
    const month = plan.workingMonthKey;
    const withInflow: BudgetPlan = {
      ...plan,
      transactions: [
        {
          id: "txn-contrib",
          accountId: "acct-hysa",
          date: `${month}-10`,
          payeeName: "Transfer in",
          categoryId: null,
          amountCents: dollarsToCents(100),
          cleared: "uncleared",
          approved: true,
          isTransfer: true,
          source: "transfer",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...plan.transactions,
      ],
    };
    const funded = getAccountContributionCents(withInflow, "acct-hysa", month, {
      includeTransfers: true,
    });
    expect(funded).toBeGreaterThanOrEqual(dollarsToCents(100));

    const withoutTransfers = getAccountContributionCents(
      withInflow,
      "acct-hysa",
      month,
      { includeTransfers: false },
    );
    expect(withoutTransfers).toBeLessThan(funded);
  });

  it("clamps progress", () => {
    expect(progressPercent(50, 100)).toBe(50);
    expect(progressPercent(-10, 100)).toBe(0);
    expect(progressPercent(150, 100)).toBe(100);
  });
});

describe("goal validation and linking", () => {
  beforeEach(() => reset());

  it("prevents both categoryId and accountId", () => {
    const plan = useBudgetStore.getState().plan;
    expect(
      validateTargetInput(plan, {
        linkType: "category",
        categoryId: "cat-phone",
        accountId: "acct-checking",
        type: "monthly_fixed",
        amountCents: 100,
      }),
    ).toMatch(/cannot also link/i);
  });

  it("prevents neither ID", () => {
    const plan = useBudgetStore.getState().plan;
    expect(
      validateTargetInput(plan, {
        linkType: "category",
        categoryId: null,
        accountId: null,
        type: "monthly_fixed",
        amountCents: 100,
      }),
    ).toMatch(/required/i);
  });

  it("prevents duplicate category and account goals", () => {
    const plan = useBudgetStore.getState().plan;
    expect(
      validateTargetInput(plan, {
        linkType: "category",
        categoryId: "cat-phone",
        type: "monthly_fixed",
        amountCents: 100,
      }),
    ).toMatch(/already has/i);

    expect(
      validateTargetInput(plan, {
        linkType: "account",
        accountId: "acct-hysa",
        type: "reach_account_balance",
        amountCents: 1000,
      }),
    ).toMatch(/already has/i);
  });

  it("creates category and account linked goals", () => {
    const freeCat = useBudgetStore
      .getState()
      .plan.categories.find(
        (c) =>
          !useBudgetStore
            .getState()
            .plan.targets.some((t) => t.categoryId === c.id),
      )!;
    const addCat = useBudgetStore.getState().addTarget({
      linkType: "category",
      categoryId: freeCat.id,
      type: "monthly_fixed",
      amountCents: dollarsToCents(25),
      name: freeCat.name,
    });
    expect(addCat.ok).toBe(true);

    // Checking may be free
    const addAcct = useBudgetStore.getState().addTarget({
      linkType: "account",
      accountId: "acct-checking",
      type: "maintain_minimum_balance",
      amountCents: dollarsToCents(500),
      name: "Checking floor",
    });
    expect(addAcct.ok).toBe(true);
  });
});

describe("migration and repair", () => {
  beforeEach(() => reset());

  it("migrates legacy category goals without converting to accounts", () => {
    const plan = createDemoPlan();
    const legacy = {
      ...plan,
      targets: [
        {
          id: "legacy-1",
          categoryId: "cat-gas",
          type: "refill" as const,
          amountCents: dollarsToCents(50),
        },
        {
          id: "legacy-broken",
          categoryId: "missing",
          type: "monthly_fixed" as const,
          amountCents: dollarsToCents(10),
        },
      ] as unknown as Target[],
    };
    const migrated = migratePlanTargets(legacy);
    const g1 = migrated.targets.find((t) => t.id === "legacy-1")!;
    expect(g1.linkType).toBe("category");
    expect(g1.accountId).toBeNull();
    expect(g1.type).toBe("monthly_refill");
    const broken = migrateTarget(
      {
        id: "legacy-broken",
        categoryId: "missing",
        type: "monthly_fixed",
        amountCents: dollarsToCents(10),
      },
      plan,
    );
    expect(broken.linkType).toBe("category");
    expect(broken.categoryId).toBe("missing");
    const summary = buildGoalsSummary(
      { ...plan, targets: [...plan.targets, broken] },
      plan.workingMonthKey,
    );
    expect(
      summary.goals.find((g) => g.targetId === "legacy-broken")?.status,
    ).toBe("needs_review");
  });

  it("repairs duplicates and reconnects orphans", () => {
    const plan = useBudgetStore.getState().plan;
    const withDup: BudgetPlan = {
      ...plan,
      targets: [
        ...plan.targets,
        catTarget({
          id: "tgt-phone-zz",
          categoryId: "cat-phone",
          amountCents: dollarsToCents(10),
        }),
      ],
    };
    expect(detectGoalIssues(withDup).some((i) => i.kind === "duplicate")).toBe(
      true,
    );
    const repaired = repairDuplicateGoals(withDup);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;
    expect(
      repaired.plan.targets.filter((t) => t.categoryId === "cat-phone"),
    ).toHaveLength(1);

    const withOrphan: BudgetPlan = {
      ...plan,
      targets: [
        ...plan.targets,
        catTarget({
          id: "tgt-orphan",
          categoryId: "gone",
          amountCents: dollarsToCents(40),
        }),
      ],
    };
    const taken = new Set(
      withOrphan.targets
        .filter((t) => t.categoryId)
        .map((t) => t.categoryId as string),
    );
    const free = withOrphan.categories.find(
      (c) => !c.hidden && !c.deletedAt && !taken.has(c.id),
    )!;
    const result = reconnectGoal(withOrphan, "tgt-orphan", {
      linkType: "category",
      categoryId: free.id,
    });
    expect(result.ok).toBe(true);
  });

  it("force-delete does not create Uncategorized goals", () => {
    const plan = useBudgetStore.getState().plan;
    const beforeUncat = plan.targets.filter(
      (t) => t.categoryId === UNCATEGORIZED_ID,
    ).length;
    const result = forceDeleteToUncategorized(plan, "cat-fun-money");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.targets.filter((t) => t.categoryId === UNCATEGORIZED_ID)
        .length,
    ).toBe(beforeUncat);
  });
});

describe("goal deletion undo and view links", () => {
  beforeEach(() => reset());

  it("deletes only the goal with undo/redo", () => {
    const id = "tgt-fun";
    expect(useBudgetStore.getState().deleteTarget(id).ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.targets.some((t) => t.id === id),
    ).toBe(false);
    expect(useBudgetStore.getState().undo().ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.targets.some((t) => t.id === id),
    ).toBe(true);
  });

  it("exposes view category and view account hrefs from goal progress", () => {
    const plan = useBudgetStore.getState().plan;
    const summary = buildGoalsSummary(plan, plan.workingMonthKey);
    const catGoal = summary.goals.find((g) => g.targetId === "tgt-phone")!;
    const acctGoal = summary.goals.find((g) => g.targetId === "tgt-hysa-balance")!;
    expect(catGoal.linkType).toBe("category");
    expect(`/plan?category=${catGoal.categoryId}`).toContain("cat-phone");
    expect(acctGoal.linkType).toBe("account");
    expect(`/accounts/${acctGoal.accountId}`).toContain("acct-hysa");
  });
});
