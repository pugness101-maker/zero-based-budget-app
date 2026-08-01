"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MoneyText } from "@/components/shared/money-text";
import {
  buildScopeAccountCandidates,
  buildScopeCategoryCandidates,
  categoryKeysUsedByAccounts,
  groupScopeCategories,
} from "@/lib/imports/scope/candidates";
import {
  applyImportScope,
  type ApplyImportScopeResult,
} from "@/lib/imports/scope/apply-import-scope";
import { resolveImportDatePreset } from "@/lib/imports/scope/date-scope";
import {
  BUILTIN_SCOPE_PRESET_TEMPLATES,
  loadImportScopePresets,
  presetToSelection,
  saveImportScopePreset,
  selectionToPresetPayload,
} from "@/lib/imports/scope/presets";
import {
  IMPORT_DATE_PRESETS,
  type ImportDatePresetId,
  type ImportScopeSelection,
  type TransferHandlingMode,
} from "@/lib/imports/scope/types";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { BudgetPlan } from "@/lib/types/budget";
import { formatDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toAppAccountKind } from "@/lib/imports/ynab/suggest-account-type";

export function ImportScopeStep({
  plan,
  registerRows,
  planRows,
  scope,
  onChange,
  scoped,
}: {
  plan: BudgetPlan;
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  scope: ImportScopeSelection;
  onChange: (next: ImportScopeSelection) => void;
  scoped: ApplyImportScopeResult;
}) {
  const [accountSearch, setAccountSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [presetName, setPresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState(() =>
    loadImportScopePresets(),
  );
  const [pendingPresetId, setPendingPresetId] = useState<string>("");

  const accounts = useMemo(
    () => buildScopeAccountCandidates({ registerRows, plan }),
    [registerRows, plan],
  );
  const categories = useMemo(
    () => buildScopeCategoryCandidates({ registerRows, planRows, plan }),
    [registerRows, planRows, plan],
  );
  const groups = useMemo(
    () => groupScopeCategories(categories),
    [categories],
  );

  const selectedAccountSet = useMemo(
    () => new Set(scope.selectedAccountNames),
    [scope.selectedAccountNames],
  );
  const selectedCategorySet = useMemo(
    () => new Set(scope.selectedCategoryKeys),
    [scope.selectedCategoryKeys],
  );

  const filteredAccounts = accounts.filter((a) =>
    a.accountName.toLowerCase().includes(accountSearch.toLowerCase()),
  );
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      categories: g.categories.filter(
        (c) =>
          c.categoryName.toLowerCase().includes(categorySearch.toLowerCase()) ||
          c.groupName.toLowerCase().includes(categorySearch.toLowerCase()),
      ),
    }))
    .filter((g) => g.categories.length > 0);

  function patch(partial: Partial<ImportScopeSelection>) {
    onChange({ ...scope, ...partial, scopePresetId: undefined });
  }

  function setDatePreset(preset: ImportDatePresetId) {
    const range = resolveImportDatePreset(preset, {
      customStart: scope.dateRange.startDate,
      customEnd: scope.dateRange.endDate,
    });
    patch({ dateRange: range });
  }

  function toggleAccount(name: string) {
    const next = new Set(selectedAccountSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    patch({
      accountScopeMode: "selected",
      selectedAccountNames: [...next],
    });
  }

  function toggleCategory(key: string) {
    const next = new Set(selectedCategorySet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({
      categoryScopeMode: "selected",
      selectedCategoryKeys: [...next],
    });
  }

  function toggleGroup(groupName: string, cats: { key: string }[]) {
    const keys = cats.map((c) => c.key);
    const allSelected = keys.every((k) => selectedCategorySet.has(k));
    const next = new Set(selectedCategorySet);
    for (const k of keys) {
      if (allSelected) next.delete(k);
      else next.add(k);
    }
    patch({
      categoryScopeMode: "selected",
      selectedCategoryKeys: [...next],
    });
  }

  function groupCheckState(keys: string[]): boolean | "indeterminate" {
    const selected = keys.filter((k) => selectedCategorySet.has(k)).length;
    if (selected === 0) return false;
    if (selected === keys.length) return true;
    return "indeterminate";
  }

  const summary = scoped.summary;
  const transferReviews = scoped.annotatedRegister.filter(
    (r) => r.scopeDisposition === "transfer_review",
  );
  const categoryReviews = scoped.annotatedRegister.filter(
    (r) => r.scopeDisposition === "category_review",
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Import Scope</h3>
        <p className="text-sm text-muted mt-1">
          Choose exactly which accounts, categories, and dates to import. Preview
          counts update as you change the selection.
        </p>
      </div>

      {/* Live summary */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 text-sm">
        <SummaryStat label="Accounts selected" value={String(summary.accountsSelected)} />
        <SummaryStat label="Categories selected" value={String(summary.categoriesSelected)} />
        <SummaryStat label="Groups affected" value={String(summary.categoryGroupsAffected)} />
        <SummaryStat label="Date range" value={summary.dateRangeLabel} />
        <SummaryStat label="Register included" value={String(summary.registerIncluded)} />
        <SummaryStat label="Register excluded" value={String(summary.registerExcluded)} />
        <SummaryStat label="Plan included" value={String(summary.planIncluded)} />
        <SummaryStat label="Plan excluded" value={String(summary.planExcluded)} />
        <SummaryStat label="Historical" value={String(summary.historicalCount)} />
        <SummaryStat label="Future/Scheduled" value={String(summary.futureScheduledCount)} />
        <SummaryStat label="Transfer review" value={String(summary.transfersNeedingReview)} />
        <SummaryStat label="Uncategorized maps" value={String(summary.uncategorizedMappings)} />
        <SummaryStat
          label="After date filter"
          value={`${summary.registerAfterDateFilter}/${summary.registerBeforeDateFilter} reg · ${summary.planAfterDateFilter}/${summary.planBeforeDateFilter} plan`}
        />
        <SummaryStat
          label="Balance effect"
          value=""
          money={summary.balanceEffectCents}
        />
      </div>

      {/* Date range */}
      <section className="rounded-xl border border-border p-3 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Date range
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {IMPORT_DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDatePreset(p.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium",
                scope.dateRange.preset === p.id
                  ? "bg-accent text-white"
                  : "border border-border text-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {scope.dateRange.preset === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs space-y-1">
              <span className="text-muted">Start date</span>
              <input
                type="date"
                className="input w-full"
                value={scope.dateRange.startDate ?? ""}
                onChange={(e) =>
                  patch({
                    dateRange: {
                      preset: "custom",
                      startDate: e.target.value || null,
                      endDate: scope.dateRange.endDate,
                    },
                  })
                }
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted">End date</span>
              <input
                type="date"
                className="input w-full"
                value={scope.dateRange.endDate ?? ""}
                onChange={(e) =>
                  patch({
                    dateRange: {
                      preset: "custom",
                      startDate: scope.dateRange.startDate,
                      endDate: e.target.value || null,
                    },
                  })
                }
              />
            </label>
          </div>
        )}
        <p className="text-xs text-muted">
          Inclusive full days in your timezone. Plan months overlap the range
          (e.g. Jan 15–Mar 10 includes January–March).
        </p>
      </section>

      {/* Accounts */}
      <section className="rounded-xl border border-border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Accounts · {selectedAccountSet.size} selected
          </h4>
          <div className="flex flex-wrap gap-1.5">
            <TinyButton
              onClick={() =>
                patch({
                  accountScopeMode: "selected",
                  selectedAccountNames: accounts.map((a) => a.accountName),
                })
              }
            >
              Select All
            </TinyButton>
            <TinyButton
              onClick={() =>
                patch({
                  accountScopeMode: "selected",
                  selectedAccountNames: [],
                })
              }
            >
              Clear All
            </TinyButton>
            <TinyButton
              onClick={() =>
                patch({
                  accountScopeMode: "selected",
                  selectedAccountNames: accounts
                    .filter((a) => a.appearsActive)
                    .map((a) => a.accountName),
                })
              }
            >
              Active only
            </TinyButton>
            <TinyButton
              onClick={() =>
                patch({
                  accountScopeMode: "selected",
                  selectedAccountNames: accounts
                    .filter((a) => a.hasCurrentYearActivity || a.latestDate?.startsWith("2026"))
                    .map((a) => a.accountName),
                })
              }
            >
              2026 activity
            </TinyButton>
          </div>
        </div>
        <input
          value={accountSearch}
          onChange={(e) => setAccountSearch(e.target.value)}
          placeholder="Search accounts"
          className="input w-full text-sm"
        />
        <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border">
          {filteredAccounts.map((a) => (
            <li key={a.accountName} className="flex gap-2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--accent)]"
                checked={selectedAccountSet.has(a.accountName)}
                onChange={() => toggleAccount(a.accountName)}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.accountName}</p>
                <p className="text-xs text-muted">
                  {a.suggestedType.replaceAll("_", " ")} ·{" "}
                  {toAppAccountKind(a.suggestedType)} · {a.transactionCount} txn
                  {a.earliestDate && a.latestDate
                    ? ` · ${formatDisplayDate(a.earliestDate)} – ${formatDisplayDate(a.latestDate)}`
                    : ""}
                  {a.existingAccountName
                    ? ` · matches “${a.existingAccountName}”`
                    : " · will create"}
                </p>
              </div>
              <MoneyText cents={a.netEffectCents} signed className="text-xs shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      {/* Categories */}
      <section className="rounded-xl border border-border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Categories · {selectedCategorySet.size} selected
          </h4>
          <div className="flex flex-wrap gap-1.5">
            <TinyButton
              onClick={() =>
                patch({
                  categoryScopeMode: "selected",
                  selectedCategoryKeys: categories.map((c) => c.key),
                })
              }
            >
              Select All
            </TinyButton>
            <TinyButton
              onClick={() =>
                patch({
                  categoryScopeMode: "selected",
                  selectedCategoryKeys: [],
                })
              }
            >
              Clear All
            </TinyButton>
            <TinyButton
              onClick={() => {
                const all: Record<string, boolean> = {};
                for (const g of groups) all[g.groupName] = true;
                setExpandedGroups(all);
              }}
            >
              Expand All
            </TinyButton>
            <TinyButton onClick={() => setExpandedGroups({})}>
              Collapse All
            </TinyButton>
            <TinyButton
              onClick={() =>
                patch({
                  categoryScopeMode: "selected",
                  selectedCategoryKeys: categoryKeysUsedByAccounts(
                    registerRows,
                    selectedAccountSet,
                  ),
                })
              }
            >
              Used by selected accounts
            </TinyButton>
            <TinyButton
              onClick={() => {
                const ranged = applyImportScope({
                  registerRows,
                  planRows,
                  scope: {
                    ...scope,
                    accountScopeMode: "all",
                    categoryScopeMode: "all",
                    selectedAccountNames: accounts.map((a) => a.accountName),
                    selectedCategoryKeys: categories.map((c) => c.key),
                  },
                });
                const keys = new Set<string>();
                for (const row of ranged.registerRows) {
                  const g = row.categoryGroup;
                  const c = row.category;
                  if (g && c) {
                    const found = categories.find(
                      (x) =>
                        x.groupName === g && x.categoryName === c,
                    );
                    if (found) keys.add(found.key);
                  }
                }
                patch({
                  categoryScopeMode: "selected",
                  selectedCategoryKeys: [...keys],
                });
              }}
            >
              Activity in date range
            </TinyButton>
          </div>
        </div>
        <input
          value={categorySearch}
          onChange={(e) => setCategorySearch(e.target.value)}
          placeholder="Search categories and groups"
          className="input w-full text-sm"
        />
        <ul className="max-h-72 overflow-y-auto space-y-2">
          {filteredGroups.map((g) => {
            const keys = g.categories.map((c) => c.key);
            const state = groupCheckState(keys);
            const expanded = expandedGroups[g.groupName] ?? true;
            return (
              <li
                key={g.groupName}
                className="rounded-lg border border-border overflow-hidden"
              >
                <div className="flex items-center gap-2 bg-canvas px-3 py-2">
                  <input
                    type="checkbox"
                    ref={(el) => {
                      if (el) el.indeterminate = state === "indeterminate";
                    }}
                    checked={state === true}
                    onChange={() => toggleGroup(g.groupName, g.categories)}
                    className="accent-[var(--accent)]"
                  />
                  <button
                    type="button"
                    className="flex-1 text-left text-sm font-medium"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [g.groupName]: !expanded,
                      }))
                    }
                  >
                    {g.groupName}{" "}
                    <span className="text-xs font-normal text-muted">
                      ({g.categories.length})
                    </span>
                  </button>
                </div>
                {expanded && (
                  <ul className="divide-y divide-border">
                    {g.categories.map((c) => (
                      <li
                        key={c.key}
                        className="flex gap-2 px-3 py-2 text-sm pl-8"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCategorySet.has(c.key)}
                          onChange={() => toggleCategory(c.key)}
                          className="mt-1 accent-[var(--accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p>{c.categoryName}</p>
                          <p className="text-xs text-muted">
                            {c.transactionCount} txn · {c.planRowCount} plan
                            {c.earliestDate && c.latestDate
                              ? ` · ${formatDisplayDate(c.earliestDate)} – ${formatDisplayDate(c.latestDate)}`
                              : ""}
                            {c.existingCategoryName
                              ? ` · matches “${c.existingCategoryName}”`
                              : " · will create"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Transfer / category handling */}
      <section className="rounded-xl border border-border p-3 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Transfer to unselected account
        </h4>
        <p className="text-xs text-muted">
          Unselected accounts are not added to account-type mapping. Choose how
          to handle each cross-account transfer — review is the default.
        </p>
        {(
          [
            ["review_one_by_one", "Review one by one (default)"],
            ["include_related_account", "Also include the related account"],
            ["import_as_normal", "Import the selected side as a normal transaction"],
            ["skip", "Skip the transfer"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scope.transferHandlingMode === value}
              onChange={() => patch({ transferHandlingMode: value })}
            />
            {label}
          </label>
        ))}
        {transferReviews.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-2">
            <p className="text-xs font-medium text-amber-950">
              {transferReviews.length} transfer(s) need a decision
            </p>
            {transferReviews.slice(0, 8).map((row) => (
              <div key={row.rowIndex} className="text-xs space-y-1">
                <p>
                  {row.date} · {row.accountName} → {row.transferTargetAccount} ·{" "}
                  {row.payeeName}
                </p>
                <select
                  className="input text-xs"
                  value={scope.transferRowDecisions[row.rowIndex] ?? ""}
                  onChange={(e) =>
                    patch({
                      transferRowDecisions: {
                        ...scope.transferRowDecisions,
                        [row.rowIndex]: e.target
                          .value as Exclude<
                          TransferHandlingMode,
                          "review_one_by_one"
                        >,
                      },
                    })
                  }
                >
                  <option value="">Choose…</option>
                  <option value="include_related_account">Include related</option>
                  <option value="import_as_normal">As normal txn</option>
                  <option value="skip">Skip</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border p-3 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Unselected category on a transaction
        </h4>
        {(
          [
            ["add_to_selection", "Add that category to selection"],
            ["map_to_existing", "Map it to an existing category"],
            ["import_uncategorized", "Import as Uncategorized"],
            ["skip", "Skip the transaction"],
            ["review_one_by_one", "Review one by one"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scope.unselectedCategoryHandlingMode === value}
              onChange={() =>
                patch({ unselectedCategoryHandlingMode: value })
              }
            />
            {label}
          </label>
        ))}
        {scope.unselectedCategoryHandlingMode === "map_to_existing" && (
          <div className="space-y-2">
            {categories
              .filter((c) => !selectedCategorySet.has(c.key))
              .slice(0, 12)
              .map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate">
                    {c.groupName}: {c.categoryName}
                  </span>
                  <select
                    className="input flex-1"
                    value={scope.categoryMappings[c.key] ?? ""}
                    onChange={(e) =>
                      patch({
                        categoryMappings: {
                          ...scope.categoryMappings,
                          [c.key]: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Map to…</option>
                    {plan.categories
                      .filter((x) => !x.deletedAt)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </div>
        )}
        {categoryReviews.length > 0 && (
          <p className="text-xs text-amber-800">
            {categoryReviews.length} row(s) still need a category decision.
          </p>
        )}
      </section>

      {/* Presets */}
      <section className="rounded-xl border border-border p-3 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Scope presets
        </h4>
        <p className="text-xs text-muted">
          Presets are shown first — nothing is applied until you confirm.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_SCOPE_PRESET_TEMPLATES.map((t) => (
            <TinyButton
              key={t.id}
              onClick={() => {
                setPendingPresetId(t.id);
              }}
            >
              {t.name}
            </TinyButton>
          ))}
          {savedPresets.map((p) => (
            <TinyButton
              key={p.id}
              onClick={() => setPendingPresetId(p.id)}
            >
              {p.name}
            </TinyButton>
          ))}
        </div>
        {pendingPresetId && (
          <div className="rounded-lg border border-accent/30 bg-accent-muted/40 p-3 space-y-2 text-sm">
            <p>
              Apply preset{" "}
              <strong>
                {BUILTIN_SCOPE_PRESET_TEMPLATES.find(
                  (t) => t.id === pendingPresetId,
                )?.name ??
                  savedPresets.find((p) => p.id === pendingPresetId)?.name}
              </strong>
              ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  const builtin = BUILTIN_SCOPE_PRESET_TEMPLATES.find(
                    (t) => t.id === pendingPresetId,
                  );
                  if (builtin) {
                    const partial = builtin.apply({
                      accountNames: accounts.map((a) => a.accountName),
                      categoryKeys: categories.map((c) => c.key),
                      activeAccountNames: accounts
                        .filter((a) => a.appearsActive)
                        .map((a) => a.accountName),
                      onBudgetAccountNames: accounts
                        .filter((a) => a.suggestedKind !== "tracking")
                        .map((a) => a.accountName),
                    });
                    onChange({
                      ...scope,
                      ...partial,
                      scopePresetId: builtin.id,
                    });
                  } else {
                    const saved = savedPresets.find(
                      (p) => p.id === pendingPresetId,
                    );
                    if (saved) {
                      onChange({
                        ...scope,
                        ...presetToSelection(saved),
                      });
                    }
                  }
                  setPendingPresetId("");
                }}
              >
                Apply
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs"
                onClick={() => setPendingPresetId("")}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Save current scope as…"
            className="input flex-1 text-sm"
          />
          <button
            type="button"
            disabled={!presetName.trim()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40"
            onClick={() => {
              const saved = saveImportScopePreset(
                selectionToPresetPayload(presetName.trim(), scope),
              );
              setSavedPresets(loadImportScopePresets());
              setPresetName("");
              patch({ scopePresetId: saved.id });
            }}
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  money,
}: {
  label: string;
  value: string;
  money?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      {money != null ? (
        <MoneyText cents={money} signed className="mt-0.5 font-semibold text-sm" />
      ) : (
        <p className="mt-0.5 font-semibold truncate text-sm">{value}</p>
      )}
    </div>
  );
}

function TinyButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-black/5"
    >
      {children}
    </button>
  );
}
