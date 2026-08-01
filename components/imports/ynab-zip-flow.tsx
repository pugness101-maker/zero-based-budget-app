"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import {
  buildYnabZipPreview,
  findSimilarCategoryPairs,
} from "@/lib/imports/ynab/preview";
import type {
  FutureRowHandling,
  YnabAccountMapping,
  YnabCategoryMergeDecision,
} from "@/lib/imports/ynab/commit-ynab-zip";
import type { YnabAccountTypeChoice } from "@/lib/imports/ynab/suggest-account-type";
import type {
  ImportBatch,
  ImportCommitResult,
  MergeMode,
} from "@/lib/types/import";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { normalizeCategoryName } from "@/lib/imports/map-categories";

const STEPS = [
  "Summary",
  "Accounts",
  "Categories",
  "Future rows",
  "Duplicates",
  "Confirm",
  "Result",
] as const;

const ACCOUNT_TYPES: { value: YnabAccountTypeChoice; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "tracking_asset", label: "Tracking asset" },
  { value: "tracking_liability", label: "Tracking liability" },
];

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function YnabZipFlow({
  zipFileName,
  registerRows,
  planRows,
  registerFileName,
  planFileName,
  onClose,
}: {
  zipFileName: string;
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  registerFileName?: string;
  planFileName?: string;
  onClose: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const commitYnabZipImport = useBudgetStore((s) => s.commitYnabZipImport);
  const reverseImport = useBudgetStore((s) => s.reverseImport);

  const preview = useMemo(
    () =>
      buildYnabZipPreview({
        registerRows,
        planRows,
        registerFileName,
        planFileName,
      }),
    [registerRows, planRows, registerFileName, planFileName],
  );

  const similarPairs = useMemo(
    () => findSimilarCategoryPairs(preview.categories),
    [preview.categories],
  );

  const [step, setStep] = useState(0);
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [accountMappings, setAccountMappings] = useState<YnabAccountMapping[]>(
    () =>
      preview.accounts.map((a) => ({
        accountName: a.accountName,
        type: a.suggestedType,
        existingAccountId: plan.accounts.find(
          (x) =>
            normalizeCategoryName(x.name) ===
            normalizeCategoryName(a.accountName),
        )?.id,
      })),
  );
  const [merges, setMerges] = useState<YnabCategoryMergeDecision[]>([]);
  const [futureHandling, setFutureHandling] =
    useState<FutureRowHandling>("import_as_scheduled");
  const [duplicateHandling, setDuplicateHandling] = useState<
    "skip" | "import_anyway"
  >("skip");
  const [previewFilter, setPreviewFilter] = useState<
    "all" | "historical" | "future" | "invalid"
  >("all");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const filteredRegister = registerRows.filter((r) => {
    if (previewFilter === "historical") return !r.isFuture;
    if (previewFilter === "future") return r.isFuture;
    if (previewFilter === "invalid") return r.errors.length > 0;
    return true;
  });

  function runCommit() {
    const batch: ImportBatch = {
      id: newId("batch"),
      householdId: "local",
      userId: "demo",
      fileName: zipFileName,
      fileType: "zip",
      importType: "ynab_zip",
      status: "previewing",
      totalRows: registerRows.length + planRows.length,
      importedRows: 0,
      duplicateRows: 0,
      skippedRows: 0,
      errorRows: 0,
      mappingJson: {},
      createdAt: new Date().toISOString(),
      mergeMode,
    };

    const res = commitYnabZipImport({
      batch,
      registerRows,
      planRows,
      accountMappings,
      categoryMerges: merges,
      futureHandling,
      mergeMode,
      importDateIso: toISODate(new Date()),
      duplicateHandling,
    });
    setResult(res);
    setStep(STEPS.length - 1);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
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
        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/30 bg-accent-muted/30 px-4 py-3 text-sm">
              Detected YNAB ZIP export
              {registerFileName ? ` · ${registerFileName}` : ""}
              {planFileName ? ` · ${planFileName}` : ""}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 text-sm">
              <Stat label="Register rows" value={String(preview.registerRowCount)} />
              <Stat label="Plan rows" value={String(preview.planRowCount)} />
              <Stat label="Accounts" value={String(preview.accounts.length)} />
              <Stat label="Categories" value={String(preview.categories.length)} />
              <Stat label="Category groups" value={String(preview.categoryGroups.length)} />
              <Stat
                label="Date range"
                value={
                  preview.earliestDate && preview.latestDate
                    ? `${formatDisplayDate(preview.earliestDate)} – ${formatDisplayDate(preview.latestDate)}`
                    : "—"
                }
              />
              <Stat label="Historical" value={String(preview.historicalRowCount)} />
              <Stat
                label="Future/Scheduled"
                value={String(preview.futureScheduledRowCount)}
              />
              <Stat label="Cleared" value={String(preview.clearedCount)} />
              <Stat label="Uncleared" value={String(preview.unclearedCount)} />
              <Stat label="Reconciled" value={String(preview.reconciledCount)} />
              <Stat label="Transfers" value={String(preview.transferRowCount)} />
              <Stat label="Invalid" value={String(preview.invalidRowCount)} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Estimated balance effect
              </p>
              <ul className="rounded-xl border border-border divide-y divide-border">
                {preview.balanceEffectByAccount.map((a) => (
                  <li
                    key={a.accountName}
                    className="flex justify-between px-3 py-2 text-sm"
                  >
                    <span>{a.accountName}</span>
                    <MoneyText cents={a.effectCents} signed />
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                ["all", "historical", "future", "invalid"] as const
              ).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPreviewFilter(f)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium capitalize",
                    previewFilter === f
                      ? "bg-accent text-white"
                      : "border border-border text-muted",
                  )}
                >
                  {f === "future" ? "Future/Scheduled" : f}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Payee</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegister.slice(0, 20).map((r) => (
                    <tr key={r.rowIndex} className="border-t border-border/70">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.date ? formatDisplayDate(r.date) : "—"}
                      </td>
                      <td className="px-3 py-2">{r.accountName}</td>
                      <td className="px-3 py-2">{r.payeeName}</td>
                      <td className="px-3 py-2">
                        {r.amountCents != null ? (
                          <MoneyText cents={r.amountCents} signed />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {r.isFuture ? "Future/Scheduled" : r.cleared}
                        {r.errors.length ? " · invalid" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Review each detected account. Suggestions are based on the account
              name — confirm the type before importing.
            </p>
            <ul className="space-y-2">
              {accountMappings.map((m, idx) => {
                const suggestion = preview.accounts.find(
                  (a) => a.accountName === m.accountName,
                );
                return (
                  <li
                    key={m.accountName}
                    className="rounded-xl border border-border p-3 grid gap-2 sm:grid-cols-[1fr_12rem] items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">{m.accountName}</p>
                      <p className="text-xs text-muted">
                        Suggested: {suggestion?.suggestedType.replaceAll("_", " ")}{" "}
                        ({suggestion?.confidence})
                        {m.existingAccountId ? " · matches existing" : " · will create"}
                      </p>
                    </div>
                    <select
                      className="input"
                      value={m.type}
                      onChange={(e) => {
                        const type = e.target.value as YnabAccountTypeChoice;
                        setAccountMappings((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, type } : x,
                          ),
                        );
                      }}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Category and group names are preserved exactly. Optionally merge
              similarly named categories in different groups — never automatic.
            </p>
            {similarPairs.length === 0 ? (
              <p className="text-sm rounded-xl border border-border px-4 py-6 text-center text-muted">
                No similar category name conflicts detected.
              </p>
            ) : (
              <ul className="space-y-2">
                {similarPairs.map(({ a, b }) => {
                  const decision = merges.find((m) => m.sourceKey === b.key);
                  return (
                    <li
                      key={`${a.key}-${b.key}`}
                      className="rounded-xl border border-border p-3 text-sm space-y-2"
                    >
                      <p>
                        <strong>{a.categoryName}</strong> appears in{" "}
                        {a.groupName} and {b.groupName}
                      </p>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(decision?.merge)}
                          onChange={(e) => {
                            setMerges((prev) => {
                              const rest = prev.filter(
                                (m) => m.sourceKey !== b.key,
                              );
                              if (!e.target.checked) return rest;
                              return [
                                ...rest,
                                {
                                  sourceKey: b.key,
                                  keepKey: a.key,
                                  merge: true,
                                },
                              ];
                            });
                          }}
                        />
                        Merge “{b.groupName}: {b.categoryName}” into “
                        {a.groupName}: {a.categoryName}”
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted">
              {preview.categoryGroups.length} groups · {preview.categories.length}{" "}
              categories. “Credit Card Payments” is treated as a special group.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {preview.futureScheduledRowCount} future-dated row(s) detected
              relative to today. Choose how to import them so they do not silently
              enter historical spending.
            </p>
            {(
              [
                ["import_as_scheduled", "Import as scheduled"],
                ["import_as_transactions", "Import as ordinary transactions"],
                ["skip", "Skip future rows"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  checked={futureHandling === value}
                  onChange={() => setFutureHandling(value)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Duplicates are detected by import fingerprint (account, date, amount,
              payee). They are never imported silently.
            </p>
            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <input
                type="radio"
                checked={duplicateHandling === "skip"}
                onChange={() => setDuplicateHandling("skip")}
              />
              Skip duplicates
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <input
                type="radio"
                checked={duplicateHandling === "import_anyway"}
                onChange={() => setDuplicateHandling("import_anyway")}
              />
              Import anyway
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 text-sm space-y-2">
              <p>
                <strong>File:</strong> {zipFileName}
              </p>
              <p>
                <strong>Register rows:</strong> {preview.registerRowCount}
              </p>
              <p>
                <strong>Plan rows:</strong> {preview.planRowCount}
              </p>
              <p>
                <strong>Accounts:</strong> {accountMappings.length}
              </p>
              <p>
                <strong>Future handling:</strong>{" "}
                {futureHandling.replaceAll("_", " ")}
              </p>
              <p>
                <strong>Mode:</strong> {mergeMode} (default merge)
              </p>
              <div className="pt-2 space-y-1">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mergeMode === "merge"}
                    onChange={() => setMergeMode("merge")}
                  />
                  Merge with existing data
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mergeMode === "replace"}
                    onChange={() => setMergeMode("replace")}
                  />
                  Replace overlapping YNAB historical budget values
                </label>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              I confirm a backup will be created and this YNAB import can be undone
              as a whole batch.
            </label>
          </div>
        )}

        {step === 6 && result && (
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
                  <Check className="h-4 w-4" /> YNAB import completed
                </p>
              ) : (
                <p>Import failed: {result.error}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Imported" value={String(result.batch.importedRows)} />
              <Stat label="Skipped" value={String(result.batch.skippedRows)} />
              <Stat label="Duplicates" value={String(result.batch.duplicateRows)} />
              <Stat label="Errors" value={String(result.batch.errorRows)} />
            </div>
            {result.ok && (
              <div className="flex flex-wrap gap-2">
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
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || step === STEPS.length - 1}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={step === 5 && !confirmed}
            onClick={() => {
              if (step === 5) runCommit();
              else setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {step === 5 ? "Commit import" : "Continue"}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-semibold truncate">{value}</p>
    </div>
  );
}
