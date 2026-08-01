import type { BudgetPlan } from "@/lib/types/budget";
import type { ImportBatch } from "@/lib/types/import";

export type HistoryActionType =
  | "add_transaction"
  | "edit_transaction"
  | "delete_transaction"
  | "bulk_edit_transactions"
  | "bulk_delete_transactions"
  | "add_transfer"
  | "set_cleared"
  | "move_money"
  | "import_batch"
  | "import_reverse"
  | "account_hide"
  | "account_unhide"
  | "account_close"
  | "account_reopen"
  | "account_edit"
  | "account_delete"
  | "account_restore"
  | "account_purge"
  | "target_edit"
  | "target_add"
  | "target_delete"
  | "category_add"
  | "category_edit"
  | "category_delete"
  | "category_restore"
  | "category_hide"
  | "category_unhide"
  | "category_archive"
  | "category_move"
  | "category_merge"
  | "category_reorder"
  | "category_group_add"
  | "category_group_edit"
  | "category_group_delete"
  | "category_group_merge"
  | "category_group_reorder"
  | "reconcile_adjustment";

export interface HistorySnapshot {
  plan: BudgetPlan;
  importBatches?: ImportBatch[];
}

export interface HistoryEntry {
  id: string;
  actionType: HistoryActionType;
  /** Short label for tooltips, e.g. "Edit transaction" */
  label: string;
  entityType: string;
  entityId?: string;
  batchId?: string;
  householdId?: string;
  userId?: string;
  before: HistorySnapshot;
  after: HistorySnapshot;
  createdAt: string;
  undoneAt?: string;
  redoneAt?: string;
}

export const MAX_HISTORY_STACK = 40;

export function historyLabel(actionType: HistoryActionType): string {
  const labels: Record<HistoryActionType, string> = {
    add_transaction: "Add transaction",
    edit_transaction: "Edit transaction",
    delete_transaction: "Delete transaction",
    bulk_edit_transactions: "Bulk edit transactions",
    bulk_delete_transactions: "Bulk delete transactions",
    add_transfer: "Add transfer",
    set_cleared: "Change cleared status",
    move_money: "Move money",
    import_batch: "Import batch",
    import_reverse: "Undo import",
    account_hide: "Hide account",
    account_unhide: "Unhide account",
    account_close: "Close account",
    account_reopen: "Reopen account",
    account_edit: "Edit account",
    account_delete: "Delete account",
    account_restore: "Restore account",
    account_purge: "Purge account",
    target_edit: "Edit target",
    target_add: "Add target",
    target_delete: "Delete target",
    category_add: "Add category",
    category_edit: "Edit category",
    category_delete: "Delete category",
    category_restore: "Restore category",
    category_hide: "Hide category",
    category_unhide: "Unhide category",
    category_archive: "Archive category",
    category_move: "Move category",
    category_merge: "Merge categories",
    category_reorder: "Reorder categories",
    category_group_add: "Add category group",
    category_group_edit: "Edit category group",
    category_group_delete: "Delete category group",
    category_group_merge: "Merge category groups",
    category_group_reorder: "Reorder category groups",
    reconcile_adjustment: "Reconciliation adjustment",
  };
  return labels[actionType];
}
