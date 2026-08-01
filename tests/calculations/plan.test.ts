import { describe, expect, it } from "vitest";
import { dollarsToCents } from "@/lib/money";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import {
  buildPlanMonthSummary,
  computeReadyToAssign,
  getCategoryActivity,
  getCategoryAvailable,
  getCashInflowsForMonth,
  getAssignedForMonth,
  getOverspendingType,
  getSpendingForMonth,
  validateSplitTotals,
} from "@/lib/calculations/plan";
import type { BudgetPlan, Transaction } from "@/lib/types/budget";

function basePlan(): BudgetPlan {
  return {
    id: "test",
    name: "Test",
    currency: "USD",
    workingMonthKey: "2026-08",
    preferences: {
      hideBalances: false,
      timezone: "UTC",
      currency: "USD",
      firstDayOfWeek: 0,
    },
    accounts: [
      {
        id: "checking",
        name: "Checking",
        type: "checking",
        kind: "on_budget",
        startingBalanceCents: 0,
        currency: "USD",
        closed: false,
        sortOrder: 0,
      },
      {
        id: "cc",
        name: "Card",
        type: "credit_card",
        kind: "credit",
        startingBalanceCents: 0,
        currency: "USD",
        closed: false,
        sortOrder: 1,
      },
    ],
    categoryGroups: [
      { id: "g1", name: "Food", sortOrder: 0, hidden: false },
    ],
    categories: [
      {
        id: "groceries",
        groupId: "g1",
        name: "Groceries",
        sortOrder: 0,
        hidden: false,
        rollover: true,
      },
      {
        id: "dining",
        groupId: "g1",
        name: "Dining",
        sortOrder: 1,
        hidden: false,
        rollover: true,
      },
    ],
    monthlyBudgets: [],
    targets: [],
    payees: [],
    transactions: [],
  };
}

describe("ready to assign after income", () => {
  it("increases readyToAssign by cash inflows and decreases by assigned", () => {
    const plan = basePlan();
    plan.transactions = [
      {
        id: "i1",
        accountId: "checking",
        date: "2026-08-01",
        payeeName: "Job",
        categoryId: null,
        amountCents: dollarsToCents(1000),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];
    plan.monthlyBudgets = [
      {
        categoryId: "groceries",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(250),
      },
    ];

    expect(getCashInflowsForMonth(plan.transactions, plan.accounts, "2026-08")).toBe(
      dollarsToCents(1000),
    );
    expect(getAssignedForMonth(plan.monthlyBudgets, "2026-08")).toBe(
      dollarsToCents(250),
    );
    expect(computeReadyToAssign(plan, "2026-08")).toBe(dollarsToCents(750));
  });
});

describe("assigning money", () => {
  it("reflects assigned amounts in month summary", () => {
    const plan = basePlan();
    plan.transactions = [
      {
        id: "i1",
        accountId: "checking",
        date: "2026-08-01",
        payeeName: "Job",
        categoryId: null,
        amountCents: dollarsToCents(500),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];
    plan.monthlyBudgets = [
      {
        categoryId: "groceries",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(200),
      },
      {
        categoryId: "dining",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(50),
      },
    ];

    const summary = buildPlanMonthSummary(plan, "2026-08");
    expect(summary.totalAssignedCents).toBe(dollarsToCents(250));
    expect(summary.readyToAssignCents).toBe(dollarsToCents(250));
  });
});

describe("category rollover", () => {
  it("rolls positive available into the next month when enabled", () => {
    const plan = basePlan();
    plan.monthlyBudgets = [
      {
        categoryId: "groceries",
        monthKey: "2026-07",
        assignedCents: dollarsToCents(100),
      },
      {
        categoryId: "groceries",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(40),
      },
    ];
    // July activity -$30 → available 70; August available 70 + 40 = 110
    plan.transactions = [
      {
        id: "s1",
        accountId: "checking",
        date: "2026-07-10",
        payeeName: "Store",
        categoryId: "groceries",
        amountCents: dollarsToCents(-30),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];

    const category = plan.categories[0]!;
    expect(getCategoryAvailable(plan, category, "2026-07")).toBe(
      dollarsToCents(70),
    );
    expect(getCategoryAvailable(plan, category, "2026-08")).toBe(
      dollarsToCents(110),
    );
  });

  it("does not roll when rollover is disabled", () => {
    const plan = basePlan();
    plan.categories[0]!.rollover = false;
    plan.monthlyBudgets = [
      {
        categoryId: "groceries",
        monthKey: "2026-07",
        assignedCents: dollarsToCents(100),
      },
      {
        categoryId: "groceries",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(40),
      },
    ];

    expect(getCategoryAvailable(plan, plan.categories[0]!, "2026-08")).toBe(
      dollarsToCents(40),
    );
  });
});

describe("cash overspending", () => {
  it("flags cash overspending and reduces readyToAssign", () => {
    const plan = basePlan();
    plan.transactions = [
      {
        id: "i1",
        accountId: "checking",
        date: "2026-08-01",
        payeeName: "Job",
        categoryId: null,
        amountCents: dollarsToCents(100),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
      {
        id: "s1",
        accountId: "checking",
        date: "2026-08-05",
        payeeName: "Store",
        categoryId: "dining",
        amountCents: dollarsToCents(-60),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];
    plan.monthlyBudgets = [
      {
        categoryId: "dining",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(20),
      },
    ];

    const available = getCategoryAvailable(plan, plan.categories[1]!, "2026-08");
    expect(available).toBe(dollarsToCents(-40));
    expect(
      getOverspendingType(
        available,
        "dining",
        "2026-08",
        plan.transactions,
        plan.accounts,
      ),
    ).toBe("cash");
    // inflows 100 - assigned 20 - cash overspend 40 = 40
    expect(computeReadyToAssign(plan, "2026-08")).toBe(dollarsToCents(40));
  });
});

describe("credit overspending", () => {
  it("flags credit overspending without treating it as cash cover", () => {
    const plan = basePlan();
    plan.transactions = [
      {
        id: "i1",
        accountId: "checking",
        date: "2026-08-01",
        payeeName: "Job",
        categoryId: null,
        amountCents: dollarsToCents(200),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
      {
        id: "s1",
        accountId: "cc",
        date: "2026-08-05",
        payeeName: "Amazon",
        categoryId: "dining",
        amountCents: dollarsToCents(-50),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];
    plan.monthlyBudgets = [
      {
        categoryId: "dining",
        monthKey: "2026-08",
        assignedCents: dollarsToCents(10),
      },
    ];

    const available = getCategoryAvailable(plan, plan.categories[1]!, "2026-08");
    expect(available).toBe(dollarsToCents(-40));
    expect(
      getOverspendingType(
        available,
        "dining",
        "2026-08",
        plan.transactions,
        plan.accounts,
      ),
    ).toBe("credit");
    // Credit overspend does not reduce readyToAssign cover
    expect(computeReadyToAssign(plan, "2026-08")).toBe(dollarsToCents(190));
  });
});

describe("transfer exclusion from spending", () => {
  it("excludes transfers from category activity and spending totals", () => {
    const plan = basePlan();
    plan.accounts.push({
      id: "savings",
      name: "Savings",
      type: "savings",
      kind: "on_budget",
      startingBalanceCents: 0,
      currency: "USD",
      closed: false,
      sortOrder: 2,
    });
    plan.transactions = [
      {
        id: "out",
        accountId: "checking",
        date: "2026-08-10",
        payeeName: "Transfer to Savings",
        categoryId: null,
        amountCents: dollarsToCents(-100),
        cleared: "cleared",
        approved: true,
        isTransfer: true,
        transferId: "x1",
        transferPairId: "in",
      },
      {
        id: "in",
        accountId: "savings",
        date: "2026-08-10",
        payeeName: "Transfer from Checking",
        categoryId: null,
        amountCents: dollarsToCents(100),
        cleared: "cleared",
        approved: true,
        isTransfer: true,
        transferId: "x1",
        transferPairId: "out",
      },
      {
        id: "food",
        accountId: "checking",
        date: "2026-08-11",
        payeeName: "Store",
        categoryId: "groceries",
        amountCents: dollarsToCents(-25),
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];

    expect(getCategoryActivity(plan.transactions, "groceries", "2026-08")).toBe(
      dollarsToCents(-25),
    );
    expect(getSpendingForMonth(plan.transactions, plan.accounts, "2026-08")).toBe(
      dollarsToCents(25),
    );
  });
});

describe("split transaction equality", () => {
  it("validates split totals equal parent amount", () => {
    const valid: Transaction = {
      id: "t1",
      accountId: "checking",
      date: "2026-08-01",
      payeeName: "Costco",
      categoryId: null,
      amountCents: dollarsToCents(-100),
      cleared: "cleared",
      approved: true,
      isTransfer: false,
      splits: [
        {
          id: "s1",
          categoryId: "groceries",
          amountCents: dollarsToCents(-70),
        },
        {
          id: "s2",
          categoryId: "dining",
          amountCents: dollarsToCents(-30),
        },
      ],
    };
    const invalid = {
      ...valid,
      splits: [
        {
          id: "s1",
          categoryId: "groceries",
          amountCents: dollarsToCents(-70),
        },
      ],
    };

    expect(validateSplitTotals(valid)).toBe(true);
    expect(validateSplitTotals(invalid)).toBe(false);
  });
});

describe("demo seed plan", () => {
  it("builds a coherent August summary with an overspent category", () => {
    const plan = createDemoPlan();
    const summary = buildPlanMonthSummary(plan, plan.workingMonthKey);
    expect(summary.groups.length).toBeGreaterThan(0);
    expect(summary.totalAssignedCents).toBeGreaterThan(0);

    const eatingOut = summary.groups
      .flatMap((g) => g.categories)
      .find((c) => c.name === "Eating Out");
    expect(eatingOut).toBeDefined();
    expect(eatingOut!.availableCents).toBeLessThan(0);
    expect(eatingOut!.overspendingType).not.toBeNull();
  });
});
