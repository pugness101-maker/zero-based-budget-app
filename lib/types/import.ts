import type { AccountType, BudgetPlan, ClearedStatus } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type { MonthKey } from "@/lib/dates";

export type DetectedFileFormat =
  | "json_backup"
  | "ynab_zip"
  | "ynab_csv"
  | "generic_bank_csv"
  | "account_balance_csv"
  | "category_budget_csv"
  | "unknown_csv"
  | "unknown";

export type ImportType =
  | "transactions"
  | "account_balances"
  | "budget_history"
  | "full_backup"
  | "ynab_zip"
  | "auto";

export type FutureRowHandling =
  | "import_as_scheduled"
  | "import_as_transactions"
  | "skip";

export type ImportBatchStatus =
  | "draft"
  | "previewing"
  | "committed"
  | "failed"
  | "reversed";

export type DuplicateHandling = "skip" | "import_anyway" | "review";

export type MergeMode = "merge" | "replace";

export type StartingBalanceBehavior =
  | "keep_existing"
  | "set_from_file"
  | "ignore";

export type ColumnField =
  | "date"
  | "payee"
  | "memo"
  | "category"
  | "outflow"
  | "inflow"
  | "amount"
  | "account"
  | "cleared"
  | "flag"
  | "importId"
  | "ignore";

export type DateFormatHint = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD" | "auto";

export interface ColumnMapping {
  [sourceColumn: string]: ColumnField;
}

export interface ImportMappingPreset {
  id: string;
  name: string;
  institution?: string;
  fileFormat: DetectedFileFormat;
  mapping: ColumnMapping;
  dateFormat: DateFormatHint;
  createdAt: string;
}

export interface UploadedImportFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Text content for CSV/JSON; unused for ZIP (see arrayBuffer). */
  content: string;
  detectedFormat: DetectedFileFormat;
  /** Raw bytes for ZIP uploads */
  arrayBuffer?: ArrayBuffer;
}

export interface ImportBatch {
  id: string;
  householdId: string;
  userId: string;
  fileName: string;
  fileType: string;
  importType: ImportType;
  destinationAccountId?: string;
  status: ImportBatchStatus;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  skippedRows: number;
  errorRows: number;
  mappingJson: ColumnMapping;
  createdAt: string;
  completedAt?: string;
  reversedAt?: string;
  backupId?: string;
  mergeMode: MergeMode;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  balanceEffectCents?: Cents;
  createdCategoryIds?: string[];
  createdAccountIds?: string[];
  createdTransactionIds?: string[];
  /** Free-form import metadata (health notes, scheduled counts, etc.) */
  metadata?: Record<string, string>;
}

export interface ImportRow {
  id: string;
  batchId: string;
  rowIndex: number;
  raw: Record<string, string>;
  parsedDate?: string;
  parsedAmountCents?: Cents;
  payeeName?: string;
  memo?: string;
  categoryName?: string;
  categoryId?: string | null;
  accountName?: string;
  accountId?: string;
  cleared?: ClearedStatus;
  flag?: string;
  importId?: string;
  status:
    | "ready"
    | "duplicate"
    | "needs_category"
    | "invalid"
    | "skipped"
    | "imported";
  duplicateOfTransactionId?: string;
  errors: string[];
  include: boolean;
}

export type BackupReason =
  | "pre_import"
  | "manual"
  | "pre_restore"
  | "pre_bulk_delete"
  | "pre_account_close"
  | "pre_category_merge"
  | "pre_destructive_migration"
  | "pre_clear"
  | "automatic";

export interface BackupExtras {
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
  importBatches: ImportBatch[];
  importRowsByBatch: Record<string, ImportRow[]>;
  auditEvents: AuditEvent[];
  importPromptDismissed: boolean;
}

export interface BackupRecord {
  id: string;
  label: string;
  reason: BackupReason;
  createdAt: string;
  schemaVersion: number;
  planSnapshot: BudgetPlan;
  importBatchId?: string;
  /** Accounts + transactions + categories + … for UI */
  recordCount?: number;
  /** Full non-plan state for Undo Clear Data */
  extras?: BackupExtras;
}

export const MAX_STORED_BACKUPS = 10;
export const MAX_AUTOMATIC_BACKUPS = 5;

export type AuditAction =
  | "create"
  | "edit"
  | "delete"
  | "bulk_action"
  | "import"
  | "import_reverse"
  | "reconcile"
  | "move_money"
  | "target_change"
  | "restore"
  | "account_hide"
  | "account_unhide"
  | "account_close"
  | "account_reopen"
  | "account_delete"
  | "account_restore"
  | "account_purge"
  | "account_edit"
  | "undo"
  | "redo"
  | "category_add"
  | "category_edit"
  | "category_delete"
  | "category_merge"
  | "category_group_change"
  | "clear_data";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DestinationConfig {
  accountId?: string;
  createAccount?: {
    name: string;
    type: AccountType;
    startingBalanceCents: Cents;
  };
  startingBalanceBehavior: StartingBalanceBehavior;
  budgetMonthKey?: MonthKey;
  createMissingCategories: boolean;
}

export interface CategoryMatchDecision {
  sourceName: string;
  categoryId: string | null;
  createNew?: { name: string; groupId: string };
  saveRule?: boolean;
}

export interface PayeeMatchDecision {
  sourceName: string;
  payeeId?: string;
  defaultCategoryId?: string | null;
  saveRule?: boolean;
}

export interface ImportCommitResult {
  ok: boolean;
  batch: ImportBatch;
  rows: ImportRow[];
  error?: string;
  errorCsv?: string;
}

export const IMPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
