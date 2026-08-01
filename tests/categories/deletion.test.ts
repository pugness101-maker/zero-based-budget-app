import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  addCategory,
  deleteCategorySafe,
  mergeCategories,
} from "@/lib/categories/operations";
import {
  applyAvailableDisposition,
  applyCategoryDeleteStrategy,
  archiveCategoryForFuture,
  deleteCategoryAndBudgetHistory,
  forceDeleteToUncategorized,
  moveHistoryThenDelete,
  restoreDeletedCategory,
  UNCATEGORIZED_ID,
} from "@/lib/categories/deletion";
import {
  computeReadyToAssign,
  getCategoryAvailable,
} from "@/lib/calculations/plan";
import { dollarsToCents, type Cents } from "@/lib/money";
import type { BudgetPlan } from "@/lib/types/budget";

function reset() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    undoStack: [],
    redoStack: [],
    auditEvents: [],
    selectedMonthKey: plan.workingMonthKey,
    toastMessage: null,
    categoryImportRules: {},
  });
}

function categoryWithOnlyBudgets(plan: BudgetPlan) {
  const groupId = plan.categoryGroups[0]!.id;
  const created = addCategory(plan, {
    name: "Budget Only Cat",
    groupId,
    monthKey: plan.workingMonthKey,
    startingAssignedCents: dollarsToCents(40),
  });
  if (!created.ok) throw new Error(created.error);
  return { plan: created.plan, id: created.entityId! };
}

describe("category deletion strategies", () => {
  beforeEach(() => reset());

  it("deletes category with only monthly budget records", () => {
    const base = useBudgetStore.getState().plan;
    const { plan, id } = categoryWithOnlyBudgets(base);
    expect(plan.monthlyBudgets.some((b) => b.categoryId === id)).toBe(true);

    const result = deleteCategoryAndBudgetHistory(plan, id, "Budget Only Cat");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.monthlyBudgets.some((b) => b.categoryId === id)).toBe(
      false,
    );
    expect(result.plan.categories.find((c) => c.id === id)?.deletedAt).toBeTruthy();
    expect(
      result.plan.categories.find((c) => c.id === id)?.deletionMethod,
    ).toBe("budget_history");
  });

  it("deletes category with no history", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, { name: "Empty Cat", groupId });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = deleteCategorySafe(created.plan, created.entityId!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.categories.find((c) => c.id === created.entityId)?.deletedAt,
    ).toBeTruthy();
    expect(
      result.plan.categories.find((c) => c.id === created.entityId)
        ?.deletionMethod,
    ).toBe("empty");
  });

  it("blocks unsafe direct deletion with transactions", () => {
    const plan = useBudgetStore.getState().plan;
    const used = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    expect(deleteCategorySafe(plan, used.id).ok).toBe(false);
    expect(
      deleteCategoryAndBudgetHistory(plan, used.id, used.name).ok,
    ).toBe(false);
  });

  it("moves history then deletes", () => {
    const plan = useBudgetStore.getState().plan;
    const source = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const dest = plan.categories.find(
      (c) => c.id !== source.id && !c.deletedAt,
    )!;
    const sourceTxnCount = plan.transactions.filter(
      (t) => t.categoryId === source.id,
    ).length;

    const result = moveHistoryThenDelete(plan, source.id, dest.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.transactions.filter((t) => t.categoryId === source.id),
    ).toHaveLength(0);
    expect(
      result.plan.transactions.filter((t) => t.categoryId === dest.id).length,
    ).toBeGreaterThanOrEqual(sourceTxnCount);
    expect(
      result.plan.monthlyBudgets.some((b) => b.categoryId === source.id),
    ).toBe(false);
    expect(
      result.plan.categories.find((c) => c.id === source.id)?.deletedAt,
    ).toBeTruthy();
    expect(
      result.plan.categories.find((c) => c.id === source.id)?.mergedIntoCategoryId,
    ).toBe(dest.id);
  });

  it("archives category with transactions", () => {
    const plan = useBudgetStore.getState().plan;
    const used = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const beforeTxn = plan.transactions.filter(
      (t) => t.categoryId === used.id,
    ).length;
    const result = archiveCategoryForFuture(plan, used.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cat = result.plan.categories.find((c) => c.id === used.id)!;
    expect(cat.isArchived).toBe(true);
    expect(cat.deletedAt).toBeUndefined();
    expect(
      result.plan.transactions.filter((t) => t.categoryId === used.id),
    ).toHaveLength(beforeTxn);
    expect(
      result.plan.monthlyBudgets.some((b) => b.categoryId === used.id),
    ).toBe(true);
  });

  it("force deletes and reassigns to Uncategorized", () => {
    const plan = useBudgetStore.getState().plan;
    const used = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const result = forceDeleteToUncategorized(plan, used.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.transactions.some((t) => t.categoryId === used.id),
    ).toBe(false);
    expect(
      result.plan.categories.some((c) => c.id === UNCATEGORIZED_ID && !c.deletedAt),
    ).toBe(true);
    expect(
      result.plan.transactions.some((t) => t.categoryId === UNCATEGORIZED_ID),
    ).toBe(true);
    expect(
      result.plan.monthlyBudgets.some((b) => b.categoryId === used.id),
    ).toBe(false);
    expect(
      result.plan.categories.find((c) => c.id === used.id)?.deletionMethod,
    ).toBe("force_uncategorized");
  });

  it("handles positive available balance via Ready to Assign", () => {
    const base = useBudgetStore.getState().plan;
    const { plan, id } = categoryWithOnlyBudgets(base);
    const cat = plan.categories.find((c) => c.id === id)!;
    const available = getCategoryAvailable(plan, cat, plan.workingMonthKey);
    expect(available).toBeGreaterThan(0);
    const rtaBefore = computeReadyToAssign(plan, plan.workingMonthKey);

    const disposed = applyAvailableDisposition(plan, id, plan.workingMonthKey, {
      type: "ready_to_assign",
    });
    expect(disposed.ok).toBe(true);
    if (!disposed.ok) return;
    const afterAvail = getCategoryAvailable(
      disposed.plan,
      cat,
      plan.workingMonthKey,
    );
    expect(afterAvail).toBe(0);
    const rtaAfter = computeReadyToAssign(
      disposed.plan,
      plan.workingMonthKey,
    );
    expect(rtaAfter).toBe((rtaBefore + available) as Cents);
  });

  it("handles negative available balance via Ready to Assign", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, {
      name: "Overspent Cat",
      groupId,
      monthKey: plan.workingMonthKey,
      startingAssignedCents: dollarsToCents(10),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const accountId = plan.accounts[0]!.id;
    const withTxn: BudgetPlan = {
      ...created.plan,
      transactions: [
        ...created.plan.transactions,
        {
          id: "txn-overspend-test",
          accountId,
          date: `${plan.workingMonthKey}-15`,
          payeeName: "Overspend",
          categoryId: created.entityId!,
          amountCents: dollarsToCents(-50),
          cleared: "cleared",
          approved: true,
          isTransfer: false,
        },
      ],
    };
    const cat = withTxn.categories.find((c) => c.id === created.entityId)!;
    const available = getCategoryAvailable(
      withTxn,
      cat,
      plan.workingMonthKey,
    );
    expect(available).toBeLessThan(0);

    const disposed = applyAvailableDisposition(
      withTxn,
      created.entityId!,
      plan.workingMonthKey,
      { type: "ready_to_assign" },
    );
    expect(disposed.ok).toBe(true);
    if (!disposed.ok) return;
    expect(
      getCategoryAvailable(disposed.plan, cat, plan.workingMonthKey),
    ).toBe(0);
  });

  it("merges monthly budget records safely", () => {
    const plan = useBudgetStore.getState().plan;
    const monthKey = plan.workingMonthKey;
    const groupId = plan.categoryGroups[0]!.id;
    const a = addCategory(plan, {
      name: "Merge A",
      groupId,
      monthKey,
      startingAssignedCents: dollarsToCents(20),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = addCategory(a.plan, {
      name: "Merge B",
      groupId,
      monthKey,
      startingAssignedCents: dollarsToCents(30),
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const merged = mergeCategories(b.plan, a.entityId!, b.entityId!);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(
      merged.plan.monthlyBudgets.some((x) => x.categoryId === a.entityId),
    ).toBe(false);
    const destBudget = merged.plan.monthlyBudgets.find(
      (x) => x.categoryId === b.entityId && x.monthKey === monthKey,
    );
    expect(destBudget?.assignedCents).toBe(dollarsToCents(50));
    expect(
      merged.plan.categories.find((c) => c.id === a.entityId)?.deletionMethod,
    ).toBe("merge");
  });

  it("undoes deleted category and redoes deletion", () => {
    const store = useBudgetStore.getState();
    const plan = store.plan;
    const { plan: withCat, id } = categoryWithOnlyBudgets(plan);
    useBudgetStore.setState({ plan: withCat });

    const result = useBudgetStore.getState().deleteCategoryWithStrategy(id, {
      mode: "budget_history",
      confirmedName: "Budget Only Cat",
      available: { type: "ready_to_assign" },
    });
    expect(result.ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.categories.find((c) => c.id === id)
        ?.deletedAt,
    ).toBeTruthy();

    const undone = useBudgetStore.getState().undo();
    expect(undone.ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.categories.find((c) => c.id === id)
        ?.deletedAt,
    ).toBeUndefined();
    expect(
      useBudgetStore
        .getState()
        .plan.monthlyBudgets.some((b) => b.categoryId === id),
    ).toBe(true);

    const redone = useBudgetStore.getState().redo();
    expect(redone.ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.categories.find((c) => c.id === id)
        ?.deletedAt,
    ).toBeTruthy();
    expect(
      useBudgetStore
        .getState()
        .plan.monthlyBudgets.some((b) => b.categoryId === id),
    ).toBe(false);
  });

  it("leaves no orphaned monthly budget references after delete", () => {
    const base = useBudgetStore.getState().plan;
    const { plan, id } = categoryWithOnlyBudgets(base);
    const result = applyCategoryDeleteStrategy(
      plan,
      id,
      plan.workingMonthKey,
      {
        mode: "budget_history",
        confirmedName: "Budget Only Cat",
        available: { type: "ready_to_assign" },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const b of result.plan.monthlyBudgets) {
      expect(
        result.plan.categories.some(
          (c) => c.id === b.categoryId && !c.deletedAt,
        ) ||
          result.plan.categories.some((c) => c.id === b.categoryId),
      ).toBe(true);
    }
    expect(result.plan.monthlyBudgets.every((b) => b.categoryId !== id)).toBe(
      true,
    );
  });

  it("keeps Ready to Assign correct after available move and delete", () => {
    const base = useBudgetStore.getState().plan;
    const { plan, id } = categoryWithOnlyBudgets(base);
    const cat = plan.categories.find((c) => c.id === id)!;
    const available = getCategoryAvailable(plan, cat, plan.workingMonthKey);
    const rtaBefore = computeReadyToAssign(plan, plan.workingMonthKey);

    const result = applyCategoryDeleteStrategy(
      plan,
      id,
      plan.workingMonthKey,
      {
        mode: "budget_history",
        confirmedName: "Budget Only Cat",
        available: { type: "ready_to_assign" },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rtaAfter = computeReadyToAssign(result.plan, plan.workingMonthKey);
    // Assigned removed + available returned via disposition should preserve RTA math
    expect(rtaAfter).toBe((rtaBefore + available) as Cents);

    const restored = restoreDeletedCategory(result.plan, id);
    expect(restored.ok).toBe(true);
  });
});
