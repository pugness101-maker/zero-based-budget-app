"use client";

import { useMemo, useRef, useState } from "react";
import {
  X,
  Upload,
  FileSpreadsheet,
  Check,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  detectFileFormat,
  formatLabel,
  validateFileSize,
} from "@/lib/imports/detect-file-format";
import { parseCsv } from "@/lib/imports/parse-csv";
import { parseJsonBackup } from "@/lib/imports/parse-json-backup";
import { suggestMapping } from "@/lib/imports/mapping-presets";
import { mapRawRow, validateMapping } from "@/lib/imports/validation";
import { detectDuplicates } from "@/lib/imports/detect-duplicates";
import {
  applyCategoryMatching,
  ensureImportedGroup,
} from "@/lib/imports/map-categories";
import { MoneyText } from "@/components/shared/money-text";
import { PayeeCombobox } from "@/components/shared/payee-combobox";
import { formatDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/lib/types/budget";
import type {
  ColumnField,
  ColumnMapping,
  DateFormatHint,
  DestinationConfig,
  DuplicateHandling,
  ImportBatch,
  ImportCommitResult,
  ImportRow,
  ImportType,
  MergeMode,
  UploadedImportFile,
} from "@/lib/types/import";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/types/import";
import Link from "next/link";
import {
  extractZipSafely,
  findYnabExportFiles,
} from "@/lib/imports/extract-zip";
import { parseYnabRegisterCsv } from "@/lib/imports/ynab/parse-register";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import { parseYnabPlanCsv } from "@/lib/imports/ynab/parse-plan";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import { YnabZipFlow } from "@/components/imports/ynab-zip-flow";
import { toISODate } from "@/lib/dates";

const STEPS = [
  "Upload",
  "Type",
  "Destination",
  "Mapping",
  "Preview",
  "Duplicates",
  "Matching",
  "Confirm",
  "Result",
] as const;

const COLUMN_FIELDS: { value: ColumnField; label: string }[] = [
  { value: "ignore", label: "Ignore" },
  { value: "date", label: "Date" },
  { value: "payee", label: "Payee" },
  { value: "memo", label: "Memo" },
  { value: "category", label: "Category" },
  { value: "outflow", label: "Outflow" },
  { value: "inflow", label: "Inflow" },
  { value: "amount", label: "Signed amount" },
  { value: "account", label: "Account" },
  { value: "cleared", label: "Cleared" },
  { value: "flag", label: "Flag" },
  { value: "importId", label: "Import ID" },
];

type PreviewFilter = "all" | "ready" | "duplicate" | "needs_category" | "invalid";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function ImportWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const mappingPresets = useBudgetStore((s) => s.mappingPresets);
  const categoryImportRules = useBudgetStore((s) => s.categoryImportRules);
  const commitTransactionImport = useBudgetStore((s) => s.commitTransactionImport);
  const commitBudgetImport = useBudgetStore((s) => s.commitBudgetImport);
  const commitBalanceImport = useBudgetStore((s) => s.commitBalanceImport);
  const restoreJsonBackup = useBudgetStore((s) => s.restoreJsonBackup);
  const reverseImport = useBudgetStore((s) => s.reverseImport);
  const saveMappingPreset = useBudgetStore((s) => s.saveMappingPreset);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<UploadedImportFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importType, setImportType] = useState<ImportType>("auto");
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [destinationMode, setDestinationMode] = useState<"existing" | "new">(
    "existing",
  );
  const [accountId, setAccountId] = useState(plan.accounts[0]?.id ?? "");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("checking");
  const [startingBalanceBehavior, setStartingBalanceBehavior] =
    useState<DestinationConfig["startingBalanceBehavior"]>("keep_existing");
  const [budgetMonth, setBudgetMonth] = useState(monthKey);
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormatHint>("auto");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [duplicateHandling, setDuplicateHandling] =
    useState<DuplicateHandling>("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [batchId, setBatchId] = useState<string>("");
  const [jsonPreview, setJsonPreview] = useState<ReturnType<typeof parseJsonBackup> | null>(null);
  const [ynabZip, setYnabZip] = useState<{
    zipFileName: string;
    registerRows: YnabRegisterRow[];
    planRows: YnabPlanRow[];
    registerFileName?: string;
    planFileName?: string;
  } | null>(null);

  const activeFile = files[0];
  const resolvedType: ImportType = useMemo(() => {
    if (importType !== "auto") return importType;
    if (!activeFile) return "transactions";
    if (activeFile.detectedFormat === "json_backup") return "full_backup";
    if (activeFile.detectedFormat === "account_balance_csv")
      return "account_balances";
    if (activeFile.detectedFormat === "category_budget_csv")
      return "budget_history";
    return "transactions";
  }, [importType, activeFile]);

  const counts = useMemo(() => {
    const c = {
      ready: 0,
      duplicate: 0,
      needs_category: 0,
      invalid: 0,
      importable: 0,
    };
    for (const r of rows) {
      if (r.status === "ready") c.ready++;
      if (r.status === "duplicate") c.duplicate++;
      if (r.status === "needs_category") c.needs_category++;
      if (r.status === "invalid") c.invalid++;
      if (r.include && r.status !== "invalid") c.importable++;
    }
    return c;
  }, [rows]);

  const filteredPreview = rows.filter((r) =>
    previewFilter === "all" ? true : r.status === previewFilter,
  );

  if (!open) return null;

  async function handleFiles(fileList: FileList | File[]) {
    setUploadError(null);
    setYnabZip(null);
    const next: UploadedImportFile[] = [];
    for (const file of Array.from(fileList)) {
      const sizeError = validateFileSize(file.size);
      if (sizeError) {
        setUploadError(sizeError);
        continue;
      }
      if (!/\.(csv|json|zip)$/i.test(file.name)) {
        setUploadError("Only .csv, .json, and .zip files are supported.");
        continue;
      }

      if (/\.zip$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        const extracted = await extractZipSafely(buffer);
        const located = findYnabExportFiles(extracted.entries);
        if (located.error) {
          setUploadError(located.error);
          if (extracted.errors.length) {
            setUploadError(
              [located.error, ...extracted.errors.slice(0, 3)].join(" "),
            );
          }
          continue;
        }
        const importDate = toISODate(new Date());
        const registerParsed = located.register
          ? parseYnabRegisterCsv(located.register.content, importDate)
          : { rows: [] as YnabRegisterRow[], headerOk: true, headers: [] };
        const planParsed = located.plan
          ? parseYnabPlanCsv(located.plan.content)
          : { rows: [] as YnabPlanRow[], headerOk: true, headers: [] };

        if (located.register && !registerParsed.headerOk) {
          setUploadError("Register.csv headers do not match the YNAB format.");
          continue;
        }
        if (located.plan && !planParsed.headerOk) {
          setUploadError("Plan.csv headers do not match the YNAB format.");
          continue;
        }

        setYnabZip({
          zipFileName: file.name,
          registerRows: registerParsed.rows,
          planRows: planParsed.rows,
          registerFileName: located.register?.fileName,
          planFileName: located.plan?.fileName,
        });
        next.push({
          id: newId("file"),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/zip",
          content: "",
          detectedFormat: "ynab_zip",
          arrayBuffer: buffer,
        });
        continue;
      }

      const content = await file.text();
      const detectedFormat = detectFileFormat(file.name, content);
      next.push({
        id: newId("file"),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "text/plain",
        content,
        detectedFormat,
      });
    }
    if (next.length) {
      setFiles((prev) => [...prev, ...next]);
      const first = next[0]!;
      if (first.detectedFormat !== "ynab_zip") {
        prepareFromFile(first);
      }
    }
  }

  function prepareFromFile(file: UploadedImportFile) {
    setBatchId(newId("batch"));
    setResult(null);
    setConfirmed(false);
    if (file.detectedFormat === "json_backup") {
      setJsonPreview(parseJsonBackup(file.content));
      setImportType("full_backup");
      setHeaders([]);
      setRawRows([]);
      setRows([]);
      setMapping({});
      return;
    }
    const parsed = parseCsv(file.content);
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);
    const suggested = suggestMapping(parsed.headers, file.detectedFormat);
    setMapping(suggested);
    setJsonPreview(null);
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next[0]) prepareFromFile(next[0]);
      else {
        setHeaders([]);
        setRawRows([]);
        setRows([]);
        setMapping({});
        setJsonPreview(null);
      }
      return next;
    });
  }

  function rebuildRows(nextMapping = mapping, nextDateFormat = dateFormat) {
    if (!activeFile || resolvedType === "full_backup") return;
    const id = batchId || newId("batch");
    setBatchId(id);
    let mapped = rawRows.map((raw, idx) =>
      mapRawRow(raw, nextMapping, nextDateFormat, idx + 1, id),
    );

    const destAccount =
      destinationMode === "existing"
        ? accountId
        : "__new__";

    if (resolvedType === "transactions" && destAccount !== "__new__") {
      const dup = detectDuplicates(mapped, plan.transactions, destAccount);
      mapped = dup.rows;
    }

    // Apply saved category rules + auto match
    const decisions = Object.entries(categoryImportRules).map(
      ([sourceName, categoryId]) => ({
        sourceName,
        categoryId,
        saveRule: false,
      }),
    );
    const matched = applyCategoryMatching(
      mapped,
      plan,
      decisions,
      createMissingCategories,
      ensureImportedGroup(plan).id,
    );
    setRows(matched.rows);
  }

  function goNext() {
    if (step === 0 && files.length === 0) {
      setUploadError("Upload at least one file.");
      return;
    }
    if (step === 3 && resolvedType === "transactions") {
      const errors = validateMapping(mapping);
      if (errors.length) {
        setUploadError(errors.join(" "));
        return;
      }
      setUploadError(null);
      rebuildRows();
    }
    if (step === 2) {
      rebuildRows();
    }
    if (step === 4) {
      // refresh duplicates after preview edits
      rebuildRows();
    }
    if (step === 7 && !confirmed) return;
    if (step === 7) {
      runCommit();
      setStep(8);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function runCommit() {
    if (!activeFile) return;
    const batch: ImportBatch = {
      id: batchId || newId("batch"),
      householdId: "local",
      userId: "demo",
      fileName: files.map((f) => f.fileName).join(", "),
      fileType: activeFile.fileName.endsWith(".json") ? "json" : "csv",
      importType: resolvedType,
      destinationAccountId:
        destinationMode === "existing" ? accountId : undefined,
      status: "previewing",
      totalRows: rows.length,
      importedRows: 0,
      duplicateRows: counts.duplicate,
      skippedRows: 0,
      errorRows: counts.invalid,
      mappingJson: mapping,
      createdAt: new Date().toISOString(),
      mergeMode,
    };

    if (resolvedType === "full_backup") {
      setResult(restoreJsonBackup(activeFile.content, mergeMode));
      return;
    }

    if (resolvedType === "budget_history") {
      setResult(
        commitBudgetImport({
          batch,
          rows,
          monthKey: budgetMonth,
          createMissingCategories,
        }),
      );
      return;
    }

    if (resolvedType === "account_balances") {
      setResult(commitBalanceImport({ batch, rows }));
      return;
    }

    const destination: DestinationConfig = {
      accountId: destinationMode === "existing" ? accountId : undefined,
      createAccount:
        destinationMode === "new"
          ? {
              name: newAccountName || "Imported Account",
              type: newAccountType,
              startingBalanceCents: 0,
            }
          : undefined,
      startingBalanceBehavior,
      createMissingCategories,
      budgetMonthKey: budgetMonth,
    };

    const group = ensureImportedGroup(plan);
    const categoriesToCreate = createMissingCategories
      ? [
          ...new Map(
            rows
              .filter(
                (r) =>
                  r.categoryName &&
                  r.status !== "invalid" &&
                  !plan.categories.some(
                    (c) =>
                      c.name.toLowerCase() === r.categoryName!.toLowerCase(),
                  ),
              )
              .map((r) => [
                r.categoryName!.toLowerCase(),
                { name: r.categoryName!, groupId: group.id },
              ]),
          ).values(),
        ]
      : [];

    setResult(
      commitTransactionImport({
        batch,
        rows,
        destination,
        duplicateHandling,
        mergeMode,
        categoriesToCreate,
      }),
    );
  }

  function downloadErrorCsv() {
    if (!result?.errorCsv) return;
    const blob = new Blob([result.errorCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-0 md:items-center md:p-4">
      <div className="flex h-dvh w-full max-w-3xl flex-col bg-surface shadow-xl md:h-[min(90dvh,820px)] md:rounded-2xl border border-border overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {ynabZip ? "Import YNAB ZIP" : "Import past data"}
            </h2>
            <p className="text-xs text-muted">
              {ynabZip
                ? "Register + Plan export · merge by default · fully reversible"
                : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5"
            aria-label="Close import wizard"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {ynabZip ? (
          <YnabZipFlow
            zipFileName={ynabZip.zipFileName}
            registerRows={ynabZip.registerRows}
            planRows={ynabZip.planRows}
            registerFileName={ynabZip.registerFileName}
            planFileName={ynabZip.planFileName}
            onClose={onClose}
          />
        ) : (
          <>
        <div className="border-b border-border px-4 py-2 overflow-x-auto">
          <ol className="flex min-w-max gap-1">
            {STEPS.map((label, i) => (
              <li
                key={label}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium",
                  i === step
                    ? "bg-accent text-white"
                    : i < step
                      ? "bg-accent-muted text-accent"
                      : "bg-canvas text-muted",
                )}
              >
                {i + 1}. {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {uploadError && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {uploadError}
            </p>
          )}

          {step === 0 && (
            <div className="space-y-4">
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-canvas px-4 py-10 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
                }}
              >
                <Upload className="h-8 w-8 text-accent" />
                <div>
                  <p className="font-medium">
                    Drag and drop CSV, JSON, or YNAB ZIP
                  </p>
                  <p className="text-sm text-muted">
                    Max {MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB each · YNAB
                    exports with Register.csv + Plan.csv supported
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  Browse files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.zip,text/csv,application/json,application/zip"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-accent shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{f.fileName}</p>
                        <p className="text-xs text-muted">
                          {(f.fileSize / 1024).toFixed(1)} KB ·{" "}
                          {formatLabel(f.detectedFormat)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="text-xs text-muted hover:text-danger"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              {(
                [
                  ["auto", "Auto-detect"],
                  ["transactions", "Transactions"],
                  ["account_balances", "Account balances"],
                  ["budget_history", "Budget / category history"],
                  ["full_backup", "Full app backup"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3",
                    importType === value
                      ? "border-accent bg-accent-muted/40"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="importType"
                    checked={importType === value}
                    onChange={() => setImportType(value)}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
              <p className="text-sm text-muted">
                Resolved type: <strong>{resolvedType.replaceAll("_", " ")}</strong>
              </p>
              <div className="rounded-xl border border-border p-3 space-y-2">
                <p className="text-sm font-medium">Data mode</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={mergeMode === "merge"}
                    onChange={() => setMergeMode("merge")}
                  />
                  Merge (default) — keep existing data
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={mergeMode === "replace"}
                    onChange={() => setMergeMode("replace")}
                  />
                  Replace — explicit wipe for destination / full restore
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {resolvedType === "transactions" && (
                <>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDestinationMode("existing")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium",
                        destinationMode === "existing"
                          ? "bg-accent text-white"
                          : "border border-border",
                      )}
                    >
                      Existing account
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinationMode("new")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium",
                        destinationMode === "new"
                          ? "bg-accent text-white"
                          : "border border-border",
                      )}
                    >
                      Create new account
                    </button>
                  </div>
                  {destinationMode === "existing" ? (
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="input"
                    >
                      {plan.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="input"
                        placeholder="Account name"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                      />
                      <select
                        className="input"
                        value={newAccountType}
                        onChange={(e) =>
                          setNewAccountType(e.target.value as AccountType)
                        }
                      >
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                        <option value="cash">Cash</option>
                        <option value="credit_card">Credit card</option>
                      </select>
                    </div>
                  )}
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                      Starting balance behavior
                    </span>
                    <select
                      className="input"
                      value={startingBalanceBehavior}
                      onChange={(e) =>
                        setStartingBalanceBehavior(
                          e.target.value as DestinationConfig["startingBalanceBehavior"],
                        )
                      }
                    >
                      <option value="keep_existing">Keep existing</option>
                      <option value="set_from_file">Set from file</option>
                      <option value="ignore">Ignore</option>
                    </select>
                  </label>
                </>
              )}
              {resolvedType === "budget_history" && (
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                      Budget month
                    </span>
                    <input
                      type="month"
                      className="input"
                      value={budgetMonth}
                      onChange={(e) => setBudgetMonth(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createMissingCategories}
                      onChange={(e) =>
                        setCreateMissingCategories(e.target.checked)
                      }
                    />
                    Create missing categories
                  </label>
                </div>
              )}
              {resolvedType === "full_backup" && jsonPreview && (
                <div className="rounded-xl border border-border p-4 text-sm space-y-1">
                  <p className="font-medium">Backup preview</p>
                  <p>Schema v{jsonPreview.schemaVersion}</p>
                  <p>{jsonPreview.accountCount} accounts</p>
                  <p>{jsonPreview.transactionCount} transactions</p>
                  <p>{jsonPreview.categoryCount} categories</p>
                  {jsonPreview.errors.map((e) => (
                    <p key={e} className="text-danger">
                      {e}
                    </p>
                  ))}
                </div>
              )}
              {resolvedType === "account_balances" && (
                <p className="text-sm text-muted">
                  Account balances will update matching accounts by name, or
                  create checking accounts when missing.
                </p>
              )}
            </div>
          )}

          {step === 3 && resolvedType !== "full_backup" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <select
                  className="input max-w-xs"
                  defaultValue=""
                  onChange={(e) => {
                    const preset = mappingPresets.find(
                      (p) => p.id === e.target.value,
                    );
                    if (!preset) return;
                    const next: ColumnMapping = {};
                    for (const h of headers) {
                      const key = Object.keys(preset.mapping).find(
                        (k) => k.toLowerCase() === h.toLowerCase(),
                      );
                      next[h] = key ? preset.mapping[key]! : mapping[h] ?? "ignore";
                    }
                    setMapping(next);
                    setDateFormat(preset.dateFormat);
                  }}
                >
                  <option value="">Apply mapping preset…</option>
                  {mappingPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input max-w-[10rem]"
                  value={dateFormat}
                  onChange={(e) =>
                    setDateFormat(e.target.value as DateFormatHint)
                  }
                >
                  <option value="auto">Date: Auto</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                  onClick={() =>
                    saveMappingPreset({
                      name: `Custom ${activeFile?.fileName ?? "mapping"}`,
                      fileFormat: activeFile?.detectedFormat ?? "unknown_csv",
                      mapping,
                      dateFormat,
                    })
                  }
                >
                  Save preset
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Source column</th>
                      <th className="px-3 py-2">Maps to</th>
                      <th className="px-3 py-2">Sample</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h) => (
                      <tr key={h} className="border-t border-border/70">
                        <td className="px-3 py-2 font-medium">{h}</td>
                        <td className="px-3 py-2">
                          <select
                            className="input"
                            value={mapping[h] ?? "ignore"}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [h]: e.target.value as ColumnField,
                              }))
                            }
                          >
                            {COLUMN_FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-muted truncate max-w-[12rem]">
                          {rawRows[0]?.[h] ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && resolvedType === "full_backup" && (
            <p className="text-sm text-muted">
              JSON backups do not require column mapping. Continue to preview.
            </p>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <Stat chip="Importable" value={counts.importable} />
                <Stat chip="Skipped" value={rows.length - counts.importable} />
                <Stat chip="Duplicates" value={counts.duplicate} />
                <Stat chip="Invalid" value={counts.invalid} />
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "all",
                    "ready",
                    "duplicate",
                    "needs_category",
                    "invalid",
                  ] as PreviewFilter[]
                ).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPreviewFilter(f)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium",
                      previewFilter === f
                        ? "bg-accent text-white"
                        : "border border-border text-muted",
                    )}
                  >
                    {f.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
              {resolvedType === "full_backup" && jsonPreview ? (
                <div className="rounded-xl border border-border p-4 text-sm">
                  Ready to restore {jsonPreview.transactionCount} transactions
                  and {jsonPreview.accountCount} accounts ({mergeMode}).
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Payee</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreview.slice(0, 20).map((r) => (
                        <tr key={r.id} className="border-t border-border/70">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.parsedDate
                              ? formatDisplayDate(r.parsedDate)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 min-w-[12rem]">
                            <PayeeCombobox
                              value={r.payeeName ?? ""}
                              allowTransfers={false}
                              onChange={(next) => {
                                if (next.mode !== "payee") return;
                                setRows((prev) =>
                                  prev.map((x) => {
                                    if (x.id !== r.id) return x;
                                    const useSuggested =
                                      !x.categoryId &&
                                      Boolean(next.suggestedCategoryId);
                                    return {
                                      ...x,
                                      payeeName: next.payeeName,
                                      categoryId: useSuggested
                                        ? next.suggestedCategoryId
                                        : x.categoryId,
                                      categoryName: useSuggested
                                        ? plan.categories.find(
                                            (c) =>
                                              c.id === next.suggestedCategoryId,
                                          )?.name ?? x.categoryName
                                        : x.categoryName,
                                    };
                                  }),
                                );
                              }}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {r.parsedAmountCents != null ? (
                              <MoneyText cents={r.parsedAmountCents} signed />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {r.categoryName ?? "Uncategorized"}
                          </td>
                          <td className="px-3 py-2 capitalize">
                            {r.status.replaceAll("_", " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {counts.duplicate} duplicate row(s) detected. Duplicates are never
                imported silently.
              </p>
              {(
                [
                  ["skip", "Skip duplicates"],
                  ["import_anyway", "Import anyway"],
                  ["review", "Review one by one"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    checked={duplicateHandling === value}
                    onChange={() => setDuplicateHandling(value)}
                  />
                  {label}
                </label>
              ))}
              {duplicateHandling === "review" && (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {rows
                    .filter((r) => r.status === "duplicate")
                    .map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="truncate">
                          {r.parsedDate} · {r.payeeName} ·{" "}
                          {r.parsedAmountCents != null && (
                            <MoneyText cents={r.parsedAmountCents} signed />
                          )}
                        </span>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? { ...x, include: e.target.checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          Import
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createMissingCategories}
                  onChange={(e) => {
                    setCreateMissingCategories(e.target.checked);
                  }}
                />
                Create missing categories in an “Imported” group
              </label>
              <p className="text-sm text-muted">
                Unmatched categories can stay uncategorized. Payee/category rules
                from prior imports are applied automatically.
              </p>
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {[
                  ...new Map(
                    rows
                      .filter((r) => r.categoryName)
                      .map((r) => [r.categoryName!, r]),
                  ).values(),
                ].map((r) => {
                  const matched = plan.categories.find(
                    (c) =>
                      c.name.toLowerCase() === r.categoryName!.toLowerCase(),
                  );
                  return (
                    <li
                      key={r.categoryName}
                      className="rounded-lg border border-border px-3 py-2 text-sm flex justify-between gap-2"
                    >
                      <span>{r.categoryName}</span>
                      <span className="text-muted">
                        {matched
                          ? `→ ${matched.name}`
                          : createMissingCategories
                            ? "→ will create"
                            : "→ uncategorized"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4 text-sm space-y-2">
                <p>
                  <strong>Mode:</strong> {mergeMode}
                </p>
                <p>
                  <strong>Type:</strong> {resolvedType.replaceAll("_", " ")}
                </p>
                <p>
                  <strong>Accounts affected:</strong>{" "}
                  {destinationMode === "new"
                    ? newAccountName || "New account"
                    : plan.accounts.find((a) => a.id === accountId)?.name ?? "—"}
                </p>
                <p>
                  <strong>Transactions to add:</strong> {counts.importable}
                </p>
                <p>
                  <strong>Duplicates skipped:</strong>{" "}
                  {duplicateHandling === "skip" ? counts.duplicate : 0}
                </p>
                <p>
                  <strong>Invalid skipped:</strong> {counts.invalid}
                </p>
                <p>
                  <strong>Categories created:</strong>{" "}
                  {createMissingCategories
                    ? rows.filter(
                        (r) =>
                          r.categoryName &&
                          !plan.categories.some(
                            (c) =>
                              c.name.toLowerCase() ===
                              r.categoryName!.toLowerCase(),
                          ),
                      ).length
                    : 0}
                </p>
                <p>
                  <strong>Balance effect:</strong>{" "}
                  <MoneyText
                    cents={rows
                      .filter((r) => r.include && r.parsedAmountCents != null)
                      .reduce((s, r) => s + (r.parsedAmountCents ?? 0), 0)}
                    signed
                  />
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                I understand a backup will be created and I confirm this import.
              </label>
            </div>
          )}

          {step === 8 && result && (
            <div className="space-y-4">
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  result.ok
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-danger/30 bg-danger/5 text-danger",
                )}
              >
                {result.ok ? (
                  <p className="flex items-center gap-2 font-medium">
                    <Check className="h-4 w-4" /> Import completed
                  </p>
                ) : (
                  <p>Import failed: {result.error}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat chip="Successful" value={result.batch.importedRows} />
                <Stat chip="Skipped" value={result.batch.skippedRows} />
                <Stat chip="Duplicates" value={result.batch.duplicateRows} />
                <Stat chip="Errors" value={result.batch.errorRows} />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.errorCsv && (
                  <button
                    type="button"
                    onClick={downloadErrorCsv}
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    Download error CSV
                  </button>
                )}
                {result.ok && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        reverseImport(result.batch.id);
                        onClose();
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      Undo Import
                    </button>
                    <Link
                      href={`/transactions?batch=${result.batch.id}`}
                      onClick={onClose}
                      className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
                    >
                      View Imported Transactions
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || step === 8}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          {step < 8 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={step === 7 && !confirmed}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {step === 7 ? "Commit import" : "Continue"}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          )}
        </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ chip, value }: { chip: string; value: number }) {
  return (
    <span className="rounded-lg bg-canvas px-2.5 py-1 text-xs font-medium">
      {chip}: {value}
    </span>
  );
}
