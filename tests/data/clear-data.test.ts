import { beforeEach, describe, expect, it } from "vitest";
import {
  applyClearData,
  countClearableRecords,
  findOrphanedClearReferences,
} from "@/lib/data/clear-data";
import { createBlankPlan } from "@/lib/seed/blank-plan";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { DEFAULT_CATEGORY_GROUP_IDS } from "@/lib/seed/default-templates";
import { BUDGET_STORAGE_KEY } from "@/lib/persistence/storage";
import { useBudgetStore } from "@/lib/store/budget-store";
import { useSaveStatusStore } from "@/lib/persistence/save-status-store";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

function resetStore(plan = createDemoPlan()) {
  useBudgetStore.setState({
    plan,
    selectedMonthKey: plan.workingMonthKey,
    importBatches: [],
    importRowsByBatch: {},
    backups: [],
    lastClearBackupId: null,
    auditEvents: [],
    payeeAliasRules: { "starbucks coffee": "Starbucks" },
    categoryImportRules: {},
    undoStack: [{ id: "u1" } as never],
    redoStack: [{ id: "r1" } as never],
    toastMessage: null,
    persistRevision: 0,
    hydrated: true,
    importPromptDismissed: false,
  });
  useSaveStatusStore.setState({
    saveStatus: "idle",
    lastSavedAt: null,
    saveError: null,
  });
}

describe("clear data (pure)", () => {
  it("clears all app data into a blank budget by default", () => {
    const plan = createDemoPlan();
    const result = applyClearData(
      {
        plan,
        importBatches: [
          {
            id: "b1",
            householdId: "local",
            userId: "demo",
            fileName: "x.csv",
            fileType: "csv",
            importType: "transactions",
            status: "committed",
            totalRows: 1,
            importedRows: 1,
            duplicateRows: 0,
            skippedRows: 0,
            errorRows: 0,
            mappingJson: {},
            createdAt: new Date().toISOString(),
            mergeMode: "merge",
          },
        ],
        importRowsByBatch: {},
        payeeAliasRules: { a: "b" },
        categoryImportRules: { c: "d" },
        auditEvents: [],
        importPromptDismissed: true,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: "cat-1",
        undoStack: [1],
        redoStack: [2],
      },
      "all",
      "blank",
    );

    expect(result.plan.accounts).toHaveLength(0);
    expect(result.plan.transactions).toHaveLength(0);
    expect(result.plan.categories).toHaveLength(0);
    expect(result.plan.categoryGroups).toHaveLength(0);
    expect(result.plan.targets).toHaveLength(0);
    expect(result.plan.payees).toHaveLength(0);
    expect(result.plan.monthlyBudgets).toHaveLength(0);
    expect(result.plan.scheduledTransactions).toHaveLength(0);
    expect(result.importBatches).toHaveLength(0);
    expect(result.payeeAliasRules).toEqual({});
    expect(result.undoStack).toHaveLength(0);
    expect(result.redoStack).toHaveLength(0);
    expect(findOrphanedClearReferences(result.plan)).toHaveLength(0);
  });

  it("clears transactions only and preserves accounts/categories", () => {
    const plan = createDemoPlan();
    const accountCount = plan.accounts.length;
    const categoryCount = plan.categories.length;
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: {},
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "transactions",
      "blank",
    );
    expect(result.plan.transactions).toHaveLength(0);
    expect(result.plan.scheduledTransactions).toHaveLength(0);
    expect(result.plan.accounts).toHaveLength(accountCount);
    expect(result.plan.categories).toHaveLength(categoryCount);
  });

  it("clears goals only", () => {
    const plan = createDemoPlan();
    expect(plan.targets.length).toBeGreaterThan(0);
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: {},
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "goals",
      "blank",
    );
    expect(result.plan.targets).toHaveLength(0);
    expect(result.plan.accounts.length).toBe(plan.accounts.length);
    expect(result.plan.categories.length).toBe(plan.categories.length);
  });

  it("clears preferences only and keeps financial data", () => {
    const plan = createDemoPlan();
    plan.preferences.hideBalances = true;
    plan.preferences.transactionSort = {
      allTransactions: [{ field: "date", direction: "asc" }],
    };
    plan.accounts[0]!.isHidden = true;
    const txnCount = plan.transactions.length;
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: {},
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "preferences_only",
      "blank",
    );
    expect(result.plan.preferences.hideBalances).toBe(false);
    expect(result.plan.preferences.transactionSort).toBeUndefined();
    expect(result.plan.accounts[0]!.isHidden).toBe(false);
    expect(result.plan.transactions).toHaveLength(txnCount);
  });

  it("restores simplified template after clear", () => {
    const plan = createDemoPlan();
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: {},
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "all",
      "simplified_template",
    );
    expect(result.plan.accounts).toHaveLength(0);
    expect(result.plan.transactions).toHaveLength(0);
    expect(result.plan.categoryGroups.map((g) => g.id).sort()).toEqual(
      [...DEFAULT_CATEGORY_GROUP_IDS].sort(),
    );
  });

  it("restores demo data when chosen", () => {
    const plan = createBlankPlan();
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: {},
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "all",
      "demo",
    );
    expect(result.plan.name).toBe("Campus Life Plan");
    expect(result.plan.transactions.length).toBeGreaterThan(0);
  });

  it("does not leave orphaned references after category clear", () => {
    const plan = createDemoPlan();
    const result = applyClearData(
      {
        plan,
        importBatches: [],
        importRowsByBatch: {},
        payeeAliasRules: {},
        categoryImportRules: { coffee: "cat-x" },
        auditEvents: [],
        importPromptDismissed: false,
        selectedMonthKey: plan.workingMonthKey,
        selectedCategoryId: null,
        undoStack: [],
        redoStack: [],
      },
      "categories_and_groups",
      "blank",
    );
    expect(result.plan.categories).toHaveLength(0);
    expect(result.plan.categoryGroups).toHaveLength(0);
    expect(result.categoryImportRules).toEqual({});
    expect(findOrphanedClearReferences(result.plan)).toHaveLength(0);
    for (const t of result.plan.transactions) {
      expect(t.categoryId).toBeNull();
    }
  });
});

describe("clear data (store)", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = memoryStorage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = globalThis;
    resetStore();
  });

  it("creates an automatic backup before clearing", () => {
    const before = useBudgetStore.getState().plan.transactions.length;
    expect(before).toBeGreaterThan(0);
    const result = useBudgetStore.getState().clearData({
      scope: "transactions",
      after: "blank",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = useBudgetStore.getState();
    expect(state.backups.some((b) => b.id === result.backupId)).toBe(true);
    expect(state.backups[0]?.reason).toBe("pre_clear");
    expect(state.plan.transactions).toHaveLength(0);
    expect(state.backups[0]?.planSnapshot.transactions.length).toBe(before);
  });

  it("supports undo clear", () => {
    const beforeTxn = useBudgetStore.getState().plan.transactions.length;
    useBudgetStore.getState().clearData({ scope: "all", after: "blank" });
    expect(useBudgetStore.getState().plan.transactions).toHaveLength(0);
    const undo = useBudgetStore.getState().undoClearData();
    expect(undo.ok).toBe(true);
    expect(useBudgetStore.getState().plan.transactions.length).toBe(beforeTxn);
    expect(useBudgetStore.getState().lastClearBackupId).toBeNull();
  });

  it("starts blank after clear and does not repopulate demo on state", () => {
    useBudgetStore.getState().clearData({ scope: "all", after: "blank" });
    const plan = useBudgetStore.getState().plan;
    expect(plan.accounts).toHaveLength(0);
    expect(plan.transactions).toHaveLength(0);
    expect(plan.name).not.toBe("Campus Life Plan");
    // Simulating a "refresh" that rehydrates from current store snapshot
    // should keep blank — not call createDemoPlan again.
    const snapshot = structuredClone(plan);
    useBudgetStore.setState({ plan: snapshot });
    expect(useBudgetStore.getState().plan.transactions).toHaveLength(0);
  });

  it("records clear audit with backup id and counts", () => {
    const counts = countClearableRecords({
      plan: useBudgetStore.getState().plan,
      importBatches: [],
      auditEvents: [],
    });
    const result = useBudgetStore.getState().clearData({
      scope: "goals",
      after: "blank",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const event = useBudgetStore.getState().auditEvents[0];
    expect(event?.action).toBe("clear_data");
    expect(event?.metadata?.backupId).toBe(result.backupId);
    expect(event?.metadata?.clearType).toBe("goals");
    expect(event?.metadata?.recordCounts).toMatchObject({
      goals: counts.goals,
    });
    expect(event?.metadata?.user).toBe("demo");
  });

  it("leaves authentication-related localStorage keys intact", () => {
    localStorage.setItem("edf-auth-session", JSON.stringify({ user: "demo" }));
    localStorage.setItem("edf-subscription", JSON.stringify({ plan: "free" }));
    useBudgetStore.getState().clearData({ scope: "all", after: "blank" });
    expect(localStorage.getItem("edf-auth-session")).toContain("demo");
    expect(localStorage.getItem("edf-subscription")).toContain("free");
    // Budget key may update, but auth keys are untouched
    expect(BUDGET_STORAGE_KEY).toBeTruthy();
  });

  it("clears undo/redo stacks", () => {
    expect(useBudgetStore.getState().undoStack.length).toBeGreaterThan(0);
    useBudgetStore.getState().clearData({
      scope: "preferences_only",
      after: "blank",
    });
    expect(useBudgetStore.getState().undoStack).toHaveLength(0);
    expect(useBudgetStore.getState().redoStack).toHaveLength(0);
  });
});
