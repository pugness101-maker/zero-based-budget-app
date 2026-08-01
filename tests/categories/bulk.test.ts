import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  addCategory,
  bulkSetCategoryHidden,
} from "@/lib/categories/operations";
import {
  buildBulkImpactSummary,
  bulkArchiveCategories,
  bulkDeleteCategories,
  bulkHideWithImpact,
  bulkMergeCategories,
  bulkMoveWithValidation,
  combinedAvailableCents,
} from "@/lib/categories/bulk";
import {
  applyRangeSelection,
  countSelectedOutsideVisible,
  groupCheckboxState,
  setManyInSet,
  toggleIdInSet,
} from "@/lib/categories/selection";
import { dollarsToCents } from "@/lib/money";
import { getCategoryAvailable } from "@/lib/calculations/plan";

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

describe("category selection helpers", () => {
  it("enters and exits select mode state via set helpers", () => {
    let selected = new Set<string>();
    selected = toggleIdInSet(selected, "a");
    expect(selected.has("a")).toBe(true);
    selected = toggleIdInSet(selected, "a");
    expect(selected.size).toBe(0);
  });

  it("selects one category", () => {
    const selected = toggleIdInSet(new Set(), "cat-1");
    expect([...selected]).toEqual(["cat-1"]);
  });

  it("selects an entire group", () => {
    const selected = setManyInSet(new Set(), ["a", "b", "c"], true);
    expect(groupCheckboxState(["a", "b", "c"], selected)).toBe(true);
  });

  it("computes indeterminate group state", () => {
    const selected = new Set(["a"]);
    expect(groupCheckboxState(["a", "b"], selected)).toBe("indeterminate");
  });

  it("selects all visible categories", () => {
    const visible = ["a", "b", "c"];
    const selected = setManyInSet(new Set(["z"]), visible, true);
    expect(selected.has("a")).toBe(true);
    expect(selected.has("z")).toBe(true);
  });

  it("supports shift-click range selection", () => {
    const ordered = ["a", "b", "c", "d"];
    const result = applyRangeSelection(
      ordered,
      new Set(["a"]),
      "c",
      "a",
      true,
    );
    expect([...result.selected].sort()).toEqual(["a", "b", "c"]);
  });

  it("tracks selection outside filtered view", () => {
    const selected = new Set(["a", "b", "hidden"]);
    expect(countSelectedOutsideVisible(selected, new Set(["a", "b"]))).toBe(1);
  });
});

describe("bulk category operations", () => {
  beforeEach(() => reset());

  it("bulk hides categories", () => {
    const plan = useBudgetStore.getState().plan;
    const ids = plan.categories.filter((c) => !c.hidden).slice(0, 2).map((c) => c.id);
    const result = bulkHideWithImpact(plan, ids, plan.workingMonthKey, {
      type: "keep_historical",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ids) {
      expect(result.plan.categories.find((c) => c.id === id)?.hidden).toBe(true);
    }
  });

  it("bulk archives categories", () => {
    const plan = useBudgetStore.getState().plan;
    const id = plan.categories.find((c) => !c.isArchived)!.id;
    const result = bulkArchiveCategories(plan, [id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.categories.find((c) => c.id === id)?.isArchived).toBe(
      true,
    );
  });

  it("bulk moves across groups", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories.find((c) => !c.deletedAt)!;
    const dest = plan.categoryGroups.find(
      (g) => g.id !== cat.groupId && !g.deletedAt && !g.hidden,
    )!;
    const result = bulkMoveWithValidation(plan, [cat.id], dest.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.categories.find((c) => c.id === cat.id)?.groupId).toBe(
      dest.id,
    );
  });

  it("bulk merges categories", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const a = addCategory(plan, { name: "Bulk Merge A", groupId });
    const b = addCategory(a.ok ? a.plan : plan, {
      name: "Bulk Merge B",
      groupId,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const dest = b.plan.categories.find((c) => c.id !== a.entityId)!;
    const result = bulkMergeCategories(
      b.plan,
      [a.entityId!],
      dest.id,
      plan.workingMonthKey,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.categories.find((c) => c.id === a.entityId)?.deletedAt,
    ).toBeTruthy();
  });

  it("bulk deletes safe categories", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, { name: "Safe Bulk Delete", groupId });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = bulkDeleteCategories(
      created.plan,
      [created.entityId!],
      plan.workingMonthKey,
      "safe_only",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.categories.find((c) => c.id === created.entityId)?.deletedAt,
    ).toBeTruthy();
  });

  it("bulk deletes categories with only budget history", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, {
      name: "Budget Only Bulk",
      groupId,
      monthKey: plan.workingMonthKey,
      startingAssignedCents: dollarsToCents(25),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const summary = buildBulkImpactSummary(
      created.plan,
      [created.entityId!],
      plan.workingMonthKey,
    );
    expect(summary.rows[0]?.classification).toBe("budget_history_only");
    const result = bulkDeleteCategories(
      created.plan,
      [created.entityId!],
      plan.workingMonthKey,
      "budget_history",
      { available: { type: "ready_to_assign" } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.monthlyBudgets.some((b) => b.categoryId === created.entityId),
    ).toBe(false);
  });

  it("reassigns transaction history then deletes", () => {
    const plan = useBudgetStore.getState().plan;
    const source = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const dest = plan.categories.find(
      (c) => c.id !== source.id && !c.deletedAt,
    )!;
    const result = bulkDeleteCategories(
      plan,
      [source.id],
      plan.workingMonthKey,
      "reassign",
      {
        destinationId: dest.id,
        available: { type: "keep_historical" },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.transactions.some((t) => t.categoryId === source.id),
    ).toBe(false);
  });

  it("archives unsafe categories", () => {
    const plan = useBudgetStore.getState().plan;
    const used = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const result = bulkDeleteCategories(
      plan,
      [used.id],
      plan.workingMonthKey,
      "archive_unsafe",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.categories.find((c) => c.id === used.id)?.isArchived).toBe(
      true,
    );
  });

  it("handles combined available balance", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const a = addCategory(plan, {
      name: "Avail A",
      groupId,
      monthKey: plan.workingMonthKey,
      startingAssignedCents: dollarsToCents(10),
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = addCategory(a.plan, {
      name: "Avail B",
      groupId,
      monthKey: plan.workingMonthKey,
      startingAssignedCents: dollarsToCents(15),
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const combined = combinedAvailableCents(
      b.plan,
      [a.entityId!, b.entityId!],
      plan.workingMonthKey,
    );
    expect(combined).toBe(dollarsToCents(25));
  });

  it("undoes and redoes bulk hide as one batch", () => {
    const plan = useBudgetStore.getState().plan;
    const ids = plan.categories
      .filter((c) => !c.hidden && !c.deletedAt)
      .slice(0, 2)
      .map((c) => c.id);
    useBudgetStore.getState().bulkHideCategories(ids, {
      type: "keep_historical",
    });
    for (const id of ids) {
      expect(
        useBudgetStore.getState().plan.categories.find((c) => c.id === id)
          ?.hidden,
      ).toBe(true);
    }
    expect(useBudgetStore.getState().undo().ok).toBe(true);
    for (const id of ids) {
      expect(
        useBudgetStore.getState().plan.categories.find((c) => c.id === id)
          ?.hidden,
      ).toBe(false);
    }
    expect(useBudgetStore.getState().redo().ok).toBe(true);
    for (const id of ids) {
      expect(
        useBudgetStore.getState().plan.categories.find((c) => c.id === id)
          ?.hidden,
      ).toBe(true);
    }
  });

  it("leaves no orphaned monthly budgets after bulk budget-history delete", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, {
      name: "Orphan Check",
      groupId,
      monthKey: plan.workingMonthKey,
      startingAssignedCents: dollarsToCents(5),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = bulkDeleteCategories(
      created.plan,
      [created.entityId!],
      plan.workingMonthKey,
      "budget_history",
      { available: { type: "ready_to_assign" } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.monthlyBudgets.every((b) => b.categoryId !== created.entityId),
    ).toBe(true);
  });

  it("exposes bulk impact summary for confirmation UI", () => {
    const plan = useBudgetStore.getState().plan;
    const ids = plan.categories.slice(0, 3).map((c) => c.id);
    const summary = buildBulkImpactSummary(plan, ids, plan.workingMonthKey);
    expect(summary.categoryCount).toBeGreaterThan(0);
    expect(summary.rows.length).toBe(summary.categoryCount);
  });

  it("supports keyboard-oriented select helpers (toggle + clear)", () => {
    let selected = new Set(["a", "b"]);
    selected = setManyInSet(selected, ["a", "b"], false);
    expect(selected.size).toBe(0);
    const hidden = bulkSetCategoryHidden(createDemoPlan(), [], true);
    expect(hidden.ok).toBe(true);
  });
});

describe("mobile bulk action sheet contract", () => {
  it("builds confirmation counts used by mobile bar", () => {
    reset();
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    const available = getCategoryAvailable(plan, cat, plan.workingMonthKey);
    const summary = buildBulkImpactSummary(
      plan,
      [cat.id],
      plan.workingMonthKey,
    );
    expect(summary.combinedAvailableCents).toBe(available);
    expect(summary.categoryCount).toBe(1);
  });
});
