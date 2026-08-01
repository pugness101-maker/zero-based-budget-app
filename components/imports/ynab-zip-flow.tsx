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
import {
  applyImportScope,
} from "@/lib/imports/scope/apply-import-scope";
import { buildDefaultScopeFromRows } from "@/lib/imports/scope/apply-import-scope";
import {
  buildScopeAccountCandidates,
  buildScopeCategoryCandidates,
} from "@/lib/imports/scope/candidates";
import type { ImportScopeSelection } from "@/lib/imports/scope/types";
import { ImportScopeStep } from "@/components/imports/import-scope-step";

const STEPS = [
  "Summary",
  "Import Scope",
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

  const fullPreview = useMemo(
    () =>
      buildYnabZipPreview({
        registerRows,
        planRows,
        registerFileName,
        planFileName,
      }),
    [registerRows, planRows, registerFileName, planFileName],
  );

  const accountCandidates = useMemo(
    () => buildScopeAccountCandidates({ registerRows, plan }),
    [registerRows, plan],
  );
  const categoryCandidates = useMemo(
    () => buildScopeCategoryCandidates({ registerRows, planRows, plan }),
    [registerRows, planRows, plan],
  );

  const [scope, setScope] = useState<ImportScopeSelection>(() =>
    buildDefaultScopeFromRows({
      accountNames: accountCandidates.map((a) => a.accountName),
      categoryKeys: categoryCandidates.map((c) => c.key),
    }),
  );

  const scoped = useMemo(
    () =>
      applyImportScope({
        registerRows,
        planRows,
        scope,
      }),
    [registerRows, planRows, scope],
  );

  const scopedPreview = useMemo(
    () =>
      buildYnabZipPreview({
        registerRows: scoped.registerRows,
        planRows: scoped.planRows,
        registerFileName,
        planFileName,
      }),
    [scoped, registerFileName, planFileName],
  );

  const similarPairs = useMemo(
    () => findSimilarCategoryPairs(scopedPreview.categories),
    [scopedPreview.categories],
  );

  const [step, setStep] = useState(0);
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [accountMappings, setAccountMappings] = useState<YnabAccountMapping[]>(
    () =>
      fullPreview.accounts.map((a) => ({
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
    | "included"
    | "excluded_by_account"
    | "excluded_by_category"
    | "excluded_by_date"
    | "transfer_review"
    | "future_scheduled"
    | "duplicate"
    | "invalid"
    | "all"
  >("included");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const effectiveMappings = useMemo(() => {
    const allowed = new Set(
      scoped.effectiveAccountNames.map((n) => normalizeCategoryName(n)),
    );
    return accountMappings.filter((m) =>
      allowed.has(normalizeCategoryName(m.accountName)),
    );
  }, [accountMappings, scoped.effectiveAccountNames]);

  const filteredAnnotated = scoped.annotatedRegister.filter((r) => {
    if (previewFilter === "all") return true;
    if (previewFilter === "included") {
      return (
        r.scopeDisposition === "included" ||
        r.scopeDisposition === "future_scheduled" ||
        r.scopeDisposition === "duplicate"
      );
    }
    if (previewFilter === "excluded_by_category") {
      return (
        r.scopeDisposition === "excluded_by_category" ||
        r.scopeDisposition === "skipped_category" ||
        r.scopeDisposition === "category_review"
      );
    }
    return r.scopeDisposition === previewFilter;
  });

  const scopeBlocked =
    scoped.summary.transfersNeedingReview > 0 ||
    scoped.annotatedRegister.some((r) => r.scopeDisposition === "category_review");

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
      selectedAccountNames: scope.selectedAccountNames,
      selectedCategoryNames: scope.selectedCategoryKeys,
      dateRangeStart: scope.dateRange.startDate ?? undefined,
      dateRangeEnd: scope.dateRange.endDate ?? undefined,
      accountScopeMode: scope.accountScopeMode,
      categoryScopeMode: scope.categoryScopeMode,
      transferHandlingMode: scope.transferHandlingMode,
      unselectedCategoryHandlingMode: scope.unselectedCategoryHandlingMode,
      excludedRowCount: scoped.summary.registerExcluded,
      scopePresetId: scope.scopePresetId,
    };

    const res = commitYnabZipImport({
      batch,
      registerRows,
      planRows,
      accountMappings: effectiveMappings,
      categoryMerges: merges,
      futureHandling,
      mergeMode,
      importDateIso: toISODate(new Date()),
      duplicateHandling,
      importScope: scope,
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
              <Stat label="Register rows" value={String(fullPreview.registerRowCount)} />
              <Stat label="Plan rows" value={String(fullPreview.planRowCount)} />
              <Stat label="Accounts" value={String(fullPreview.accounts.length)} />
              <Stat label="Categories" value={String(fullPreview.categories.length)} />
              <Stat
                label="Date range"
                value={
                  fullPreview.earliestDate && fullPreview.latestDate
                    ? `${formatDisplayDate(fullPreview.earliestDate)} – ${formatDisplayDate(fullPreview.latestDate)}`
                    : "—"
                }
              />
              <Stat label="Historical" value={String(fullPreview.historicalRowCount)} />
              <Stat
                label="Future/Scheduled"
                value={String(fullPreview.futureScheduledRowCount)}
              />
              <Stat label="Transfers" value={String(fullPreview.transferRowCount)} />
            </div>
            <p className="text-sm text-muted">
              Next: choose Import Scope to limit accounts, categories, and dates.
            </p>
          </div>
        )}

        {step === 1 && (
          <ImportScopeStep
            plan={plan}
            registerRows={registerRows}
            planRows={planRows}
            scope={scope}
            onChange={setScope}
            scoped={scoped}
          />
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Confirm types for selected accounts only ({effectiveMappings.length}).
            </p>
            <ul className="space-y-2">
              {effectiveMappings.map((m) => {
                const suggestion = fullPreview.accounts.find(
                  (a) => a.accountName === m.accountName,
                );
                const idx = accountMappings.findIndex(
                  (x) => x.accountName === m.accountName,
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

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Optional merges for similar names among selected categories. Unselected
              categories are not created.
            </p>
            {similarPairs.length === 0 ? (
              <p className="text-sm rounded-xl border border-border px-4 py-6 text-center text-muted">
                No similar category name conflicts in scope.
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
              {scoped.summary.categoriesSelected} categories in scope ·{" "}
              {scoped.summary.categoryGroupsAffected} groups
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {scopedPreview.futureScheduledRowCount} future-dated row(s) in the
              current scope. Choose how to import them.
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

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Duplicates are detected within the scoped rows. They are never
              imported silently.
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

            <div className="flex flex-wrap gap-2 pt-2">
              {(
                [
                  "included",
                  "excluded_by_account",
                  "excluded_by_category",
                  "excluded_by_date",
                  "transfer_review",
                  "future_scheduled",
                  "invalid",
                  "all",
                ] as const
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
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Payee</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnnotated.slice(0, 40).map((r) => (
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
                      <td className="px-3 py-2 text-muted text-xs">
                        {r.scopeDisposition.replaceAll("_", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-4 text-sm space-y-3">
              <div>
                <p className="font-semibold">Accounts</p>
                <p>
                  Selected {scope.selectedAccountNames.length} · Creating/matching{" "}
                  {scoped.effectiveAccountNames.length} · Skipped{" "}
                  {Math.max(
                    0,
                    fullPreview.accounts.length - scoped.effectiveAccountNames.length,
                  )}
                </p>
              </div>
              <div>
                <p className="font-semibold">Categories</p>
                <p>
                  Selected {scope.selectedCategoryKeys.length} · In scope{" "}
                  {scoped.effectiveCategoryKeys.length} · Mapped{" "}
                  {Object.keys(scope.categoryMappings).length} · Uncategorized
                  handling:{" "}
                  {scope.unselectedCategoryHandlingMode.replaceAll("_", " ")}
                </p>
              </div>
              <div>
                <p className="font-semibold">Date range</p>
                <p>
                  {scoped.summary.dateRangeLabel}
                  {scoped.summary.dateRangeStart || scoped.summary.dateRangeEnd
                    ? ` (${scoped.summary.dateRangeStart ?? "…"} → ${scoped.summary.dateRangeEnd ?? "…"})`
                    : ""}
                </p>
              </div>
              <div>
                <p className="font-semibold">Rows</p>
                <ul className="list-disc pl-5 space-y-0.5 text-muted">
                  <li>Transactions to import: {scoped.summary.registerIncluded}</li>
                  <li>Plan rows to import: {scoped.summary.planIncluded}</li>
                  <li>Future/Scheduled: {scoped.summary.futureScheduledCount}</li>
                  <li>Excluded by scope: {scoped.summary.registerExcluded}</li>
                  <li>
                    Requiring review:{" "}
                    {scoped.summary.transfersNeedingReview +
                      scoped.annotatedRegister.filter(
                        (r) => r.scopeDisposition === "category_review",
                      ).length}
                  </li>
                </ul>
              </div>
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
            {scopeBlocked && (
              <p className="text-sm text-red-700" role="alert">
                Resolve transfer/category review items in Import Scope before
                committing.
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              I confirm the selected scope, a backup will be created, and this
              import can be undone as a whole batch.
            </label>
          </div>
        )}

        {step === 7 && result && (
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
              <Stat label="Excluded" value={String(result.batch.excludedRowCount ?? 0)} />
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
            disabled={
              (step === 1 && scopeBlocked) ||
              (step === 6 && (!confirmed || scopeBlocked))
            }
            onClick={() => {
              if (step === 6) runCommit();
              else setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {step === 6 ? "Commit import" : "Continue"}
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
