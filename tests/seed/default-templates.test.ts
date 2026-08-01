import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import {
  CUSTOM_TRACKING_ASSET_OPTIONS,
  DEFAULT_CATEGORY_GROUP_DEFS,
  DEFAULT_CATEGORY_GROUP_IDS,
  REMOVED_DEFAULT_ASSET_NAMES,
  REMOVED_DEFAULT_LIABILITY_NAMES,
  isTrackingAssetAccount,
  isTrackingLiabilityAccount,
} from "@/lib/seed/default-templates";
import { useBudgetStore } from "@/lib/store/budget-store";
import { applySimplifiedDefaultTemplate } from "@/lib/categories/apply-default-template";

describe("simplified default templates", () => {
  it("new budget contains only the 15 approved category groups", () => {
    const plan = createDemoPlan();
    const groups = plan.categoryGroups.filter((g) => !g.deletedAt);
    expect(groups).toHaveLength(15);
    expect(groups.map((g) => g.id).sort()).toEqual(
      [...DEFAULT_CATEGORY_GROUP_IDS].sort(),
    );
    expect(groups.map((g) => g.name)).toEqual(
      DEFAULT_CATEGORY_GROUP_DEFS.map((g) => g.name),
    );
  });

  it("Hidden group is last and collapsed", () => {
    const plan = createDemoPlan();
    const sorted = [...plan.categoryGroups].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const last = sorted[sorted.length - 1]!;
    expect(last.name).toBe("Hidden");
    expect(last.id).toBe("grp-hidden");
    expect(last.collapsed).toBe(true);
    expect(sorted.slice(0, -1).every((g) => g.collapsed === false)).toBe(true);
  });

  it("tracking liabilities stay hidden when none exist", () => {
    const plan = createDemoPlan();
    expect(plan.accounts.some(isTrackingLiabilityAccount)).toBe(false);
    expect(plan.preferences.enableTrackingLiabilities).toBe(false);
  });

  it("default tracking assets are Brokerage, Retirement, HSA only", () => {
    const plan = createDemoPlan();
    const assets = plan.accounts.filter(isTrackingAssetAccount);
    expect(assets.map((a) => a.name).sort()).toEqual(
      ["Brokerage", "HSA", "Retirement"].sort(),
    );
    for (const name of REMOVED_DEFAULT_ASSET_NAMES) {
      expect(assets.some((a) => a.name === name)).toBe(false);
    }
    for (const name of REMOVED_DEFAULT_LIABILITY_NAMES) {
      expect(plan.accounts.some((a) => a.name === name)).toBe(false);
    }
  });

  it("removed asset types remain available as custom options", () => {
    const labels = CUSTOM_TRACKING_ASSET_OPTIONS.map((o) => o.label);
    expect(labels).toContain("529");
    expect(labels).toContain("Real Estate");
    expect(labels).toContain("Vehicles");
    expect(labels).toContain("Other Assets");
  });
});

describe("enable tracking liabilities", () => {
  beforeEach(() => {
    const plan = createDemoPlan();
    useBudgetStore.setState({
      plan,
      undoStack: [],
      redoStack: [],
      backups: [],
      toastMessage: null,
    });
  });

  it("enabling in settings allows adding a liability account", () => {
    const store = useBudgetStore.getState();
    expect(
      store.addTrackingAccount({
        name: "Student Loan",
        type: "student_loan",
        isLiability: true,
      }).ok,
    ).toBe(false);

    store.setEnableTrackingLiabilities(true);
    const added = useBudgetStore.getState().addTrackingAccount({
      name: "Student Loan",
      type: "student_loan",
      isLiability: true,
    });
    expect(added.ok).toBe(true);
    const liabilities = useBudgetStore
      .getState()
      .plan.accounts.filter(isTrackingLiabilityAccount);
    expect(liabilities).toHaveLength(1);
    expect(liabilities[0]!.name).toBe("Student Loan");
  });

  it("first liability account is detectable for sidebar reveal", () => {
    useBudgetStore.getState().setEnableTrackingLiabilities(true);
    useBudgetStore.getState().addTrackingAccount({
      name: "Auto Loan",
      type: "auto_loan",
      isLiability: true,
    });
    const plan = useBudgetStore.getState().plan;
    const liabilities = plan.accounts.filter(
      (a) => !a.deletedAt && isTrackingLiabilityAccount(a),
    );
    expect(liabilities.length).toBeGreaterThan(0);
  });
});

describe("existing budgets not overwritten", () => {
  it("custom groups survive without apply-template", () => {
    const custom = createDemoPlan();
    custom.categoryGroups = [
      {
        id: "grp-custom",
        name: "My Custom Group",
        sortOrder: 0,
        hidden: false,
      },
    ];
    custom.categories = custom.categories.map((c) => ({
      ...c,
      groupId: "grp-custom",
    }));

    // Simulate rehydrate-style identity — plan stays as customized
    useBudgetStore.setState({ plan: custom });
    expect(useBudgetStore.getState().plan.categoryGroups).toHaveLength(1);
    expect(useBudgetStore.getState().plan.categoryGroups[0]!.name).toBe(
      "My Custom Group",
    );
  });

  it("apply template can map groups when user confirms", () => {
    const plan = createDemoPlan();
    // Pretend an old group still exists alongside defaults
    plan.categoryGroups = [
      ...plan.categoryGroups,
      {
        id: "grp-giving",
        name: "Giving",
        sortOrder: 20,
        hidden: false,
      },
    ];
    plan.categories.push({
      id: "cat-extra-gift",
      groupId: "grp-giving",
      name: "Birthday",
      sortOrder: 0,
      hidden: false,
      rollover: true,
    });

    const result = applySimplifiedDefaultTemplate(plan, {
      "grp-giving": "grp-gifts",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const birthday = result.plan.categories.find((c) => c.id === "cat-extra-gift");
    expect(birthday?.groupId).toBe("grp-gifts");
  });
});

describe("demo reset uses simplified defaults", () => {
  it("resetDemoData recreates 15 groups and no liabilities", () => {
    useBudgetStore.setState({
      plan: {
        ...createDemoPlan(),
        categoryGroups: [
          { id: "x", name: "Weird", sortOrder: 0, hidden: false },
        ],
      },
      backups: [],
      undoStack: [],
      redoStack: [],
    });
    useBudgetStore.getState().resetDemoData();
    const plan = useBudgetStore.getState().plan;
    expect(plan.categoryGroups.filter((g) => !g.deletedAt)).toHaveLength(15);
    expect(plan.accounts.some(isTrackingLiabilityAccount)).toBe(false);
    expect(
      plan.accounts.filter(isTrackingAssetAccount).map((a) => a.name).sort(),
    ).toEqual(["Brokerage", "HSA", "Retirement"].sort());
  });
});
