import type { AccountBudgetKind } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type { YnabAccountTypeChoice } from "@/lib/imports/ynab/suggest-account-type";

export type TransferHandlingMode =
  | "include_related_account"
  | "import_as_normal"
  | "skip"
  | "review_one_by_one";

export type UnselectedCategoryHandlingMode =
  | "add_to_selection"
  | "map_to_existing"
  | "import_uncategorized"
  | "skip"
  | "review_one_by_one";

export type AccountScopeMode = "all" | "selected";
export type CategoryScopeMode = "all" | "selected";

export type ImportDatePresetId =
  | "all_dates"
  | "year_2026"
  | "this_year"
  | "last_year"
  | "this_month"
  | "last_month"
  | "custom";

export interface ImportDateRange {
  preset: ImportDatePresetId;
  /** Inclusive YYYY-MM-DD; null means unbounded */
  startDate: string | null;
  endDate: string | null;
}

export interface ImportScopeSelection {
  selectedAccountNames: string[];
  selectedCategoryKeys: string[];
  dateRange: ImportDateRange;
  accountScopeMode: AccountScopeMode;
  categoryScopeMode: CategoryScopeMode;
  transferHandlingMode: TransferHandlingMode;
  unselectedCategoryHandlingMode: UnselectedCategoryHandlingMode;
  /** categoryKey → existing app category id */
  categoryMappings: Record<string, string>;
  /** Per-row transfer decisions when mode is review_one_by_one */
  transferRowDecisions: Record<number, Exclude<TransferHandlingMode, "review_one_by_one">>;
  /** Per-row category decisions when mode is review_one_by_one */
  categoryRowDecisions: Record<
    number,
    Exclude<UnselectedCategoryHandlingMode, "review_one_by_one"> | "map_to_existing"
  >;
  scopePresetId?: string;
}

export interface ScopeAccountCandidate {
  accountName: string;
  suggestedType: YnabAccountTypeChoice;
  suggestedKind: AccountBudgetKind;
  transactionCount: number;
  earliestDate?: string;
  latestDate?: string;
  netEffectCents: Cents;
  existingAccountId?: string;
  existingAccountName?: string;
  /** Heuristic: has activity in current calendar year */
  hasCurrentYearActivity: boolean;
  /** Heuristic: latest activity within ~90 days of `now` */
  appearsActive: boolean;
}

export interface ScopeCategoryCandidate {
  key: string;
  groupName: string;
  categoryName: string;
  transactionCount: number;
  planRowCount: number;
  earliestDate?: string;
  latestDate?: string;
  assignedCents: Cents;
  activityCents: Cents;
  availableCents: Cents;
  existingCategoryId?: string;
  existingCategoryName?: string;
}

export interface ScopeCategoryGroupCandidate {
  groupName: string;
  categories: ScopeCategoryCandidate[];
  transactionCount: number;
  planRowCount: number;
}

export type ScopedRegisterDisposition =
  | "included"
  | "excluded_by_account"
  | "excluded_by_category"
  | "excluded_by_date"
  | "transfer_review"
  | "category_review"
  | "future_scheduled"
  | "duplicate"
  | "invalid"
  | "skipped_transfer"
  | "skipped_category";

export interface ScopedRegisterRowMeta {
  rowIndex: number;
  disposition: ScopedRegisterDisposition;
  /** Effective category id override (mapped / uncategorized) */
  categoryIdOverride?: string | null;
  /** When true, import selected side as ordinary (non-transfer) txn */
  forceOrdinary?: boolean;
  /** Accounts auto-included due to transfer handling */
  includedRelatedAccount?: string;
}

export interface ImportScopeSummary {
  accountsSelected: number;
  categoriesSelected: number;
  categoryGroupsAffected: number;
  registerIncluded: number;
  registerExcluded: number;
  planIncluded: number;
  planExcluded: number;
  historicalCount: number;
  futureScheduledCount: number;
  transfersNeedingReview: number;
  uncategorizedMappings: number;
  duplicateCandidates: number;
  invalidCount: number;
  dateRangeLabel: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  balanceEffectCents: Cents;
  registerBeforeDateFilter: number;
  registerAfterDateFilter: number;
  planBeforeDateFilter: number;
  planAfterDateFilter: number;
}

export interface ImportScopePreset {
  id: string;
  name: string;
  createdAt: string;
  selectedAccountNames: string[];
  selectedCategoryKeys: string[];
  dateRange: ImportDateRange;
  transferHandlingMode: TransferHandlingMode;
  unselectedCategoryHandlingMode: UnselectedCategoryHandlingMode;
  accountScopeMode: AccountScopeMode;
  categoryScopeMode: CategoryScopeMode;
}

export const IMPORT_DATE_PRESETS: Array<{
  id: ImportDatePresetId;
  label: string;
}> = [
  { id: "all_dates", label: "All dates" },
  { id: "year_2026", label: "2026 only" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom range" },
];

export function defaultImportScopeSelection(): ImportScopeSelection {
  return {
    selectedAccountNames: [],
    selectedCategoryKeys: [],
    dateRange: { preset: "all_dates", startDate: null, endDate: null },
    accountScopeMode: "all",
    categoryScopeMode: "all",
    transferHandlingMode: "review_one_by_one",
    unselectedCategoryHandlingMode: "import_uncategorized",
    categoryMappings: {},
    transferRowDecisions: {},
    categoryRowDecisions: {},
  };
}
