import { describe, expect, it } from "vitest";
import { normalizeMoneyToCents, combineOutflowInflow } from "@/lib/imports/normalize-money";
import { normalizeDate } from "@/lib/imports/normalize-date";
import { parseCsv } from "@/lib/imports/parse-csv";
import { detectFileFormat } from "@/lib/imports/detect-file-format";
import { suggestMapping } from "@/lib/imports/mapping-presets";
import { mapRawRow } from "@/lib/imports/validation";
import { detectDuplicates } from "@/lib/imports/detect-duplicates";
import { applyCategoryMatching } from "@/lib/imports/map-categories";
import {
  commitImport,
  commitAccountBalanceImport,
} from "@/lib/imports/import-transactions";
import { reverseImportBatch } from "@/lib/imports/reverse-import";
import { parseJsonBackup } from "@/lib/imports/parse-json-backup";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { dollarsToCents } from "@/lib/money";
import type { ImportBatch, ImportRow } from "@/lib/types/import";
import type { Transaction } from "@/lib/types/budget";

function baseBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "batch-1",
    householdId: "local",
    userId: "demo",
    fileName: "test.csv",
    fileType: "csv",
    importType: "transactions",
    status: "previewing",
    totalRows: 0,
    importedRows: 0,
    duplicateRows: 0,
    skippedRows: 0,
    errorRows: 0,
    mappingJson: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    mergeMode: "merge",
    ...overrides,
  };
}

describe("money parsing", () => {
  it("parses separate debit and credit columns", () => {
    expect(combineOutflowInflow("12.50", "")).toBe(-1250);
    expect(combineOutflowInflow("", "100.00")).toBe(10000);
    expect(combineOutflowInflow("5.00", "20.00")).toBe(1500);
  });

  it("parses a single signed amount column", () => {
    expect(normalizeMoneyToCents("-42.10")).toBe(-4210);
    expect(normalizeMoneyToCents("+15")).toBe(1500);
    expect(normalizeMoneyToCents("15.5")).toBe(1550);
  });

  it("handles currency symbols and commas", () => {
    expect(normalizeMoneyToCents("$1,234.56")).toBe(123456);
    expect(normalizeMoneyToCents("€99.00")).toBe(9900);
  });

  it("treats parentheses as negatives", () => {
    expect(normalizeMoneyToCents("(45.00)")).toBe(-4500);
    expect(normalizeMoneyToCents("($1,200.50)")).toBe(-120050);
  });
});

describe("date parsing", () => {
  it("supports multiple date formats", () => {
    expect(normalizeDate("2026-08-01")).toBe("2026-08-01");
    expect(normalizeDate("08/01/2026", "MM/DD/YYYY")).toBe("2026-08-01");
    expect(normalizeDate("01/08/2026", "DD/MM/YYYY")).toBe("2026-08-01");
    expect(normalizeDate("13/08/2026", "auto")).toBe("2026-08-13");
  });
});

describe("duplicate detection", () => {
  it("detects duplicate import IDs", () => {
    const existing: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acct-1",
        date: "2026-08-01",
        payeeName: "Store",
        categoryId: null,
        amountCents: -1000,
        cleared: "cleared",
        approved: true,
        isTransfer: false,
        importId: "FIT-99",
      },
    ];
    const rows: ImportRow[] = [
      {
        id: "r1",
        batchId: "b1",
        rowIndex: 1,
        raw: {},
        parsedDate: "2026-08-02",
        parsedAmountCents: -500,
        payeeName: "Other",
        importId: "FIT-99",
        status: "ready",
        errors: [],
        include: true,
      },
    ];
    const result = detectDuplicates(rows, existing, "acct-1");
    expect(result.rows[0]!.status).toBe("duplicate");
    expect(result.matches[0]!.reason).toBe("import_id");
  });

  it("detects fuzzy duplicates by date, amount, and similar payee/memo", () => {
    const existing: Transaction[] = [
      {
        id: "txn-1",
        accountId: "acct-1",
        date: "2026-08-01",
        payeeName: "Starbucks Coffee #123",
        memo: "Latte",
        categoryId: null,
        amountCents: -550,
        cleared: "cleared",
        approved: true,
        isTransfer: false,
      },
    ];
    const rows: ImportRow[] = [
      {
        id: "r1",
        batchId: "b1",
        rowIndex: 1,
        raw: {},
        parsedDate: "2026-08-01",
        parsedAmountCents: -550,
        payeeName: "Starbucks Coffee",
        memo: "Latte run",
        status: "ready",
        errors: [],
        include: true,
      },
    ];
    const result = detectDuplicates(rows, existing, "acct-1");
    expect(result.rows[0]!.status).toBe("duplicate");
    expect(result.matches[0]!.reason).toBe("fuzzy");
  });
});

describe("category matching", () => {
  it("flags missing categories when create is disabled", () => {
    const plan = createDemoPlan();
    const rows: ImportRow[] = [
      {
        id: "r1",
        batchId: "b1",
        rowIndex: 1,
        raw: {},
        parsedDate: "2026-08-01",
        parsedAmountCents: -100,
        payeeName: "X",
        categoryName: "Brand New Category",
        status: "ready",
        errors: [],
        include: true,
      },
    ];
    const result = applyCategoryMatching(rows, plan, [], false);
    expect(result.rows[0]!.status).toBe("needs_category");
    expect(result.categoriesToCreate).toHaveLength(0);
  });
});

describe("import commit", () => {
  it("creates a new account during import", () => {
    const plan = createDemoPlan();
    const rows: ImportRow[] = [
      {
        id: "r1",
        batchId: "batch-new",
        rowIndex: 1,
        raw: {},
        parsedDate: "2026-07-15",
        parsedAmountCents: -2500,
        payeeName: "Bookstore",
        categoryName: "Books",
        status: "ready",
        errors: [],
        include: true,
      },
    ];
    const beforeAccounts = plan.accounts.length;
    const result = commitImport({
      plan,
      batch: baseBatch({ id: "batch-new" }),
      rows,
      destination: {
        createAccount: {
          name: "Old Campus Checking",
          type: "checking",
          startingBalanceCents: 0,
        },
        startingBalanceBehavior: "keep_existing",
        createMissingCategories: false,
      },
      duplicateHandling: "skip",
      mergeMode: "merge",
      categoriesToCreate: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.accounts.length).toBe(beforeAccounts + 1);
    expect(result.plan.accounts.some((a) => a.name === "Old Campus Checking")).toBe(
      true,
    );
    expect(result.batch.importedRows).toBe(1);
  });

  it("rolls back conceptually when commit throws invalid state", () => {
    const plan = createDemoPlan();
    const result = commitImport({
      plan,
      batch: baseBatch(),
      rows: [
        {
          id: "r1",
          batchId: "batch-1",
          rowIndex: 1,
          raw: {},
          parsedDate: "2026-08-01",
          parsedAmountCents: -100,
          payeeName: "X",
          status: "ready",
          errors: [],
          include: true,
        },
      ],
      destination: {
        startingBalanceBehavior: "keep_existing",
        createMissingCategories: false,
        // no accountId and no createAccount → failure
      },
      duplicateHandling: "skip",
      mergeMode: "merge",
      categoriesToCreate: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/destination account/i);
  });

  it("undoes an entire import batch via backup restore", () => {
    const plan = createDemoPlan();
    const backupPlan = structuredClone(plan);
    const commit = commitImport({
      plan,
      batch: baseBatch({ id: "batch-undo" }),
      rows: [
        {
          id: "r1",
          batchId: "batch-undo",
          rowIndex: 1,
          raw: {},
          parsedDate: "2026-07-01",
          parsedAmountCents: -999,
          payeeName: "Undo Me",
          status: "ready",
          errors: [],
          include: true,
        },
      ],
      destination: {
        accountId: "acct-checking",
        startingBalanceBehavior: "keep_existing",
        createMissingCategories: false,
      },
      duplicateHandling: "skip",
      mergeMode: "merge",
      categoriesToCreate: [],
    });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;

    const reversed = reverseImportBatch({
      plan: commit.plan,
      batch: { ...commit.batch, backupId: "bak-1" },
      backup: {
        id: "bak-1",
        label: "pre",
        reason: "pre_import",
        createdAt: "2026-08-01T00:00:00.000Z",
        schemaVersion: 1,
        planSnapshot: backupPlan,
        importBatchId: "batch-undo",
      },
    });
    expect(reversed.ok).toBe(true);
    expect(reversed.plan?.transactions.some((t) => t.payeeName === "Undo Me")).toBe(
      false,
    );
    expect(reversed.batch?.status).toBe("reversed");
  });
});

describe("JSON backup", () => {
  it("previews a JSON backup restore", () => {
    const plan = createDemoPlan();
    const json = JSON.stringify({
      schemaVersion: 1,
      plan,
    });
    const preview = parseJsonBackup(json);
    expect(preview.ok).toBe(true);
    expect(preview.accountCount).toBe(plan.accounts.length);
    expect(preview.transactionCount).toBe(plan.transactions.length);
  });
});

describe("CSV mapping presets", () => {
  it("maps YNAB-style CSV columns", () => {
    const csv = `Date,Payee,Category,Memo,Outflow,Inflow
08/01/2026,Store,Food: Groceries,Weekly,45.00,
08/02/2026,Job,,Paycheck,,500.00
`;
    expect(detectFileFormat("ynab.csv", csv)).toBe("ynab_csv");
    const parsed = parseCsv(csv);
    const mapping = suggestMapping(parsed.headers, "ynab_csv");
    expect(mapping.Date).toBe("date");
    expect(mapping.Outflow).toBe("outflow");
    expect(mapping.Inflow).toBe("inflow");
    const row = mapRawRow(parsed.rows[0]!, mapping, "MM/DD/YYYY", 1, "b1");
    expect(row.parsedDate).toBe("2026-08-01");
    expect(row.parsedAmountCents).toBe(-4500);
    expect(row.categoryName).toBe("Food: Groceries");
  });

  it("maps generic bank CSV columns", () => {
    const csv = `Date,Description,Amount,Transaction ID
2026-07-10,Coffee Shop,-4.50,TX-1
2026-07-11,Direct Deposit,1200.00,TX-2
`;
    expect(detectFileFormat("bank.csv", csv)).toBe("generic_bank_csv");
    const parsed = parseCsv(csv);
    const mapping = suggestMapping(parsed.headers, "generic_bank_csv");
    const debit = mapRawRow(parsed.rows[0]!, mapping, "YYYY-MM-DD", 1, "b1");
    const credit = mapRawRow(parsed.rows[1]!, mapping, "YYYY-MM-DD", 2, "b1");
    expect(debit.parsedAmountCents).toBe(-450);
    expect(credit.parsedAmountCents).toBe(120000);
    expect(debit.importId).toBe("TX-1");
  });
});

describe("account balance import", () => {
  it("updates balances from a balance CSV-style rows", () => {
    const plan = createDemoPlan();
    const rows: ImportRow[] = [
      {
        id: "r1",
        batchId: "bal-1",
        rowIndex: 1,
        raw: { Account: "Checking", Balance: "1500.00" },
        accountName: "Checking",
        parsedAmountCents: dollarsToCents(1500),
        status: "ready",
        errors: [],
        include: true,
      },
    ];
    const result = commitAccountBalanceImport({
      plan,
      batch: baseBatch({ id: "bal-1", importType: "account_balances" }),
      rows,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const checking = result.plan.accounts.find((a) => a.name === "Checking");
    expect(checking?.startingBalanceCents).toBe(dollarsToCents(1500));
  });
});
