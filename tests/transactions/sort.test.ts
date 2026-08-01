import { describe, expect, it, beforeEach } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import type { Account, Category, Transaction } from "@/lib/types/budget";
import { dollarsToCents } from "@/lib/money";
import {
  DEFAULT_ALL_TRANSACTIONS_SORT,
  buildSortContext,
  compareStableTieBreak,
  criteriaFromPreset,
  cycleSortCriteria,
  describeSortCriteria,
  sortAriaLabel,
  sortThenPaginate,
  sortTransactions,
  type SortCriterion,
} from "@/lib/transactions/sort";
import {
  getSortCriteriaForScope,
  resetSortPreferences,
  withUpdatedSortPreferences,
} from "@/lib/transactions/sort-preferences";

function txn(partial: Partial<Transaction> & Pick<Transaction, "id" | "date">): Transaction {
  return {
    accountId: "acc-a",
    payeeName: "Payee",
    categoryId: "cat-a",
    amountCents: dollarsToCents(-10),
    cleared: "uncleared",
    approved: true,
    isTransfer: false,
    ...partial,
  };
}

const accounts: Account[] = [
  {
    id: "acc-a",
    name: "Alpha Checking",
    type: "checking",
    kind: "on_budget",
    startingBalanceCents: 0,
    currency: "USD",
    closed: false,
    sortOrder: 0,
    isHidden: false,
  },
  {
    id: "acc-b",
    name: "Beta Savings",
    type: "savings",
    kind: "on_budget",
    startingBalanceCents: 0,
    currency: "USD",
    closed: false,
    sortOrder: 1,
    isHidden: false,
  },
];

const categories: Category[] = [
  {
    id: "cat-a",
    groupId: "g1",
    name: "Groceries",
    sortOrder: 0,
    hidden: false,
    rollover: true,
  },
  {
    id: "cat-b",
    groupId: "g1",
    name: "Utilities",
    sortOrder: 1,
    hidden: false,
    rollover: true,
  },
];

const ctx = buildSortContext(accounts, categories);

describe("transaction sorting", () => {
  const sample: Transaction[] = [
    txn({
      id: "t1",
      date: "2026-03-10",
      payeeName: "Zebra",
      accountId: "acc-b",
      categoryId: "cat-b",
      amountCents: dollarsToCents(95),
      cleared: "cleared",
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-11T10:00:00.000Z",
    }),
    txn({
      id: "t2",
      date: "2026-03-12",
      payeeName: "Apple",
      accountId: "acc-a",
      categoryId: "cat-a",
      amountCents: dollarsToCents(4241.11),
      cleared: "uncleared",
      createdAt: "2026-03-12T08:00:00.000Z",
      updatedAt: "2026-03-12T09:00:00.000Z",
    }),
    txn({
      id: "t3",
      date: "2026-03-12",
      payeeName: "Milk",
      accountId: "acc-a",
      categoryId: "cat-a",
      amountCents: dollarsToCents(-35),
      cleared: "reconciled",
      createdAt: "2026-03-12T12:00:00.000Z",
      updatedAt: "2026-03-12T12:00:00.000Z",
    }),
    txn({
      id: "t4",
      date: "2026-03-11",
      payeeName: "Power",
      accountId: "acc-b",
      categoryId: "cat-b",
      amountCents: dollarsToCents(-1300),
      cleared: "cleared",
      createdAt: "2026-03-11T08:00:00.000Z",
    }),
    txn({
      id: "t5",
      date: "2026-04-01",
      payeeName: "Future Rent",
      accountId: "acc-a",
      categoryId: "cat-b",
      amountCents: dollarsToCents(-900),
      cleared: "uncleared",
      createdAt: "2026-03-01T08:00:00.000Z",
    }),
  ];

  it("defaults to newest-first sorting", () => {
    const sorted = sortTransactions(sample, undefined, ctx);
    expect(sorted.map((t) => t.id)).toEqual(["t5", "t3", "t2", "t4", "t1"]);
  });

  it("sorts date ascending and descending", () => {
    const asc = sortTransactions(
      sample,
      [{ field: "date", direction: "asc" }],
      ctx,
    );
    expect(asc[0]!.id).toBe("t1");
    expect(asc[asc.length - 1]!.id).toBe("t5");

    const desc = sortTransactions(
      sample,
      [{ field: "date", direction: "desc" }],
      ctx,
    );
    expect(desc[0]!.id).toBe("t5");
  });

  it("sorts by account name", () => {
    const sorted = sortTransactions(
      sample,
      [{ field: "account", direction: "asc" }],
      ctx,
    );
    expect(sorted[0]!.accountId).toBe("acc-a");
    expect(sorted[sorted.length - 1]!.accountId).toBe("acc-b");
  });

  it("sorts by payee", () => {
    const sorted = sortTransactions(
      sample,
      [{ field: "payee", direction: "asc" }],
      ctx,
    );
    expect(sorted.map((t) => t.payeeName)).toEqual([
      "Apple",
      "Future Rent",
      "Milk",
      "Power",
      "Zebra",
    ]);
  });

  it("sorts by category", () => {
    const sorted = sortTransactions(
      sample,
      [{ field: "category", direction: "asc" }],
      ctx,
    );
    expect(sorted[0]!.categoryId).toBe("cat-a");
  });

  it("sorts signed amounts numerically", () => {
    const desc = sortTransactions(
      sample,
      [{ field: "amount", direction: "desc" }],
      ctx,
    );
    expect(desc[0]!.amountCents).toBe(dollarsToCents(4241.11));
    expect(desc[desc.length - 1]!.amountCents).toBe(dollarsToCents(-1300));

    // -$35 > -$1300 numerically
    const neg = [sample[2]!, sample[3]!];
    const negSorted = sortTransactions(
      neg,
      [{ field: "amount", direction: "desc" }],
      ctx,
    );
    expect(negSorted[0]!.id).toBe("t3");
  });

  it("sorts largest outflow by absolute negative amounts", () => {
    const sorted = sortTransactions(
      sample,
      [{ field: "outflow", direction: "desc" }],
      ctx,
    );
    expect(sorted[0]!.id).toBe("t4");
    expect(sorted[1]!.id).toBe("t5");
    expect(sorted[2]!.id).toBe("t3");
  });

  it("sorts largest inflow by positive amounts only", () => {
    const sorted = sortTransactions(
      sample,
      [{ field: "inflow", direction: "desc" }],
      ctx,
    );
    expect(sorted[0]!.id).toBe("t2");
    expect(sorted[1]!.id).toBe("t1");
  });

  it("sorts cleared status", () => {
    const unclearedFirst = sortTransactions(
      sample,
      [{ field: "cleared", direction: "asc" }],
      ctx,
    );
    expect(unclearedFirst[0]!.cleared).toBe("uncleared");

    const clearedFirst = sortTransactions(
      sample,
      criteriaFromPreset("cleared_first"),
      ctx,
    );
    expect(clearedFirst[0]!.cleared).toBe("reconciled");
  });

  it("keeps stable ordering for same-date transactions", () => {
    const sameDay = [
      txn({
        id: "a",
        date: "2026-03-12",
        createdAt: "2026-03-12T08:00:00.000Z",
      }),
      txn({
        id: "b",
        date: "2026-03-12",
        createdAt: "2026-03-12T12:00:00.000Z",
      }),
      txn({
        id: "c",
        date: "2026-03-12",
        createdAt: "2026-03-12T12:00:00.000Z",
      }),
    ];
    expect(compareStableTieBreak(sameDay[1]!, sameDay[0]!)).toBeLessThan(0);
    const sorted = sortTransactions(sameDay, DEFAULT_ALL_TRANSACTIONS_SORT, ctx);
    // Same date + createdAt → stable id descending
    expect(sorted.map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("supports multi-column sorting", () => {
    const criteria: SortCriterion[] = [
      { field: "account", direction: "asc" },
      { field: "date", direction: "desc" },
    ];
    const sorted = sortTransactions(sample, criteria, ctx);
    // Alpha accounts first, newest date within
    expect(sorted[0]!.accountId).toBe("acc-a");
    expect(sorted[0]!.id).toBe("t5");
    const firstBeta = sorted.findIndex((t) => t.accountId === "acc-b");
    expect(firstBeta).toBeGreaterThan(0);
  });

  it("cycles header sort and supports shift multi-sort", () => {
    let criteria = [...DEFAULT_ALL_TRANSACTIONS_SORT];
    criteria = cycleSortCriteria(criteria, "payee", {
      defaultCriteria: DEFAULT_ALL_TRANSACTIONS_SORT,
    });
    expect(criteria).toEqual([{ field: "payee", direction: "asc" }]);
    criteria = cycleSortCriteria(criteria, "payee", {
      defaultCriteria: DEFAULT_ALL_TRANSACTIONS_SORT,
    });
    expect(criteria).toEqual([{ field: "payee", direction: "desc" }]);
    criteria = cycleSortCriteria(criteria, "payee", {
      defaultCriteria: DEFAULT_ALL_TRANSACTIONS_SORT,
    });
    expect(criteria).toEqual(DEFAULT_ALL_TRANSACTIONS_SORT);

    let multi: SortCriterion[] = [{ field: "account", direction: "asc" }];
    multi = cycleSortCriteria(multi, "date", {
      shiftKey: true,
      defaultCriteria: DEFAULT_ALL_TRANSACTIONS_SORT,
    });
    expect(multi).toEqual([
      { field: "account", direction: "asc" },
      { field: "date", direction: "asc" },
    ]);
  });

  it("sorts with search-filtered subset", () => {
    const filtered = sample.filter((t) =>
      t.payeeName.toLowerCase().includes("a"),
    );
    const sorted = sortTransactions(
      filtered,
      [{ field: "payee", direction: "asc" }],
      ctx,
    );
    expect(sorted.every((t) => t.payeeName.toLowerCase().includes("a"))).toBe(
      true,
    );
    expect(sorted[0]!.payeeName).toBe("Apple");
  });

  it("sorts with account filter", () => {
    const filtered = sample.filter((t) => t.accountId === "acc-a");
    const sorted = sortTransactions(
      filtered,
      [{ field: "date", direction: "desc" }],
      ctx,
    );
    expect(sorted.every((t) => t.accountId === "acc-a")).toBe(true);
    expect(sorted[0]!.id).toBe("t5");
  });

  it("applies sorting before pagination", () => {
    const page = sortThenPaginate(
      sample,
      [{ field: "payee", direction: "asc" }],
      ctx,
      0,
      2,
    );
    expect(page.total).toBe(5);
    expect(page.rows.map((t) => t.payeeName)).toEqual(["Apple", "Future Rent"]);
    const page2 = sortThenPaginate(
      sample,
      [{ field: "payee", direction: "asc" }],
      ctx,
      1,
      2,
    );
    expect(page2.rows.map((t) => t.payeeName)).toEqual(["Milk", "Power"]);
  });

  it("saves and resets sorting preferences", () => {
    const plan = createDemoPlan();
    const updated = withUpdatedSortPreferences(
      plan.preferences,
      "allTransactions",
      [{ field: "payee", direction: "asc" }],
    );
    expect(
      getSortCriteriaForScope(updated, "allTransactions")[0]?.field,
    ).toBe("payee");

    const perAccount = withUpdatedSortPreferences(
      updated,
      { accountId: "acc-1" },
      [{ field: "outflow", direction: "desc" }],
    );
    expect(
      getSortCriteriaForScope(perAccount, { accountId: "acc-1" })[0]?.field,
    ).toBe("outflow");

    const reset = resetSortPreferences(perAccount, "allTransactions");
    expect(
      getSortCriteriaForScope(reset, "allTransactions"),
    ).toEqual(DEFAULT_ALL_TRANSACTIONS_SORT);
  });

  it("exposes accessible sort labels", () => {
    expect(sortAriaLabel("date", "asc")).toBe("Sort by date ascending");
    expect(sortAriaLabel("date", "desc")).toBe("Sort by date descending");
    expect(sortAriaLabel("date", null)).toBe("Clear date sorting");
    expect(describeSortCriteria([{ field: "date", direction: "desc" }])).toContain(
      "date",
    );
  });

  it("persists sort preference through the store", () => {
    const plan = createDemoPlan();
    useBudgetStore.setState({
      plan,
      undoStack: [],
      redoStack: [],
    });
    useBudgetStore
      .getState()
      .setTransactionSort("allTransactions", [
        { field: "amount", direction: "desc" },
      ]);
    expect(
      useBudgetStore.getState().plan.preferences.transactionSort
        ?.allTransactions?.[0]?.field,
    ).toBe("amount");
    useBudgetStore.getState().resetTransactionSort("allTransactions");
    expect(
      useBudgetStore.getState().plan.preferences.transactionSort
        ?.allTransactions,
    ).toBeUndefined();
  });
});

describe("mobile sort control presets", () => {
  beforeEach(() => {
    const plan = createDemoPlan();
    useBudgetStore.setState({ plan, undoStack: [], redoStack: [] });
  });

  it("maps presets used by the Sort menu", () => {
    expect(criteriaFromPreset("newest")).toEqual(DEFAULT_ALL_TRANSACTIONS_SORT);
    expect(criteriaFromPreset("largest_outflow")[0]?.field).toBe("outflow");
    expect(criteriaFromPreset("recently_edited")[0]?.field).toBe("updatedAt");
  });
});
