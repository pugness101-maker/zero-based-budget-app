import type { Cents } from "@/lib/money";
import type { MonthKey } from "@/lib/dates";

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "line_of_credit"
  | "mortgage"
  | "auto_loan"
  | "student_loan"
  | "personal_loan"
  | "investment_tracking"
  | "asset_tracking"
  | "liability_tracking";

export type AccountBudgetKind = "on_budget" | "credit" | "tracking";

export type ClearedStatus = "uncleared" | "cleared" | "reconciled";

export type OverspendingType = "cash" | "credit" | null;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  kind: AccountBudgetKind;
  startingBalanceCents: Cents;
  currency: string;
  institution?: string;
  lastFour?: string;
  note?: string;
  /** Legacy flag — kept in sync with closedAt */
  closed: boolean;
  /** Hidden from normal sidebar navigation (not closed) */
  isHidden?: boolean;
  closedAt?: string;
  closedReason?: string;
  /** e.g. "ynab" when created via YNAB ZIP import */
  importedSource?: string;
  /** Soft delete only — permanent removal when safe */
  deletedAt?: string;
  sortOrder: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
  /** Hidden from normal Plan view */
  hidden: boolean;
  collapsed?: boolean;
  deletedAt?: string;
  mergedIntoGroupId?: string;
}

export interface Category {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
  /** Hidden from Plan and default selectors (not deleted) */
  hidden: boolean;
  notes?: string;
  /** When false, leftover available does not roll into next month */
  rollover: boolean;
  pinned?: boolean;
  isArchived?: boolean;
  deletedAt?: string;
  mergedIntoCategoryId?: string;
  /** How the category was removed (for Settings → Deleted / restore) */
  deletionMethod?:
    | "empty"
    | "budget_history"
    | "move_then_delete"
    | "archive"
    | "force_uncategorized"
    | "merge"
    | "purge";
  /** When false, exclude from new report defaults (history still queryable) */
  reportIncluded?: boolean;
  color?: string;
  icon?: string;
}

export type BudgetValueSource = "app" | "ynab_import";

export interface MonthlyCategoryBudget {
  categoryId: string;
  monthKey: MonthKey;
  assignedCents: Cents;
  /** Historical YNAB activity for the month (not recalculated on import). */
  activityCents?: Cents;
  /** Historical YNAB available for the month (not recalculated on import). */
  availableCents?: Cents;
  source?: BudgetValueSource;
}

export interface ScheduledTransaction {
  id: string;
  accountId: string;
  date: string;
  payeeName: string;
  categoryId: string | null;
  memo?: string;
  amountCents: Cents;
  flag?: string;
  importBatchId?: string;
  importId?: string;
  status: "pending" | "approved" | "skipped";
  /** Set when account close pauses a pending scheduled txn for review */
  pausedByAccountClose?: boolean;
}

export type TargetType =
  | "weekly_fixed"
  | "monthly_fixed"
  | "refill"
  | "save_by_date"
  | "custom_balance"
  | "debt_payment"
  | "custom";

export interface Target {
  id: string;
  categoryId: string;
  type: TargetType;
  amountCents: Cents;
  dueDate?: string;
  cadence?: string;
  notes?: string;
  paused?: boolean;
}

export interface Payee {
  id: string;
  name: string;
  defaultCategoryId?: string;
}

export interface TransactionSplit {
  id: string;
  categoryId: string | null;
  amountCents: Cents;
  memo?: string;
}

export type TransactionSource =
  | "manual"
  | "import"
  | "scheduled"
  | "transfer"
  | "adjustment";

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD UTC calendar date
  payeeId?: string;
  payeeName: string;
  categoryId: string | null;
  memo?: string;
  /** Positive = inflow, negative = outflow (account perspective) */
  amountCents: Cents;
  cleared: ClearedStatus;
  approved: boolean;
  transferId?: string;
  transferPairId?: string;
  isTransfer: boolean;
  splits?: TransactionSplit[];
  flag?: string;
  /** External or generated id used for duplicate detection on re-import */
  importId?: string;
  importBatchId?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: TransactionSource;
}

export interface UserPreferences {
  hideBalances: boolean;
  timezone: string;
  currency: string;
  firstDayOfWeek: 0 | 1;
  /** Show Hidden/Closed sections expanded in sidebar */
  showHiddenAccounts?: boolean;
  showClosedAccounts?: boolean;
}

export interface BudgetPlan {
  id: string;
  name: string;
  currency: string;
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  categories: Category[];
  monthlyBudgets: MonthlyCategoryBudget[];
  targets: Target[];
  payees: Payee[];
  transactions: Transaction[];
  scheduledTransactions?: ScheduledTransaction[];
  preferences: UserPreferences;
  /** Demo household month used as "current" for seed */
  workingMonthKey: MonthKey;
}

export interface CategoryMonthMetrics {
  categoryId: string;
  groupId: string;
  name: string;
  assignedCents: Cents;
  activityCents: Cents;
  /** Available after rollover + assigned + activity */
  availableCents: Cents;
  targetAmountCents: Cents | null;
  underfundedCents: Cents;
  overspendingType: OverspendingType;
  notes?: string;
}

export interface GroupMonthMetrics {
  groupId: string;
  name: string;
  sortOrder: number;
  collapsed: boolean;
  hidden: boolean;
  assignedCents: Cents;
  activityCents: Cents;
  availableCents: Cents;
  categories: CategoryMonthMetrics[];
}

export interface PlanMonthSummary {
  monthKey: MonthKey;
  readyToAssignCents: Cents;
  totalAssignedCents: Cents;
  totalActivityCents: Cents;
  totalAvailableCents: Cents;
  groups: GroupMonthMetrics[];
}

export interface AccountBalance {
  accountId: string;
  balanceCents: Cents;
  clearedBalanceCents: Cents;
}
