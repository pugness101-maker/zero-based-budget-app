import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";

function reset() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    undoStack: [],
    redoStack: [],
    selectedMonthKey: plan.workingMonthKey,
  });
}

describe("settings category groups expand preferences", () => {
  beforeEach(() => reset());

  it("remembers expanded state per group", () => {
    const groupId = useBudgetStore.getState().plan.categoryGroups[0]!.id;
    useBudgetStore.getState().setSettingsCategoryGroupExpanded(groupId, true);
    expect(
      useBudgetStore.getState().plan.preferences
        .settingsCategoryGroupsExpanded?.[groupId],
    ).toBe(true);
    useBudgetStore.getState().setSettingsCategoryGroupExpanded(groupId, false);
    expect(
      useBudgetStore.getState().plan.preferences
        .settingsCategoryGroupsExpanded?.[groupId],
    ).toBe(false);
  });

  it("expands and collapses all groups", () => {
    const ids = useBudgetStore
      .getState()
      .plan.categoryGroups.filter((g) => !g.deletedAt)
      .map((g) => g.id);
    useBudgetStore.getState().setAllSettingsCategoryGroupsExpanded(ids, true);
    const expanded =
      useBudgetStore.getState().plan.preferences
        .settingsCategoryGroupsExpanded ?? {};
    for (const id of ids) expect(expanded[id]).toBe(true);

    useBudgetStore.getState().setAllSettingsCategoryGroupsExpanded(ids, false);
    const collapsed =
      useBudgetStore.getState().plan.preferences
        .settingsCategoryGroupsExpanded ?? {};
    for (const id of ids) expect(collapsed[id]).toBe(false);
  });
});
