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
  | "target_edit"
  | "target_add"
  | "target_delete"
  | "category_edit"
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
    target_edit: "Edit target",
    target_add: "Add target",
    target_delete: "Delete target",
    category_edit: "Edit category",
    reconcile_adjustment: "Reconciliation adjustment",
  };
  return labels[actionType];
}
