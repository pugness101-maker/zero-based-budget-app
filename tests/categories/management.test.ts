import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  addCategory,
  addCategoryGroup,
  deleteCategoryGroupSafe,
  deleteCategorySafe,
  editCategory,
  hideCategory,
  mergeCategories,
  moveCategoryToGroup,
  renameCategoryGroup,
  reorderCategories,
  unhideCategory,
} from "@/lib/categories/operations";
import {
  findDuplicateCategoryName,
  getSelectableCategories,
} from "@/lib/categories/lifecycle";
import { findCategoryByName } from "@/lib/imports/map-categories";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import { buildReportDataset } from "@/lib/calculations/reports";
import { dollarsToCents } from "@/lib/money";

function reset() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    undoStack: [],
    redoStack: [],
    auditEvents: [],
    selectedMonthKey: plan.workingMonthKey,
    toastMessage: null,
  });
}

describe("category management", () => {
  beforeEach(() => reset());

  it("adds a category", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const result = addCategory(plan, {
      name: "New Cat",
      groupId,
      startingAssignedCents: dollarsToCents(25),
      monthKey: plan.workingMonthKey,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.categories.some((c) => c.name === "New Cat")).toBe(true);
    expect(
      result.plan.monthlyBudgets.some(
        (b) => b.categoryId === result.entityId && b.assignedCents === 2500,
      ),
    ).toBe(true);
  });

  it("rejects duplicate names within the same group", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    expect(findDuplicateCategoryName(plan, cat.name, cat.groupId)).toBeTruthy();
    const result = addCategory(plan, { name: cat.name, groupId: cat.groupId });
    expect(result.ok).toBe(false);
  });

  it("allows same name in different groups", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    const otherGroup = plan.categoryGroups.find((g) => g.id !== cat.groupId)!;
    const result = addCategory(plan, {
      name: cat.name,
      groupId: otherGroup.id,
    });
    expect(result.ok).toBe(true);
  });

  it("renames and moves a category", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    const otherGroup = plan.categoryGroups.find((g) => g.id !== cat.groupId)!;
    const renamed = editCategory(plan, cat.id, { name: "Renamed" });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const moved = moveCategoryToGroup(renamed.plan, cat.id, otherGroup.id);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const next = moved.plan.categories.find((c) => c.id === cat.id)!;
    expect(next.name).toBe("Renamed");
    expect(next.groupId).toBe(otherGroup.id);
  });

  it("reorders categories", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categories[0]!.groupId;
    const ids = plan.categories
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id);
    if (ids.length < 2) return;
    const reversed = [...ids].reverse();
    const result = reorderCategories(plan, reversed, groupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ordered = result.plan.categories
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id);
    expect(ordered[0]).toBe(reversed[0]);
  });

  it("adds and renames category groups", () => {
    const plan = useBudgetStore.getState().plan;
    const added = addCategoryGroup(plan, "Custom Group");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const renamed = renameCategoryGroup(
      added.plan,
      added.entityId!,
      "Custom Renamed",
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(
      renamed.plan.categoryGroups.find((g) => g.id === added.entityId)?.name,
    ).toBe("Custom Renamed");
  });

  it("deletes empty group and prevents deleting non-empty group", () => {
    const plan = useBudgetStore.getState().plan;
    const empty = addCategoryGroup(plan, "Empty Group");
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(deleteCategoryGroupSafe(empty.plan, empty.entityId!).ok).toBe(true);

    const nonempty = plan.categoryGroups[0]!;
    const blocked = deleteCategoryGroupSafe(plan, nonempty.id);
    expect(blocked.ok).toBe(false);
  });

  it("hides and unhides categories from default selectors", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    const hidden = hideCategory(plan, cat.id);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(
      getSelectableCategories(hidden.plan).some((c) => c.id === cat.id),
    ).toBe(false);
    expect(
      getSelectableCategories(hidden.plan, { includeHidden: true }).some(
        (c) => c.id === cat.id,
      ),
    ).toBe(true);
    const shown = unhideCategory(hidden.plan, cat.id);
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(
      getSelectableCategories(shown.plan).some((c) => c.id === cat.id),
    ).toBe(true);
  });

  it("deletes unused category and prevents unsafe deletion", () => {
    const plan = useBudgetStore.getState().plan;
    const groupId = plan.categoryGroups[0]!.id;
    const created = addCategory(plan, { name: "Disposable", groupId });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const deleted = deleteCategorySafe(created.plan, created.entityId!);
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(
      deleted.plan.categories.find((c) => c.id === created.entityId)?.deletedAt,
    ).toBeTruthy();

    const used = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    expect(deleteCategorySafe(plan, used.id).ok).toBe(false);
  });

  it("merges categories including budgets and transactions", () => {
    const plan = useBudgetStore.getState().plan;
    const source = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const dest = plan.categories.find((c) => c.id !== source.id)!;
    expect(dest).toBeTruthy();
    const beforeCount = plan.transactions.filter(
      (t) => t.categoryId === source.id,
    ).length;
    const result = mergeCategories(plan, source.id, dest.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.transactions.filter((t) => t.categoryId === source.id),
    ).toHaveLength(0);
    expect(
      result.plan.transactions.filter((t) => t.categoryId === dest.id).length,
    ).toBeGreaterThanOrEqual(beforeCount);
    expect(
      result.plan.categories.find((c) => c.id === source.id)?.mergedIntoCategoryId,
    ).toBe(dest.id);
    expect(
      result.plan.monthlyBudgets.some((b) => b.categoryId === source.id),
    ).toBe(false);
  });

  it("keeps hidden category history in reports", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories.find((c) =>
      plan.transactions.some((t) => t.categoryId === c.id),
    )!;
    const hidden = hideCategory(plan, cat.id);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    // Plan excludes hidden
    const summary = buildPlanMonthSummary(hidden.plan, plan.workingMonthKey);
    expect(
      summary.groups.flatMap((g) => g.categories).some((c) => c.categoryId === cat.id),
    ).toBe(false);
    // Reports still include those transactions by default
    const report = buildReportDataset(
      hidden.plan,
      {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        accountIds: [],
        categoryIds: [],
      },
      plan.workingMonthKey,
    );
    expect(
      report.filteredTransactions.some((t) => t.categoryId === cat.id),
    ).toBe(true);
  });

  it("import matching finds active categories and can match hidden with warning path", () => {
    const plan = useBudgetStore.getState().plan;
    const cat = plan.categories[0]!;
    expect(findCategoryByName(plan, cat.name)?.id).toBe(cat.id);
    const hidden = hideCategory(plan, cat.id);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(findCategoryByName(hidden.plan, cat.name)).toBeUndefined();
    expect(
      findCategoryByName(hidden.plan, cat.name, { includeHidden: true })?.id,
    ).toBe(cat.id);
  });

  it("store undo/redo for add category", () => {
    const before = useBudgetStore.getState().plan.categories.length;
    const groupId = useBudgetStore.getState().plan.categoryGroups[0]!.id;
    const result = useBudgetStore.getState().addCategory({
      name: "Undoable Cat",
      groupId,
    });
    expect(result.ok).toBe(true);
    expect(useBudgetStore.getState().plan.categories.length).toBe(before + 1);
    useBudgetStore.getState().undo();
    expect(useBudgetStore.getState().plan.categories.length).toBe(before);
    useBudgetStore.getState().redo();
    expect(
      useBudgetStore
        .getState()
        .plan.categories.some((c) => c.name === "Undoable Cat"),
    ).toBe(true);
    expect(
      useBudgetStore
        .getState()
        .plan.categories.filter((c) => c.name === "Undoable Cat"),
    ).toHaveLength(1);
  });
});
