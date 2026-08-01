import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseYnabRegisterCsv } from "@/lib/imports/ynab/parse-register";
import { parseYnabPlanCsv } from "@/lib/imports/ynab/parse-plan";
import { buildYnabZipPreview } from "@/lib/imports/ynab/preview";
import { commitYnabZipImport } from "@/lib/imports/ynab/commit-ynab-zip";
import type { YnabAccountMapping } from "@/lib/imports/ynab/commit-ynab-zip";
import {
  applyImportScope,
  buildDefaultScopeFromRows,
} from "@/lib/imports/scope/apply-import-scope";
import {
  buildScopeAccountCandidates,
  buildScopeCategoryCandidates,
} from "@/lib/imports/scope/candidates";
import {
  accountMappingContinueBlocked,
  filterMappingsToSelectedAccounts,
  mappingsForCommit,
  upsertDraftAccountMappings,
} from "@/lib/imports/ynab/selected-account-mappings";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { normalizeCategoryName } from "@/lib/imports/map-categories";
import type { ImportBatch } from "@/lib/types/import";

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/ynab");

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

function fixtureRows() {
  const register = parseYnabRegisterCsv(
    loadFixture("Budget - Register.csv"),
    "2026-08-01",
  ).rows;
  const planRows = parseYnabPlanCsv(loadFixture("Budget - Plan.csv")).rows;
  return { register, planRows };
}

function draftFromPreview(register: ReturnType<typeof fixtureRows>["register"]) {
  const preview = buildYnabZipPreview({ registerRows: register, planRows: [] });
  return preview.accounts.map(
    (a): YnabAccountMapping => ({
      accountName: a.accountName,
      type: a.suggestedType,
    }),
  );
}

describe("filterMappingsToSelectedAccounts (Step 3)", () => {
  it("shows only 3 of 10 accounts when 3 are selected", () => {
    const drafts: YnabAccountMapping[] = Array.from({ length: 10 }, (_, i) => ({
      accountName: `Account ${i + 1}`,
      type: "checking" as const,
    }));
    const selected = ["Account 1", "Account 4", "Account 9"];
    const step3 = filterMappingsToSelectedAccounts(drafts, selected);

    expect(step3).toHaveLength(3);
    expect(step3.map((m) => m.accountName).sort()).toEqual(
      [...selected].sort(),
    );
    expect(drafts).toHaveLength(10);
  });

  it("removes an account from Step 3 when unselected", () => {
    const drafts = draftFromPreview(fixtureRows().register);
    const selected = drafts.map((d) => d.accountName);
    const withoutLast = selected.slice(0, -1);
    const step3 = filterMappingsToSelectedAccounts(drafts, withoutLast);
    expect(step3).toHaveLength(withoutLast.length);
    expect(
      step3.some(
        (m) =>
          normalizeCategoryName(m.accountName) ===
          normalizeCategoryName(selected[selected.length - 1]!),
      ),
    ).toBe(false);
  });

  it("restores previous mapping when an account is reselected", () => {
    let drafts = draftFromPreview(fixtureRows().register);
    const target = drafts[0]!.accountName;
    drafts = drafts.map((m) =>
      m.accountName === target ? { ...m, type: "cash" as const } : m,
    );

    const without = drafts
      .map((d) => d.accountName)
      .filter((n) => n !== target);
    expect(filterMappingsToSelectedAccounts(drafts, without)).not.toContainEqual(
      expect.objectContaining({ accountName: target }),
    );

    // Reselect — draft still holds cash
    const again = filterMappingsToSelectedAccounts(drafts, [
      ...without,
      target,
    ]);
    expect(again.find((m) => m.accountName === target)?.type).toBe("cash");
  });

  it("header count matches selection size", () => {
    const drafts: YnabAccountMapping[] = Array.from({ length: 10 }, (_, i) => ({
      accountName: `Acct ${i + 1}`,
      type: "checking" as const,
    }));
    const selected = drafts.slice(0, 5).map((d) => d.accountName);
    const step3 = filterMappingsToSelectedAccounts(drafts, selected);
    expect(step3.length).toBe(5);
    expect(
      `Confirm types for selected accounts only (${step3.length}).`,
    ).toBe("Confirm types for selected accounts only (5).");
  });

  it("does not include transfer-related effective accounts in Step 3", () => {
    const { register, planRows } = fixtureRows();
    const plan = createDemoPlan();
    const accounts = buildScopeAccountCandidates({ registerRows: register, plan });
    const categories = buildScopeCategoryCandidates({
      registerRows: register,
      planRows,
      plan,
    });
    const scope = {
      ...buildDefaultScopeFromRows({
        accountNames: accounts.map((a) => a.accountName),
        categoryKeys: categories.map((c) => c.key),
      }),
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "include_related_account" as const,
    };
    const scoped = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    // HYSA may be effective via transfer include
    expect(
      scoped.effectiveAccountNames.some(
        (n) => normalizeCategoryName(n) === normalizeCategoryName("HYSA"),
      ),
    ).toBe(true);

    const drafts = draftFromPreview(register);
    const step3 = filterMappingsToSelectedAccounts(drafts, ["Checking"]);
    expect(step3).toHaveLength(1);
    expect(step3[0]?.accountName).toBe("Checking");
    expect(
      step3.some(
        (m) => normalizeCategoryName(m.accountName) === normalizeCategoryName("HYSA"),
      ),
    ).toBe(false);
  });
});

describe("draft mappings and continue gate", () => {
  it("keeps draft mappings for unselected accounts via upsert", () => {
    const drafts = upsertDraftAccountMappings([], ["Checking", "HYSA"]);
    const afterType = drafts.map((m) =>
      m.accountName === "HYSA" ? { ...m, type: "savings" as const } : m,
    );
    const still = upsertDraftAccountMappings(afterType, ["Checking"]);
    expect(still.find((m) => m.accountName === "HYSA")?.type).toBe("savings");
  });

  it("blocks Continue when no accounts are selected", () => {
    const result = accountMappingContinueBlocked([], []);
    expect(result.blocked).toBe(true);
  });

  it("does not block Continue for unselected accounts missing types", () => {
    const selected: YnabAccountMapping[] = [
      { accountName: "Checking", type: "checking" },
    ];
    const result = accountMappingContinueBlocked(selected, ["Checking"]);
    expect(result.blocked).toBe(false);
  });
});

describe("unselected accounts excluded from confirmation and import", () => {
  it("excludes unselected accounts from confirmation mapping list", () => {
    const drafts = draftFromPreview(fixtureRows().register);
    const selected = ["Checking"];
    const forConfirm = filterMappingsToSelectedAccounts(drafts, selected);
    expect(forConfirm.map((m) => m.accountName)).toEqual(["Checking"]);
  });

  it("does not create unselected accounts during import", () => {
    const plan = createDemoPlan();
    const { register, planRows } = fixtureRows();
    const preview = buildYnabZipPreview({ registerRows: register, planRows });
    const drafts = preview.accounts.map((a) => ({
      accountName: a.accountName,
      type: a.suggestedType,
    }));
    const accounts = buildScopeAccountCandidates({ registerRows: register, plan });
    const categories = buildScopeCategoryCandidates({
      registerRows: register,
      planRows,
      plan,
    });
    const scope = {
      ...buildDefaultScopeFromRows({
        accountNames: accounts.map((a) => a.accountName),
        categoryKeys: categories.map((c) => c.key),
      }),
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "skip" as const,
    };
    const selected = filterMappingsToSelectedAccounts(drafts, ["Checking"]);
    const batch: ImportBatch = {
      id: "batch-sel-1",
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
      selectedAccountNames: ["Checking"],
    };

    const result = commitYnabZipImport({
      plan,
      batch,
      registerRows: register,
      planRows,
      accountMappings: selected,
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });

    expect(result.ok).toBe(true);
    const created = result.plan!.accounts.filter(
      (a) => a.importedSource === "ynab",
    );
    expect(created.every((a) => a.name === "Checking")).toBe(true);
    expect(created.some((a) => a.name === "HYSA")).toBe(false);
    expect(created.some((a) => a.name === "Credit Card")).toBe(false);
  });

  it("sends transfer to unselected account into review by default", () => {
    const { register, planRows } = fixtureRows();
    const plan = createDemoPlan();
    const accounts = buildScopeAccountCandidates({ registerRows: register, plan });
    const categories = buildScopeCategoryCandidates({
      registerRows: register,
      planRows,
      plan,
    });
    const scope = {
      ...buildDefaultScopeFromRows({
        accountNames: accounts.map((a) => a.accountName),
        categoryKeys: categories.map((c) => c.key),
      }),
      selectedAccountNames: ["Checking"],
      // default from buildDefaultScopeFromRows is review_one_by_one
    };
    expect(scope.transferHandlingMode).toBe("review_one_by_one");
    const scoped = applyImportScope({
      registerRows: register,
      planRows,
      scope,
    });
    expect(scoped.summary.transfersNeedingReview).toBeGreaterThan(0);
    expect(
      scoped.annotatedRegister.some(
        (r) =>
          r.scopeDisposition === "transfer_review" &&
          r.accountName === "Checking",
      ),
    ).toBe(true);
    // HYSA not auto-added to selected mappings
    const step3 = filterMappingsToSelectedAccounts(
      draftFromPreview(register),
      scope.selectedAccountNames,
    );
    expect(step3.every((m) => m.accountName === "Checking")).toBe(true);
  });

  it("stale draft mappings for unselected accounts do not affect final import", () => {
    const plan = createDemoPlan();
    const { register, planRows } = fixtureRows();
    const preview = buildYnabZipPreview({ registerRows: register, planRows });
    // Stale: user previously set Credit Card type, then unselected it
    const drafts = preview.accounts.map((a) => ({
      accountName: a.accountName,
      type:
        a.accountName === "Credit Card"
          ? ("loan" as const)
          : a.suggestedType,
    }));
    const accounts = buildScopeAccountCandidates({ registerRows: register, plan });
    const categories = buildScopeCategoryCandidates({
      registerRows: register,
      planRows,
      plan,
    });
    const scope = {
      ...buildDefaultScopeFromRows({
        accountNames: accounts.map((a) => a.accountName),
        categoryKeys: categories.map((c) => c.key),
      }),
      selectedAccountNames: ["Checking"],
      transferHandlingMode: "skip" as const,
    };
    const forCommit = mappingsForCommit({
      draftMappings: drafts,
      selectedAccountNames: ["Checking"],
      effectiveAccountNames: ["Checking"],
    });
    expect(forCommit).toHaveLength(1);
    expect(forCommit[0]?.accountName).toBe("Checking");

    const result = commitYnabZipImport({
      plan,
      batch: {
        id: "batch-stale",
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
      },
      registerRows: register,
      planRows,
      accountMappings: forCommit,
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
      importScope: scope,
    });
    expect(result.ok).toBe(true);
    expect(
      result.plan!.accounts.some(
        (a) => a.importedSource === "ynab" && a.name === "Credit Card",
      ),
    ).toBe(false);
  });
});
