import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { parseYnabRegisterCsv } from "@/lib/imports/ynab/parse-register";
import { parseYnabPlanCsv } from "@/lib/imports/ynab/parse-plan";
import { buildYnabZipPreview } from "@/lib/imports/ynab/preview";
import { commitYnabZipImport } from "@/lib/imports/ynab/commit-ynab-zip";
import {
  applyImportScope,
  buildDefaultScopeFromRows,
} from "@/lib/imports/scope/apply-import-scope";
import {
  buildScopeAccountCandidates,
  buildScopeCategoryCandidates,
  categoryKey,
} from "@/lib/imports/scope/candidates";
import {
  doesPlanMonthOverlapRange,
  isRegisterDateInScope,
  resolveImportDatePreset,
} from "@/lib/imports/scope/date-scope";
import {
  loadImportScopePresets,
  saveImportScopePreset,
  selectionToPresetPayload,
} from "@/lib/imports/scope/presets";
import type { ImportScopeSelection } from "@/lib/imports/scope/types";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { UNCATEGORIZED_ID } from "@/lib/categories/deletion";
import type { ImportBatch } from "@/lib/types/import";
import { normalizeCategoryName } from "@/lib/imports/map-categories";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/ynab");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

function registerAndPlan() {
  const register = parseYnabRegisterCsv(
    loadFixture("Budget - Register.csv"),
    "2026-08-01",
  );
  const planCsv = parseYnabPlanCsv(loadFixture("Budget - Plan.csv"));
  return { register: register.rows, planRows: planCsv.rows };
}

function baseBatch(): ImportBatch {
  return {
    id: "batch-scope-1",
    householdId: "local",
    userId: "demo",
    fileName: "Budget.zip",
    fileType: "zip",
    importType: "ynab_zip",
    status: "previewing",
    totalRows: 0,
    importedRows: 0,
    duplicateRows: 0,
    skippedRows: 0,
    errorRows: 0,
    mappingJson: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    mergeMode: "merge",
  };
}

function allScope(
  register: ReturnType<typeof registerAndPlan>["register"],
  planRows: ReturnType<typeof registerAndPlan>["planRows"],
  overrides: Partial<ImportScopeSelection> = {},
): ImportScopeSelection {
  const plan = createDemoPlan();
  const accounts = buildScopeAccountCandidates({ registerRows: register, plan });
  const categories = buildScopeCategoryCandidates({
    registerRows: register,
    planRows,
    plan,
  });
  return {
    ...buildDefaultScopeFromRows({
      accountNames: accounts.map((a) => a.accountName),
      categoryKeys: categories.map((c) => c.key),
    }),
    ...overrides,
  };
}

describe("import date scope", () => {
  it("resolves 2026-only preset", () => {
    const range = resolveImportDatePreset("year_2026");
    expect(range.startDate).toBe("2026-01-01");
    expect(range.endDate).toBe("2026-12-31");
  });

  it("includes inclusive start and end dates", () => {
    expect(
      isRegisterDateInScope("2026-01-01", {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      }),
    ).toBe(true);
    expect(
      isRegisterDateInScope("2026-01-31", {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      }),
    ).toBe(true);
    expect(
      isRegisterDateInScope("2025-12-31", {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      }),
    ).toBe(false);
  });

  it("filters plan months by overlap with custom range", () => {
    const range = { startDate: "2025-01-15", endDate: "2025-03-10" };
    expect(doesPlanMonthOverlapRange("2025-01", range)).toBe(true);
    expect(doesPlanMonthOverlapRange("2025-02", range)).toBe(true);
    expect(doesPlanMonthOverlapRange("2025-03", range)).toBe(true);
    expect(doesPlanMonthOverlapRange("2025-04", range)).toBe(false);
    expect(doesPlanMonthOverlapRange("2024-12", range)).toBe(false);
  });
});

describe("applyImportScope accounts", () => {
  it("imports one selected account and excludes others", () => {
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "skip",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(
      result.registerRows.every((r) => r.accountName === "Checking"),
    ).toBe(true);
    expect(
      result.effectiveAccountNames.every(
        (n) => normalizeCategoryName(n) === normalizeCategoryName("Checking"),
      ),
    ).toBe(true);
    expect(result.summary.registerIncluded).toBeGreaterThan(0);
    expect(result.summary.registerExcluded).toBeGreaterThan(0);
  });

  it("imports several selected accounts", () => {
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking", "Credit Card"],
      transferHandlingMode: "skip",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    const names = new Set(result.registerRows.map((r) => r.accountName));
    expect(names.has("Checking")).toBe(true);
    expect(names.has("Credit Card")).toBe(true);
    expect(names.has("HYSA")).toBe(false);
  });

  it("handles transfer to unselected account via include_related", () => {
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "include_related_account",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(
      result.effectiveAccountNames.some(
        (n) => normalizeCategoryName(n) === normalizeCategoryName("HYSA"),
      ),
    ).toBe(true);
    expect(
      result.registerRows.some((r) => r.accountName === "HYSA" && r.isTransfer),
    ).toBe(true);
  });

  it("imports transfer side as normal without orphaned transfer links", () => {
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "import_as_normal",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    const converted = result.registerRows.find((r) =>
      r.payeeName.includes("Transfer involving"),
    );
    expect(converted?.isTransfer).toBe(false);
    expect(
      result.effectiveAccountNames.some(
        (n) => normalizeCategoryName(n) === normalizeCategoryName("HYSA"),
      ),
    ).toBe(false);
  });
});

describe("applyImportScope categories", () => {
  it("selects one category group", () => {
    const { register, planRows } = registerAndPlan();
    const foodKey = categoryKey("Food", "Groceries");
    const scope = allScope(register, planRows, {
      selectedCategoryKeys: [foodKey],
      unselectedCategoryHandlingMode: "skip",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(
      result.planRows.every((r) => r.category === "Groceries"),
    ).toBe(true);
    expect(
      result.registerRows
        .filter((r) => !r.isTransfer && r.category)
        .every((r) => r.category === "Groceries"),
    ).toBe(true);
  });

  it("excludes unselected categories and can import as Uncategorized", () => {
    const { register, planRows } = registerAndPlan();
    const foodKey = categoryKey("Food", "Groceries");
    const scope = allScope(register, planRows, {
      selectedCategoryKeys: [foodKey],
      unselectedCategoryHandlingMode: "import_uncategorized",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    const church = result.registerRows.find((r) => r.payeeName === "Local Church");
    expect(church).toBeDefined();
    expect(result.rowMeta.get(church!.rowIndex)?.categoryIdOverride).toBe(
      UNCATEGORIZED_ID,
    );
  });

  it("skips rows with unselected category", () => {
    const { register, planRows } = registerAndPlan();
    const foodKey = categoryKey("Food", "Groceries");
    const scope = allScope(register, planRows, {
      selectedCategoryKeys: [foodKey],
      unselectedCategoryHandlingMode: "skip",
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(
      result.registerRows.some((r) => r.payeeName === "Local Church"),
    ).toBe(false);
    expect(
      result.annotatedRegister.some(
        (r) =>
          r.payeeName === "Local Church" &&
          r.scopeDisposition === "skipped_category",
      ),
    ).toBe(true);
  });

  it("maps unselected category to existing id", () => {
    const { register, planRows } = registerAndPlan();
    const plan = createDemoPlan();
    const foodKey = categoryKey("Food", "Groceries");
    const titheKey = categoryKey("Giving", "Tithe");
    const dest = plan.categories[0]!.id;
    const scope = allScope(register, planRows, {
      selectedCategoryKeys: [foodKey],
      unselectedCategoryHandlingMode: "map_to_existing",
      categoryMappings: { [titheKey]: dest },
    });
    const result = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    const church = result.registerRows.find((r) => r.payeeName === "Local Church");
    expect(result.rowMeta.get(church!.rowIndex)?.categoryIdOverride).toBe(dest);
  });
});

describe("scope preview updates", () => {
  it("recalculates counts when date range changes", () => {
    const { register, planRows } = registerAndPlan();
    const all = applyImportScope({
      registerRows: register,
      planRows,
      scope: allScope(register, planRows),
    });
    const only2026 = applyImportScope({
      registerRows: register,
      planRows,
      scope: allScope(register, planRows, {
        dateRange: resolveImportDatePreset("year_2026"),
      }),
    });
    expect(only2026.summary.registerIncluded).toBeLessThan(
      all.summary.registerIncluded,
    );
    expect(only2026.summary.registerAfterDateFilter).toBeLessThan(
      all.summary.registerAfterDateFilter,
    );
  });
});

describe("saved import presets", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
      removeItem: (k: string) => map.delete(k),
    };
  });

  it("saves and loads a scope preset", () => {
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      dateRange: resolveImportDatePreset("year_2026"),
    });
    const saved = saveImportScopePreset(
      selectionToPresetPayload("My Checking 2026", scope),
    );
    const loaded = loadImportScopePresets();
    expect(loaded.some((p) => p.id === saved.id)).toBe(true);
    expect(loaded[0]?.selectedAccountNames).toEqual(["Checking"]);
    expect(loaded[0]?.dateRange.preset).toBe("year_2026");
  });
});

describe("commit enforces scope server-side", () => {
  it("imports only selected account and stores scope on batch", () => {
    const plan = createDemoPlan();
    const { register, planRows } = registerAndPlan();
    const preview = buildYnabZipPreview({
      registerRows: register,
      planRows,
    });
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "skip",
      unselectedCategoryHandlingMode: "import_uncategorized",
    });

    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: register,
      planRows,
      accountMappings: preview.accounts.map((a) => ({
        accountName: a.accountName,
        type: a.suggestedType,
      })),
      categoryMerges: [],
      futureHandling: "import_as_scheduled",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });

    expect(result.ok).toBe(true);
    const next = result.plan!;
    const createdYnab = next.accounts.filter((a) => a.importedSource === "ynab");
    expect(createdYnab.every((a) => a.name === "Checking")).toBe(true);
    expect(next.accounts.some((a) => a.name === "HYSA" && a.importedSource === "ynab")).toBe(
      false,
    );
    expect(result.batch.selectedAccountNames).toEqual(["Checking"]);
    expect(result.batch.accountScopeMode).toBe("selected");
    expect(result.batch.excludedRowCount).toBeGreaterThan(0);

    // No orphaned transfers
    const orphans = next.transactions.filter(
      (t) =>
        t.isTransfer &&
        t.transferPairId &&
        !next.transactions.some((x) => x.id === t.transferPairId),
    );
    expect(orphans).toHaveLength(0);
  });

  it("does not create unselected categories", () => {
    const plan = createDemoPlan();
    const beforeCats = new Set(plan.categories.map((c) => c.name));
    const { register, planRows } = registerAndPlan();
    const preview = buildYnabZipPreview({ registerRows: register, planRows });
    const foodKey = categoryKey("Food", "Groceries");
    const scope = allScope(register, planRows, {
      selectedCategoryKeys: [foodKey],
      unselectedCategoryHandlingMode: "import_uncategorized",
      transferHandlingMode: "skip",
    });

    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: register,
      planRows,
      accountMappings: preview.accounts.map((a) => ({
        accountName: a.accountName,
        type: a.suggestedType,
      })),
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });

    expect(result.ok).toBe(true);
    const created = result.plan!.categories.filter(
      (c) => !beforeCats.has(c.name) && c.id !== UNCATEGORIZED_ID,
    );
    expect(created.every((c) => c.name === "Groceries")).toBe(true);
    expect(created.some((c) => c.name === "Tithe")).toBe(false);
  });

  it("rolls back entire batch on failure", () => {
    const plan = createDemoPlan();
    const before = structuredClone(plan);
    const { register, planRows } = registerAndPlan();
    const scope = allScope(register, planRows, {
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "review_one_by_one",
    });
    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: register,
      planRows,
      accountMappings: [],
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/transfer/i);
    // Pure function does not mutate input plan
    expect(plan.transactions.length).toBe(before.transactions.length);
  });

  it("custom date range filters register and overlapping plan months", () => {
    const plan = createDemoPlan();
    const { register, planRows } = registerAndPlan();
    const preview = buildYnabZipPreview({ registerRows: register, planRows });
    const scope = allScope(register, planRows, {
      dateRange: {
        preset: "custom",
        startDate: "2025-05-01",
        endDate: "2025-05-31",
      },
      transferHandlingMode: "include_related_account",
    });
    const previewScoped = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(
      previewScoped.registerRows.every(
        (r) => r.date && r.date >= "2025-05-01" && r.date <= "2025-05-31",
      ),
    ).toBe(true);
    expect(
      previewScoped.planRows.every((r) => r.monthKey === "2025-05"),
    ).toBe(true);

    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: register,
      planRows,
      accountMappings: preview.accounts.map((a) => ({
        accountName: a.accountName,
        type: a.suggestedType,
      })),
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });
    expect(result.ok).toBe(true);
    expect(result.batch.dateRangeStart).toBe("2025-05-01");
    expect(result.batch.dateRangeEnd).toBe("2025-05-31");
    expect(
      result.plan!.transactions
        .filter((t) => t.importBatchId === result.batch.id)
        .every((t) => t.date >= "2025-05-01" && t.date <= "2025-05-31"),
    ).toBe(true);
  });
});
