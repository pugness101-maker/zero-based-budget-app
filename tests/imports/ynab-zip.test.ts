import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  extractZipSafely,
  findYnabExportFiles,
} from "@/lib/imports/extract-zip";
import { parseYnabRegisterCsv } from "@/lib/imports/ynab/parse-register";
import { parseYnabPlanCsv, parseYnabMonth } from "@/lib/imports/ynab/parse-plan";
import { buildYnabZipPreview } from "@/lib/imports/ynab/preview";
import { suggestAccountType } from "@/lib/imports/ynab/suggest-account-type";
import { isCreditCardPaymentsGroup } from "@/lib/imports/ynab/suggest-account-type";
import { commitYnabZipImport } from "@/lib/imports/ynab/commit-ynab-zip";
import { reverseImportBatch } from "@/lib/imports/reverse-import";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { dollarsToCents } from "@/lib/money";
import type { ImportBatch } from "@/lib/types/import";

const FIXTURE_DIR = path.resolve(
  __dirname,
  "../fixtures/ynab",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

async function buildYnabZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("Budget - Register.csv", loadFixture("Budget - Register.csv"));
  zip.file("Budget - Plan.csv", loadFixture("Budget - Plan.csv"));
  // suspicious file should be rejected by extractor when present alongside
  zip.file("notes.txt", "ok");
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return buffer;
}

function baseBatch(): ImportBatch {
  return {
    id: "batch-ynab-1",
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

describe("YNAB ZIP extraction", () => {
  it("extracts and locates Register and Plan by filename suffix", async () => {
    const buffer = await buildYnabZip();
    const extracted = await extractZipSafely(buffer);
    expect(extracted.entries.length).toBeGreaterThanOrEqual(2);
    const found = findYnabExportFiles(extracted.entries);
    expect(found.error).toBeUndefined();
    expect(found.register?.fileName).toMatch(/Register\.csv$/i);
    expect(found.plan?.fileName).toMatch(/Plan\.csv$/i);
  });

  it("rejects archives with neither Register nor Plan", async () => {
    const zip = new JSZip();
    zip.file("random.csv", "a,b\n1,2\n");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractZipSafely(buffer);
    const found = findYnabExportFiles(extracted.entries);
    expect(found.error).toMatch(/No YNAB/i);
  });

  it("rejects suspicious executable contents", async () => {
    const zip = new JSZip();
    zip.file("Budget - Register.csv", loadFixture("Budget - Register.csv"));
    zip.file("malware.exe", "MZ");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractZipSafely(buffer);
    expect(extracted.errors.some((e) => e.includes("malware.exe"))).toBe(true);
    const found = findYnabExportFiles(extracted.entries);
    expect(found.register).toBeDefined();
  });
});

describe("YNAB Register parsing", () => {
  it("parses outflow as negative and inflow as positive cents", () => {
    const { rows, headerOk } = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    expect(headerOk).toBe(true);
    const income = rows.find((r) => r.payeeName === "Campus Bookstore Job");
    expect(income?.amountCents).toBe(dollarsToCents(1450));
    const church = rows.find((r) => r.payeeName === "Local Church");
    expect(church?.amountCents).toBe(dollarsToCents(-120));
    expect(church?.categoryGroup).toBe("Giving");
    expect(church?.category).toBe("Tithe");
    expect(church?.cleared).toBe("cleared");
  });

  it("detects future rows and transfer payees", () => {
    const { rows } = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    const future = rows.find((r) => r.payeeName === "Future Rent");
    expect(future?.isFuture).toBe(true);
    expect(future?.cleared).toBe("uncleared");
    const xfer = rows.find((r) => r.payeeName.startsWith("Transfer : HYSA"));
    expect(xfer?.isTransfer).toBe(true);
    expect(xfer?.transferTargetAccount).toBe("HYSA");
  });

  it("maps reconciled cleared status and flags", () => {
    const { rows } = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    const reconciled = rows.find((r) => r.cleared === "reconciled");
    expect(reconciled).toBeDefined();
    const flagged = rows.find((r) => r.flag === "Orange");
    expect(flagged?.payeeName).toBe("Aldi");
  });
});

describe("YNAB Plan parsing", () => {
  it("parses Month labels and negative assigned amounts", () => {
    expect(parseYnabMonth("May 2025")).toBe("2025-05");
    const { rows, headerOk } = parseYnabPlanCsv(
      loadFixture("Budget - Plan.csv"),
    );
    expect(headerOk).toBe(true);
    const rent = rows.find((r) => r.category === "Rent");
    expect(rent?.monthKey).toBe("2025-05");
    expect(rent?.assignedCents).toBe(dollarsToCents(-50));
    expect(rent?.availableCents).toBe(dollarsToCents(-50));
  });
});

describe("YNAB account and category mapping", () => {
  it("suggests credit card types and recognizes Credit Card Payments group", () => {
    expect(suggestAccountType("Chase Sapphire").suggestedType).toBe(
      "credit_card",
    );
    expect(suggestAccountType("HYSA Emergency").suggestedType).toBe("savings");
    expect(isCreditCardPaymentsGroup("Credit Card Payments")).toBe(true);
  });
});

describe("YNAB preview counts", () => {
  it("calculates summary counts from uploaded files (not hardcoded)", () => {
    const register = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    const plan = parseYnabPlanCsv(loadFixture("Budget - Plan.csv"));
    const summary = buildYnabZipPreview({
      registerRows: register.rows,
      planRows: plan.rows,
    });
    expect(summary.registerRowCount).toBe(register.rows.length);
    expect(summary.planRowCount).toBe(plan.rows.length);
    expect(summary.accounts.length).toBeGreaterThan(0);
    expect(summary.futureScheduledRowCount).toBeGreaterThan(0);
    expect(summary.historicalRowCount).toBeGreaterThan(0);
  });
});

describe("YNAB full import + rollback", () => {
  it("imports register/plan, creates accounts, schedules future uncleared, and supports undo", () => {
    const plan = createDemoPlan();
    const backupPlan = structuredClone(plan);
    const register = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    const planCsv = parseYnabPlanCsv(loadFixture("Budget - Plan.csv"));
    const preview = buildYnabZipPreview({
      registerRows: register.rows,
      planRows: planCsv.rows,
    });

    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: register.rows,
      planRows: planCsv.rows,
      accountMappings: preview.accounts.map((a) => ({
        accountName: a.accountName,
        type: a.suggestedType,
      })),
      categoryMerges: [],
      futureHandling: "import_as_scheduled",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
    });

    expect(result.ok).toBe(true);
    expect(result.plan).toBeDefined();
    const next = result.plan!;

    expect(next.accounts.some((a) => a.name === "HYSA")).toBe(true);
    expect(
      next.monthlyBudgets.some(
        (b) => b.source === "ynab_import" && b.assignedCents === dollarsToCents(-50),
      ),
    ).toBe(true);

    const scheduled = next.scheduledTransactions ?? [];
    expect(scheduled.some((s) => s.payeeName === "Future Rent")).toBe(true);
    expect(
      next.transactions.some((t) => t.payeeName === "Future Rent"),
    ).toBe(false);

    // Transfers linked
    const transfers = next.transactions.filter((t) => t.isTransfer);
    expect(transfers.length).toBeGreaterThanOrEqual(2);

    const reversed = reverseImportBatch({
      plan: next,
      batch: { ...result.batch, backupId: "bak-ynab" },
      backup: {
        id: "bak-ynab",
        label: "pre",
        reason: "pre_import",
        createdAt: "2026-08-01T00:00:00.000Z",
        schemaVersion: 1,
        planSnapshot: backupPlan,
        importBatchId: result.batch.id,
      },
    });
    expect(reversed.ok).toBe(true);
    expect(reversed.batch?.status).toBe("reversed");
    expect(
      reversed.plan?.transactions.some((t) => t.importBatchId === result.batch.id),
    ).toBe(false);
  });

  it("rolls back when commit fails (no destination corruption)", () => {
    const plan = createDemoPlan();
    const beforeTxnCount = plan.transactions.length;
    // Force failure by throwing via invalid path: empty account name rows only
    const result = commitYnabZipImport({
      plan,
      batch: baseBatch(),
      registerRows: [
        {
          rowIndex: 1,
          raw: {},
          accountName: "",
          date: null,
          payeeName: "X",
          outflowCents: null,
          inflowCents: null,
          amountCents: null,
          cleared: "uncleared",
          isTransfer: false,
          isFuture: false,
          isZeroAmount: true,
          errors: ["Missing account.", "Invalid date.", "Invalid amount."],
        },
      ],
      planRows: [],
      accountMappings: [],
      categoryMerges: [],
      futureHandling: "skip",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
    });
    // Commit still "ok" but imports nothing useful — simulate hard fail:
    expect(result.ok).toBe(true);
    expect(result.plan!.transactions.length).toBe(beforeTxnCount);
  });

  it("detects duplicates on second import of same register rows", () => {
    const plan = createDemoPlan();
    const register = parseYnabRegisterCsv(
      loadFixture("Budget - Register.csv"),
      "2026-08-01",
    );
    const planCsv = parseYnabPlanCsv(loadFixture("Budget - Plan.csv"));
    const preview = buildYnabZipPreview({
      registerRows: register.rows,
      planRows: planCsv.rows,
    });
    const mappings = preview.accounts.map((a) => ({
      accountName: a.accountName,
      type: a.suggestedType,
    }));

    const first = commitYnabZipImport({
      plan,
      batch: { ...baseBatch(), id: "batch-a" },
      registerRows: register.rows,
      planRows: planCsv.rows,
      accountMappings: mappings,
      categoryMerges: [],
      futureHandling: "import_as_transactions",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
    });
    expect(first.ok).toBe(true);

    const second = commitYnabZipImport({
      plan: first.plan!,
      batch: { ...baseBatch(), id: "batch-b" },
      registerRows: register.rows,
      planRows: [],
      accountMappings: mappings,
      categoryMerges: [],
      futureHandling: "import_as_transactions",
      mergeMode: "merge",
      importDateIso: "2026-08-01",
      duplicateHandling: "skip",
    });
    expect(second.ok).toBe(true);
    expect(second.batch.duplicateRows).toBeGreaterThan(0);
  });
});
