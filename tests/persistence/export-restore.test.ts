import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildTransactionsCsv,
  filterTransactions,
} from "@/lib/exports/csv";
import {
  countBackupRecords,
  parseFullBackup,
  serializeFullBackup,
} from "@/lib/exports/full-backup";
import {
  applyRestoreMode,
  buildRestorePreview,
  mergePlans,
} from "@/lib/imports/restore-backup";
import {
  formatBackupFilename,
  formatCsvFilename,
} from "@/lib/persistence/download";
import { pruneBackups } from "@/lib/persistence/prune-backups";
import { BUDGET_STORAGE_KEY } from "@/lib/persistence/storage";
import { useSaveStatusStore } from "@/lib/persistence/save-status-store";
import type { BackupRecord } from "@/lib/types/import";
import { computeReadyToAssign } from "@/lib/calculations/plan";

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

function resetStore() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    selectedMonthKey: plan.workingMonthKey,
    importBatches: [],
    importRowsByBatch: {},
    backups: [],
    auditEvents: [],
    payeeAliasRules: {},
    categoryImportRules: {},
    undoStack: [],
    redoStack: [],
    toastMessage: null,
    persistRevision: 0,
    hydrated: true,
  });
  useSaveStatusStore.setState({
    saveStatus: "idle",
    lastSavedAt: null,
    saveError: null,
  });
}

describe("demo persistence", () => {
  beforeEach(() => {
    // Vitest node env: provide a localStorage shim for persist tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = memoryStorage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = globalThis;
    resetStore();
  });

  it("persists plan mutations into localStorage key", async () => {
    const store = useBudgetStore.getState();
    const acct = store.plan.accounts[0]!;
    store.updateAccount(acct.id, { note: "persisted-note" });
    useBudgetStore.getState().retryPersist();
    await Promise.resolve();

    const after = localStorage.getItem(BUDGET_STORAGE_KEY);
    expect(after).toBeTruthy();
    const parsed = JSON.parse(after!);
    expect(
      parsed.state.plan.accounts.find((a: { id: string }) => a.id === acct.id)
        ?.note,
    ).toBe("persisted-note");
  });

  it("does not reset to seed after simulated refresh (rehydrate)", async () => {
    const store = useBudgetStore.getState();
    store.updateAccount(store.plan.accounts[0]!.id, { name: "My Checking" });
    useBudgetStore.getState().retryPersist();
    await Promise.resolve();

    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    expect(saved).toBeTruthy();

    // Simulate refresh: seed store, then reload persisted plan
    resetStore();
    const hydrated = JSON.parse(saved!).state.plan;
    useBudgetStore.setState({ plan: hydrated });
    expect(
      useBudgetStore
        .getState()
        .plan.accounts.some((a) => a.name === "My Checking"),
    ).toBe(true);
  });

  it("reset demo data requires explicit call and creates backup", () => {
    const store = useBudgetStore.getState();
    store.updateAccount(store.plan.accounts[0]!.id, { name: "Custom" });
    store.resetDemoData();
    expect(useBudgetStore.getState().backups.length).toBeGreaterThan(0);
    expect(useBudgetStore.getState().backups[0]!.reason).toBe(
      "pre_destructive_migration",
    );
    expect(useBudgetStore.getState().plan.accounts[0]!.name).not.toBe("Custom");
  });
});

describe("full JSON backup", () => {
  beforeEach(() => {
    resetStore();
  });

  it("exports schemaVersion, appVersion, and core collections", () => {
    const state = useBudgetStore.getState();
    const json = serializeFullBackup({
      plan: state.plan,
      payeeAliasRules: state.payeeAliasRules,
      categoryImportRules: state.categoryImportRules,
      importBatches: state.importBatches,
      auditEvents: state.auditEvents,
      backups: state.backups,
    });
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBeGreaterThan(0);
    expect(parsed.appVersion).toBeTruthy();
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.plan.accounts.length).toBeGreaterThan(0);
    expect(parsed.plan.transactions.length).toBeGreaterThan(0);
    expect(parsed.plan.categories.length).toBeGreaterThan(0);
    expect(parsed.preferences).toBeTruthy();
  });

  it("excludes secrets from backup payload", () => {
    const plan = createDemoPlan();
    (plan.preferences as unknown as Record<string, unknown>).apiToken =
      "secret-token";
    (plan.preferences as unknown as Record<string, unknown>).password = "nope";
    const json = serializeFullBackup({ plan });
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("nope");
    expect(json.toLowerCase()).not.toMatch(/"apitoken"\s*:/);
  });

  it("includes hidden and closed records", () => {
    const plan = createDemoPlan();
    plan.accounts[0]!.isHidden = true;
    plan.accounts[1]!.closed = true;
    plan.accounts[1]!.closedAt = "2026-01-01T00:00:00.000Z";
    plan.categories[0]!.hidden = true;
    plan.categories[1]!.isArchived = true;
    const parsed = parseFullBackup(serializeFullBackup({ plan }));
    expect(parsed.ok).toBe(true);
    expect(parsed.plan!.accounts.some((a) => a.isHidden)).toBe(true);
    expect(parsed.plan!.accounts.some((a) => a.closed)).toBe(true);
    expect(parsed.plan!.categories.some((c) => c.hidden)).toBe(true);
    expect(parsed.plan!.categories.some((c) => c.isArchived)).toBe(true);
  });

  it("round-trips import of exported JSON", () => {
    const state = useBudgetStore.getState();
    const json = serializeFullBackup({ plan: state.plan });
    const rtaBefore = computeReadyToAssign(
      state.plan,
      state.plan.workingMonthKey,
    );
    const txnCount = state.plan.transactions.length;

    useBudgetStore.setState({
      plan: {
        ...createDemoPlan(),
        accounts: [],
        transactions: [],
        categories: [],
        categoryGroups: [],
        targets: [],
        monthlyBudgets: [],
        payees: [],
      },
    });

    const result = useBudgetStore.getState().restoreJsonBackup(json, "replace");
    expect(result.ok).toBe(true);
    const after = useBudgetStore.getState().plan;
    expect(after.transactions.length).toBe(txnCount);
    expect(computeReadyToAssign(after, after.workingMonthKey)).toBe(rtaBefore);
  });
});

describe("CSV exports", () => {
  it("builds transactions CSV with required headers", () => {
    const plan = createDemoPlan();
    const { csv, rowCount } = buildTransactionsCsv(plan, {
      includeTransfers: true,
      includeHiddenAccounts: true,
      includeClosedAccounts: true,
    });
    expect(rowCount).toBeGreaterThan(0);
    expect(csv.split("\n")[0]).toContain("Date");
    expect(csv.split("\n")[0]).toContain("Outflow");
    expect(csv.split("\n")[0]).toContain("Transfer Account");
  });

  it("filters transactions by date range", () => {
    const plan = createDemoPlan();
    const all = filterTransactions(plan, { includeTransfers: true });
    const filtered = filterTransactions(plan, {
      includeTransfers: true,
      startDate: "2099-01-01",
    });
    expect(filtered.length).toBe(0);
    expect(all.length).toBeGreaterThan(0);
  });
});

describe("download filenames", () => {
  it("formats backup filename everydollarflow-backup-YYYY-MM-DD-HHmm.json", () => {
    const name = formatBackupFilename(new Date(2026, 7, 1, 15, 7, 0));
    expect(name).toBe("everydollarflow-backup-2026-08-01-1507.json");
  });

  it("formats CSV filename", () => {
    expect(
      formatCsvFilename("transactions", new Date(2026, 7, 1, 12, 0, 0)),
    ).toBe("everydollarflow-transactions-2026-08-01.csv");
  });
});

describe("restore merge/replace/rollback", () => {
  beforeEach(() => resetStore());

  it("merge restore keeps current conflicting ids", () => {
    const current = createDemoPlan();
    const incoming = structuredClone(current);
    incoming.accounts[0]!.name = "Renamed In Backup";
    incoming.transactions.push({
      ...incoming.transactions[0]!,
      id: "txn-unique-merge",
      payeeName: "New Payee From Backup",
    });
    const merged = mergePlans(current, incoming);
    expect(merged.accounts[0]!.name).toBe(current.accounts[0]!.name);
    expect(merged.transactions.some((t) => t.id === "txn-unique-merge")).toBe(
      true,
    );
    const preview = buildRestorePreview(current, incoming);
    expect(preview.conflicts.length).toBeGreaterThan(0);
  });

  it("replace restore overwrites plan", () => {
    const current = createDemoPlan();
    const incoming = structuredClone(current);
    incoming.name = "Restored Plan";
    const next = applyRestoreMode(current, incoming, "replace");
    expect(next.name).toBe("Restored Plan");
  });

  it("failed restore rolls back plan", () => {
    const before = structuredClone(useBudgetStore.getState().plan);
    const bad = JSON.stringify({ schemaVersion: 1, plan: { accounts: [] } });
    const result = useBudgetStore.getState().restoreJsonBackup(bad, "replace");
    expect(result.ok).toBe(false);
    expect(useBudgetStore.getState().plan.accounts.length).toBe(
      before.accounts.length,
    );
  });

  it("creates automatic backup before restore", () => {
    const json = serializeFullBackup({
      plan: useBudgetStore.getState().plan,
    });
    useBudgetStore.getState().restoreJsonBackup(json, "merge");
    expect(
      useBudgetStore
        .getState()
        .backups.some((b) => b.reason === "pre_restore"),
    ).toBe(true);
  });

  it("preserves transfer links and goal links on replace restore", () => {
    const plan = useBudgetStore.getState().plan;
    const transfer = plan.transactions.find((t) => t.isTransfer && t.transferPairId);
    const goal = plan.targets[0];
    expect(transfer || goal).toBeTruthy();
    const json = serializeFullBackup({ plan });
    useBudgetStore.getState().restoreJsonBackup(json, "replace");
    const after = useBudgetStore.getState().plan;
    if (transfer) {
      const t = after.transactions.find((x) => x.id === transfer.id);
      expect(t?.transferPairId).toBe(transfer.transferPairId);
    }
    if (goal) {
      const g = after.targets.find((x) => x.id === goal.id);
      expect(g?.categoryId ?? g?.accountId).toBe(
        goal.categoryId ?? goal.accountId,
      );
    }
  });
});

describe("automatic backups", () => {
  beforeEach(() => resetStore());

  it("creates backup before bulk delete", () => {
    const ids = useBudgetStore
      .getState()
      .plan.transactions.slice(0, 2)
      .map((t) => t.id);
    useBudgetStore.getState().bulkDeleteTransactions(ids);
    expect(
      useBudgetStore
        .getState()
        .backups.some((b) => b.reason === "pre_bulk_delete"),
    ).toBe(true);
  });

  it("prunes to latest 5 automatic backups", () => {
    const plan = createDemoPlan();
    const autos: BackupRecord[] = Array.from({ length: 8 }, (_, i) => ({
      id: `bak-${i}`,
      label: `auto ${i}`,
      reason: "automatic" as const,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
      schemaVersion: 1,
      planSnapshot: plan,
      recordCount: countBackupRecords(plan),
    }));
    const pruned = pruneBackups(autos);
    expect(pruned.filter((b) => b.reason === "automatic").length).toBe(5);
  });
});

describe("auto-save status", () => {
  it("setSaveStatus updates indicator fields", () => {
    useSaveStatusStore.getState().setSaveStatus("saving");
    expect(useSaveStatusStore.getState().saveStatus).toBe("saving");
    useSaveStatusStore.getState().setSaveStatus("saved");
    expect(useSaveStatusStore.getState().saveStatus).toBe("saved");
    expect(useSaveStatusStore.getState().lastSavedAt).toBeTruthy();
    useSaveStatusStore.getState().setSaveStatus("failed", "quota");
    expect(useSaveStatusStore.getState().saveError).toBe("quota");
  });

  it("retryPersist bumps revision", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = memoryStorage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = globalThis;
    Object.defineProperty(globalThis.navigator ?? {}, "onLine", {
      configurable: true,
      get: () => true,
    });
    const before = useBudgetStore.getState().persistRevision;
    useBudgetStore.getState().retryPersist();
    expect(useBudgetStore.getState().persistRevision).toBe(before + 1);
    await Promise.resolve();
    expect(["saving", "saved", "offline_pending"]).toContain(
      useSaveStatusStore.getState().saveStatus,
    );
  });
});

describe("stable ids", () => {
  it("keeps account and category ids across serialize/parse", () => {
    const plan = createDemoPlan();
    const ids = {
      accounts: plan.accounts.map((a) => a.id).sort(),
      categories: plan.categories.map((c) => c.id).sort(),
    };
    const parsed = parseFullBackup(serializeFullBackup({ plan }));
    expect(parsed.plan!.accounts.map((a) => a.id).sort()).toEqual(ids.accounts);
    expect(parsed.plan!.categories.map((c) => c.id).sort()).toEqual(
      ids.categories,
    );
  });
});
