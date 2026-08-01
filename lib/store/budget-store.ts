"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import type {
  AccountBudgetKind,
  AccountType,
  BudgetPlan,
  ClearedStatus,
  Target,
  TargetType,
  Transaction,
} from "@/lib/types/budget";
import type { MonthKey } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  AuditAction,
  AuditEvent,
  BackupRecord,
  DestinationConfig,
  DuplicateHandling,
  ImportBatch,
  ImportCommitResult,
  ImportMappingPreset,
  ImportRow,
  MergeMode,
} from "@/lib/types/import";
import { BUILTIN_MAPPING_PRESETS } from "@/lib/imports/mapping-presets";
import {
  commitAccountBalanceImport,
  commitBudgetHistoryImport,
  commitImport,
  toCommitResult,
} from "@/lib/imports/import-transactions";
import { reverseImportBatch } from "@/lib/imports/reverse-import";
import { parseJsonBackup } from "@/lib/imports/parse-json-backup";
import { commitYnabZipImport as commitYnabZip } from "@/lib/imports/ynab/commit-ynab-zip";
import type { YnabZipCommitInput } from "@/lib/imports/ynab/commit-ynab-zip";
import { IMPORT_SCHEMA_VERSION } from "@/lib/types/import";
import { migratePlanAccounts } from "@/lib/accounts/lifecycle";
import { migratePlanCategories } from "@/lib/categories/lifecycle";
import {
  addCategory as addCategoryOp,
  addCategoryGroup as addCategoryGroupOp,
  archiveCategory as archiveCategoryOp,
  bulkSetCategoryHidden as bulkSetCategoryHiddenOp,
  deleteCategoryGroupSafe,
  deleteCategorySafe,
  editCategory as editCategoryOp,
  hideCategory as hideCategoryOp,
  hideCategoryGroup as hideCategoryGroupOp,
  mergeCategories as mergeCategoriesOp,
  mergeCategoryGroups as mergeCategoryGroupsOp,
  moveCategoryToGroup as moveCategoryToGroupOp,
  renameCategoryGroup as renameCategoryGroupOp,
  reorderCategories as reorderCategoriesOp,
  reorderCategoryGroups as reorderCategoryGroupsOp,
  unarchiveCategory as unarchiveCategoryOp,
  unhideCategory as unhideCategoryOp,
  type AddCategoryInput,
  type EditCategoryInput,
} from "@/lib/categories/operations";
import {
  applyCategoryDeleteStrategy,
  purgeDeletedCategory,
  restoreDeletedCategory,
  UNCATEGORIZED_ID,
  type AvailableDisposition,
  type CategoryDeleteStrategy,
} from "@/lib/categories/deletion";
import {
  bulkArchiveWithImpact,
  bulkDeleteCategories as bulkDeleteCategoriesOp,
  bulkHideWithImpact,
  bulkMergeCategories as bulkMergeCategoriesOp,
  bulkMoveWithValidation,
  bulkRestoreCategories as bulkRestoreCategoriesOp,
  type BulkDeleteMode,
} from "@/lib/categories/bulk";
import type { SortCriterion } from "@/lib/transactions/sort";
import {
  resetSortPreferences,
  withUpdatedSortPreferences,
  type SortPreferenceScope,
} from "@/lib/transactions/sort-preferences";

function remapCategoryImportRules(
  rules: Record<string, string>,
  fromId: string,
  toId: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(rules)) {
    next[key] = value === fromId ? toId : value;
  }
  return next;
}
import {
  applyAccountEdit,
  bulkCloseAccounts as bulkCloseAccountsOp,
  bulkReopenAccounts as bulkReopenAccountsOp,
  bulkSetHidden,
  closeAccount as closeAccountOp,
  deleteAccountSafe,
  hideAccount as hideAccountOp,
  reopenAccount as reopenAccountOp,
  unhideAccount as unhideAccountOp,
  type CloseAccountInput,
} from "@/lib/accounts/operations";
import {
  applyBulkDelete,
  applyBulkTransactionPatch,
  applyTransactionEdit,
  createTransaction,
  type TransactionEditInput,
} from "@/lib/transactions/edit";
import { createLinkedTransfer } from "@/lib/payees/transfers";
import {
  deletePayeeSafe,
  mergePayees as mergePayeesOp,
  renamePayee as renamePayeeOp,
  updatePayeeDefaults,
} from "@/lib/payees/manage";
import { validateTargetInput } from "@/lib/calculations/goals";
import { migratePlanTargets } from "@/lib/goals/migrate";
import {
  archiveGoalOnly,
  deleteGoalOnly,
  reconnectGoal as reconnectGoalOp,
  repairDuplicateGoals as repairDuplicateGoalsOp,
} from "@/lib/goals/repair";
import type { GoalLinkType } from "@/lib/types/budget";
import {
  applyRedo,
  applyUndo,
  cloneSnapshot,
  createHistoryEntry,
  peekRedoLabel,
  peekUndoLabel,
  pushUndoStack,
} from "@/lib/history/action-history";
import type { HistoryActionType, HistoryEntry } from "@/lib/history/types";

interface BudgetState {
  plan: BudgetPlan;
  selectedMonthKey: MonthKey;
  selectedCategoryId: string | null;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  importBatches: ImportBatch[];
  importRowsByBatch: Record<string, ImportRow[]>;
  backups: BackupRecord[];
  auditEvents: AuditEvent[];
  mappingPresets: ImportMappingPreset[];
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
  importPromptDismissed: boolean;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  toastMessage: string | null;
  setMonth: (monthKey: MonthKey) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  toggleSidebar: () => void;
  toggleGroupCollapsed: (groupId: string) => void;
  toggleHideBalances: () => void;
  setAssigned: (categoryId: string, assignedCents: Cents) => void;
  addTransaction: (
    input: Omit<Transaction, "id" | "approved"> & { approved?: boolean },
  ) => string;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  editTransaction: (
    id: string,
    input: TransactionEditInput,
  ) => { ok: boolean; error?: string };
  deleteTransaction: (id: string) => void;
  setCleared: (id: string, cleared: ClearedStatus) => void;
  bulkEditTransactions: (
    ids: string[],
    patch: Partial<
      Pick<
        Transaction,
        "categoryId" | "payeeName" | "cleared" | "accountId" | "memo"
      >
    >,
  ) => { ok: boolean; error?: string };
  bulkDeleteTransactions: (ids: string[]) => void;
  addTransfer: (input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: Cents;
    date: string;
    memo?: string;
    cleared?: ClearedStatus;
  }) => { ok: boolean; error?: string };
  renamePayee: (
    payeeIdOrName: string,
    nextName: string,
  ) => { ok: boolean; error?: string };
  mergePayees: (
    sourceIdOrName: string,
    targetIdOrName: string,
  ) => { ok: boolean; error?: string };
  updatePayee: (
    payeeId: string,
    patch: {
      defaultCategoryId?: string | null;
      defaultMemo?: string | null;
      aliases?: string[];
      hidden?: boolean;
    },
  ) => { ok: boolean; error?: string };
  deletePayee: (payeeId: string) => { ok: boolean; error?: string };
  setSuggestPayeeMemo: (value: boolean) => void;
  undo: () => { ok: boolean; error?: string };
  redo: () => { ok: boolean; error?: string };
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoLabel: () => string | null;
  redoLabel: () => string | null;
  clearToast: () => void;
  showToast: (message: string) => void;
  addTarget: (input: {
    name?: string;
    linkType: GoalLinkType;
    categoryId?: string | null;
    accountId?: string | null;
    type: TargetType;
    amountCents: Cents;
    baselineAmountCents?: Cents;
    dueDate?: string;
    repeatRule?: string;
    notes?: string;
    includeTransfers?: boolean;
    includeAdjustments?: boolean;
    allowDuplicateAccountGoal?: boolean;
  }) => { ok: true; id: string } | { ok: false; error: string };
  updateTarget: (
    id: string,
    patch: Partial<Target>,
  ) => { ok: boolean; error?: string };
  deleteTarget: (id: string) => { ok: boolean; error?: string };
  archiveTarget: (
    id: string,
    paused?: boolean,
  ) => { ok: boolean; error?: string };
  repairDuplicateGoals: () => {
    ok: boolean;
    removedCount?: number;
    error?: string;
  };
  reconnectGoal: (
    targetId: string,
    input:
      | { linkType: "category"; categoryId: string }
      | { linkType: "account"; accountId: string },
  ) => { ok: boolean; error?: string };
  createBackup: (label: string, reason: BackupRecord["reason"], importBatchId?: string) => string;
  commitTransactionImport: (input: {
    batch: ImportBatch;
    rows: ImportRow[];
    destination: DestinationConfig;
    duplicateHandling: DuplicateHandling;
    mergeMode: MergeMode;
    categoriesToCreate: Array<{ name: string; groupId: string }>;
  }) => ImportCommitResult;
  commitBudgetImport: (input: {
    batch: ImportBatch;
    rows: ImportRow[];
    monthKey?: string;
    createMissingCategories: boolean;
  }) => ImportCommitResult;
  commitBalanceImport: (input: {
    batch: ImportBatch;
    rows: ImportRow[];
  }) => ImportCommitResult;
  commitYnabZipImport: (
    input: Omit<YnabZipCommitInput, "plan">,
  ) => import("@/lib/imports/ynab/commit-ynab-zip").YnabZipCommitResult;
  restoreJsonBackup: (content: string, mode: MergeMode) => ImportCommitResult;
  reverseImport: (batchId: string) => { ok: boolean; error?: string };
  saveMappingPreset: (preset: Omit<ImportMappingPreset, "id" | "createdAt">) => void;
  savePayeeRule: (sourceName: string, canonicalName: string) => void;
  saveCategoryRule: (sourceName: string, categoryId: string) => void;
  dismissImportPrompt: () => void;
  resetDemoData: () => void;
  setHydrated: (value: boolean) => void;
  updateAccount: (
    accountId: string,
    patch: {
      name?: string;
      note?: string;
      type?: AccountType;
      kind?: AccountBudgetKind;
      isHidden?: boolean;
    },
  ) => void;
  hideAccount: (accountId: string) => void;
  unhideAccount: (accountId: string) => void;
  closeAccount: (
    input: CloseAccountInput,
  ) => { ok: boolean; error?: string };
  reopenAccount: (
    accountId: string,
    keepHidden?: boolean,
  ) => { ok: boolean; error?: string };
  deleteAccount: (accountId: string) => { ok: boolean; error?: string };
  bulkHideAccounts: (accountIds: string[]) => void;
  bulkUnhideAccounts: (accountIds: string[]) => void;
  bulkCloseAccounts: (
    accountIds: string[],
  ) => { ok: boolean; error?: string };
  bulkReopenAccounts: (accountIds: string[], keepHidden?: boolean) => void;
  setShowHiddenAccounts: (value: boolean) => void;
  setShowClosedAccounts: (value: boolean) => void;
  setSettingsCategoryGroupExpanded: (
    groupId: string,
    expanded: boolean,
  ) => void;
  setAllSettingsCategoryGroupsExpanded: (
    groupIds: string[],
    expanded: boolean,
  ) => void;
  setTransactionSort: (
    scope: SortPreferenceScope,
    criteria: SortCriterion[] | null,
  ) => void;
  resetTransactionSort: (scope?: SortPreferenceScope) => void;
  addCategory: (
    input: AddCategoryInput,
  ) => { ok: boolean; error?: string; categoryId?: string };
  editCategory: (
    categoryId: string,
    input: EditCategoryInput,
  ) => { ok: boolean; error?: string };
  hideCategory: (categoryId: string) => { ok: boolean; error?: string };
  unhideCategory: (categoryId: string) => { ok: boolean; error?: string };
  archiveCategory: (categoryId: string) => { ok: boolean; error?: string };
  unarchiveCategory: (categoryId: string) => { ok: boolean; error?: string };
  deleteCategory: (categoryId: string) => { ok: boolean; error?: string };
  deleteCategoryWithStrategy: (
    categoryId: string,
    strategy: CategoryDeleteStrategy,
  ) => { ok: boolean; error?: string };
  restoreCategory: (categoryId: string) => { ok: boolean; error?: string };
  purgeCategory: (categoryId: string) => { ok: boolean; error?: string };
  mergeCategories: (
    sourceId: string,
    destinationId: string,
  ) => { ok: boolean; error?: string };
  moveCategory: (
    categoryId: string,
    groupId: string,
    index?: number,
  ) => { ok: boolean; error?: string };
  reorderCategories: (
    groupId: string,
    orderedIds: string[],
  ) => { ok: boolean; error?: string };
  addCategoryGroup: (
    name: string,
  ) => { ok: boolean; error?: string; groupId?: string };
  renameCategoryGroup: (
    groupId: string,
    name: string,
  ) => { ok: boolean; error?: string };
  hideCategoryGroup: (
    groupId: string,
    hidden?: boolean,
  ) => { ok: boolean; error?: string };
  deleteCategoryGroup: (groupId: string) => { ok: boolean; error?: string };
  mergeCategoryGroups: (
    sourceGroupId: string,
    destinationGroupId: string,
  ) => { ok: boolean; error?: string };
  reorderCategoryGroups: (
    orderedIds: string[],
  ) => { ok: boolean; error?: string };
  bulkHideCategories: (
    categoryIds: string[],
    available?: AvailableDisposition,
  ) => { ok: boolean; error?: string };
  bulkUnhideCategories: (categoryIds: string[]) => void;
  bulkArchiveCategories: (
    categoryIds: string[],
    available?: AvailableDisposition,
  ) => { ok: boolean; error?: string };
  bulkRestoreCategories: (categoryIds: string[]) => {
    ok: boolean;
    error?: string;
  };
  bulkMoveCategories: (categoryIds: string[], groupId: string) => {
    ok: boolean;
    error?: string;
  };
  bulkMergeCategories: (
    sourceIds: string[],
    destinationId: string,
    available?: AvailableDisposition,
  ) => { ok: boolean; error?: string };
  bulkDeleteCategories: (
    categoryIds: string[],
    mode: BulkDeleteMode,
    options?: {
      destinationId?: string;
      available?: AvailableDisposition;
      confirmForce?: boolean;
    },
  ) => { ok: boolean; error?: string };
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function auditEvent(
  partial: Omit<AuditEvent, "id" | "createdAt"> & { action: AuditAction },
): AuditEvent {
  return {
    id: newId("aud"),
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

type SetState = (
  partial:
    | Partial<BudgetState>
    | ((state: BudgetState) => Partial<BudgetState>),
) => void;
type GetState = () => BudgetState;

function commitHistory(
  set: SetState,
  get: GetState,
  meta: {
    actionType: HistoryActionType;
    label?: string;
    entityType: string;
    entityId?: string;
    batchId?: string;
    toast?: string;
    audit?: Omit<AuditEvent, "id" | "createdAt"> & { action: AuditAction };
  },
  next: {
    plan: BudgetPlan;
    importBatches?: ImportBatch[];
    categoryImportRules?: Record<string, string>;
  },
) {
  const before = cloneSnapshot(get().plan, get().importBatches);
  const after = cloneSnapshot(next.plan, next.importBatches ?? get().importBatches);
  const entry = createHistoryEntry({
    actionType: meta.actionType,
    label: meta.label,
    entityType: meta.entityType,
    entityId: meta.entityId,
    batchId: meta.batchId,
    before,
    after,
  });
  set((s) => ({
    plan: next.plan,
    ...(next.importBatches ? { importBatches: next.importBatches } : {}),
    ...(next.categoryImportRules
      ? { categoryImportRules: next.categoryImportRules }
      : {}),
    undoStack: pushUndoStack(s.undoStack, entry),
    redoStack: [],
    toastMessage: meta.toast ?? s.toastMessage,
    auditEvents: meta.audit
      ? [auditEvent(meta.audit), ...s.auditEvents].slice(0, 100)
      : s.auditEvents,
  }));
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      plan: createDemoPlan(),
      selectedMonthKey: createDemoPlan().workingMonthKey,
      selectedCategoryId: null,
      sidebarCollapsed: false,
      hydrated: false,
      importBatches: [],
      importRowsByBatch: {},
      backups: [],
      auditEvents: [],
      mappingPresets: BUILTIN_MAPPING_PRESETS,
      payeeAliasRules: {},
      categoryImportRules: {},
      importPromptDismissed: false,
      undoStack: [],
      redoStack: [],
      toastMessage: null,

      setMonth: (monthKey) => set({ selectedMonthKey: monthKey }),

      setSelectedCategory: (categoryId) =>
        set({ selectedCategoryId: categoryId }),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      toggleGroupCollapsed: (groupId) =>
        set((s) => ({
          plan: {
            ...s.plan,
            categoryGroups: s.plan.categoryGroups.map((g) =>
              g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
            ),
          },
        })),

      toggleHideBalances: () =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: {
              ...s.plan.preferences,
              hideBalances: !s.plan.preferences.hideBalances,
            },
          },
        })),

      setAssigned: (categoryId, assignedCents) => {
        const monthKey = get().selectedMonthKey;
        const existing = get().plan.monthlyBudgets.find(
          (b) => b.categoryId === categoryId && b.monthKey === monthKey,
        );
        const monthlyBudgets = existing
          ? get().plan.monthlyBudgets.map((b) =>
              b.categoryId === categoryId && b.monthKey === monthKey
                ? { ...b, assignedCents }
                : b,
            )
          : [
              ...get().plan.monthlyBudgets,
              { categoryId, monthKey, assignedCents },
            ];
        commitHistory(
          set,
          get,
          {
            actionType: "move_money",
            entityType: "category",
            entityId: categoryId,
            toast: "Assignment updated",
            audit: {
              action: "move_money",
              entityType: "category",
              entityId: categoryId,
              summary: "Moved money / changed assignment",
            },
          },
          { plan: { ...get().plan, monthlyBudgets } },
        );
      },

      addTransaction: (input) => {
        const result = createTransaction(get().plan, input);
        if (!result.ok) throw new Error(result.error);
        commitHistory(
          set,
          get,
          {
            actionType: "add_transaction",
            entityType: "transaction",
            entityId: result.transaction.id,
            toast: "Transaction added",
            audit: {
              action: "create",
              entityType: "transaction",
              entityId: result.transaction.id,
              summary: `Added transaction ${result.transaction.payeeName}`,
            },
          },
          { plan: result.plan },
        );
        return result.transaction.id;
      },

      updateTransaction: (id, patch) => {
        const existing = get().plan.transactions.find((t) => t.id === id);
        if (!existing) return;
        const result = applyTransactionEdit(get().plan, id, {
          accountId: patch.accountId ?? existing.accountId,
          date: patch.date ?? existing.date,
          payeeName: patch.payeeName ?? existing.payeeName,
          categoryId:
            patch.categoryId !== undefined
              ? patch.categoryId
              : existing.categoryId,
          memo: patch.memo !== undefined ? patch.memo : existing.memo,
          amountCents: patch.amountCents ?? existing.amountCents,
          cleared: patch.cleared ?? existing.cleared,
          flag: patch.flag !== undefined ? patch.flag : existing.flag,
          splits: patch.splits !== undefined ? patch.splits : existing.splits,
          transferAccountId: existing.transferPairId
            ? get().plan.transactions.find((t) => t.id === existing.transferPairId)
                ?.accountId
            : undefined,
        });
        if (!result.ok) throw new Error(result.error);
        commitHistory(
          set,
          get,
          {
            actionType: "edit_transaction",
            entityType: "transaction",
            entityId: id,
            toast: "Transaction updated",
            audit: {
              action: "edit",
              entityType: "transaction",
              entityId: id,
              summary: `Edited transaction ${result.transaction.payeeName}`,
            },
          },
          { plan: result.plan },
        );
      },

      editTransaction: (id, input) => {
        const result = applyTransactionEdit(get().plan, id, input);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "edit_transaction",
            entityType: "transaction",
            entityId: id,
            toast: "Transaction updated",
            audit: {
              action: "edit",
              entityType: "transaction",
              entityId: id,
              summary: `Edited transaction ${result.transaction.payeeName}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      deleteTransaction: (id) => {
        const target = get().plan.transactions.find((t) => t.id === id);
        if (!target) return;
        const next = applyBulkDelete(get().plan, [id]);
        commitHistory(
          set,
          get,
          {
            actionType: "delete_transaction",
            entityType: "transaction",
            entityId: id,
            toast: "Transaction deleted",
            audit: {
              action: "delete",
              entityType: "transaction",
              entityId: id,
              summary: `Deleted transaction ${target.payeeName}`,
            },
          },
          { plan: next.plan },
        );
      },

      setCleared: (id, cleared) => {
        const existing = get().plan.transactions.find((t) => t.id === id);
        if (!existing || existing.cleared === cleared) return;
        const plan = {
          ...get().plan,
          transactions: get().plan.transactions.map((t) =>
            t.id === id
              ? { ...t, cleared, updatedAt: new Date().toISOString() }
              : t,
          ),
        };
        commitHistory(
          set,
          get,
          {
            actionType: "set_cleared",
            entityType: "transaction",
            entityId: id,
            audit: {
              action: "edit",
              entityType: "transaction",
              entityId: id,
              summary: `Set cleared status to ${cleared}`,
            },
          },
          { plan },
        );
      },

      bulkEditTransactions: (ids, patch) => {
        const result = applyBulkTransactionPatch(get().plan, ids, patch);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "bulk_edit_transactions",
            entityType: "transaction",
            batchId: newId("bulk"),
            toast: `Updated ${ids.length} transaction(s)`,
            audit: {
              action: "bulk_action",
              entityType: "transaction",
              summary: `Bulk edited ${ids.length} transaction(s)`,
              metadata: { ids, patch },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkDeleteTransactions: (ids) => {
        const next = applyBulkDelete(get().plan, ids);
        commitHistory(
          set,
          get,
          {
            actionType: "bulk_delete_transactions",
            entityType: "transaction",
            batchId: newId("bulk"),
            toast: `Deleted ${ids.length} transaction(s)`,
            audit: {
              action: "bulk_action",
              entityType: "transaction",
              summary: `Bulk deleted ${ids.length} transaction(s)`,
              metadata: { ids },
            },
          },
          { plan: next.plan },
        );
      },

      addTransfer: ({
        fromAccountId,
        toAccountId,
        amountCents,
        date,
        memo,
        cleared,
      }) => {
        const result = createLinkedTransfer(get().plan, {
          fromAccountId,
          toAccountId,
          amountCents,
          date,
          memo,
          cleared,
        });
        if (!result.ok) return { ok: false, error: result.error };

        const from = get().plan.accounts.find((a) => a.id === fromAccountId);
        const to = get().plan.accounts.find((a) => a.id === toAccountId);
        commitHistory(
          set,
          get,
          {
            actionType: "add_transfer",
            entityType: "transaction",
            entityId: result.outTransaction.id,
            toast: "Transfer added",
            audit: {
              action: "create",
              entityType: "transaction",
              entityId: result.outTransaction.id,
              summary: `Transfer ${from?.name} → ${to?.name}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      undo: () => {
        const result = applyUndo({
          undoStack: get().undoStack,
          redoStack: get().redoStack,
        });
        if (!result.ok) return { ok: false, error: result.error };
        set((s) => ({
          plan: result.snapshot.plan,
          ...(result.snapshot.importBatches
            ? { importBatches: result.snapshot.importBatches }
            : {}),
          undoStack: result.undoStack,
          redoStack: result.redoStack,
          toastMessage: `Undid ${result.entry.label}`,
          auditEvents: [
            auditEvent({
              action: "undo",
              entityType: result.entry.entityType,
              entityId: result.entry.entityId,
              summary: `Undo: ${result.entry.label}`,
              metadata: { historyId: result.entry.id },
            }),
            ...s.auditEvents,
          ].slice(0, 100),
        }));
        return { ok: true };
      },

      redo: () => {
        const result = applyRedo({
          undoStack: get().undoStack,
          redoStack: get().redoStack,
        });
        if (!result.ok) return { ok: false, error: result.error };
        set((s) => ({
          plan: result.snapshot.plan,
          ...(result.snapshot.importBatches
            ? { importBatches: result.snapshot.importBatches }
            : {}),
          undoStack: result.undoStack,
          redoStack: result.redoStack,
          toastMessage: `Redid ${result.entry.label}`,
          auditEvents: [
            auditEvent({
              action: "redo",
              entityType: result.entry.entityType,
              entityId: result.entry.entityId,
              summary: `Redo: ${result.entry.label}`,
              metadata: { historyId: result.entry.id },
            }),
            ...s.auditEvents,
          ].slice(0, 100),
        }));
        return { ok: true };
      },

      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,
      undoLabel: () => peekUndoLabel(get().undoStack),
      redoLabel: () => peekRedoLabel(get().redoStack),
      clearToast: () => set({ toastMessage: null }),
      showToast: (message) => set({ toastMessage: message }),

      addTarget: (input) => {
        const linkType = input.linkType;
        const categoryId =
          linkType === "category" ? input.categoryId ?? null : null;
        const accountId =
          linkType === "account" ? input.accountId ?? null : null;
        const invalid = validateTargetInput(get().plan, {
          linkType,
          categoryId,
          accountId,
          type: input.type,
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          allowDuplicateAccountGoal: input.allowDuplicateAccountGoal,
        });
        if (invalid) return { ok: false as const, error: invalid };

        const id = newId("tgt");
        const target: Target = {
          id,
          name: input.name?.trim() || undefined,
          linkType,
          categoryId,
          accountId,
          type: input.type,
          amountCents: input.amountCents,
          baselineAmountCents: input.baselineAmountCents,
          dueDate: input.dueDate,
          repeatRule: input.repeatRule,
          notes: input.notes,
          includeTransfers: input.includeTransfers,
          includeAdjustments: input.includeAdjustments,
          allowDuplicateAccountGoal: input.allowDuplicateAccountGoal,
        };
        commitHistory(
          set,
          get,
          {
            actionType: "target_add",
            entityType: "target",
            entityId: id,
            toast: "Goal added",
            audit: {
              action: "target_change",
              entityType: "target",
              entityId: id,
              summary: "Added target",
            },
          },
          { plan: { ...get().plan, targets: [...get().plan.targets, target] } },
        );
        return { ok: true as const, id };
      },

      updateTarget: (id, patch) => {
        const existing = get().plan.targets.find((t) => t.id === id);
        if (!existing) return { ok: false, error: "Goal not found." };
        const next: Target = { ...existing, ...patch };
        if (next.linkType === "category") next.accountId = null;
        if (next.linkType === "account") next.categoryId = null;
        const invalid = validateTargetInput(
          get().plan,
          {
            linkType: next.linkType,
            categoryId: next.categoryId,
            accountId: next.accountId,
            type: next.type,
            amountCents: next.amountCents,
            dueDate: next.dueDate,
            allowDuplicateAccountGoal: next.allowDuplicateAccountGoal,
          },
          { excludeTargetId: id },
        );
        if (invalid) return { ok: false, error: invalid };

        commitHistory(
          set,
          get,
          {
            actionType: "target_edit",
            entityType: "target",
            entityId: id,
            toast: "Goal updated",
            audit: {
              action: "target_change",
              entityType: "target",
              entityId: id,
              summary: "Edited target",
            },
          },
          {
            plan: {
              ...get().plan,
              targets: get().plan.targets.map((t) =>
                t.id === id ? next : t,
              ),
            },
          },
        );
        return { ok: true };
      },

      deleteTarget: (id) => {
        const result = deleteGoalOnly(get().plan, id);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "target_delete",
            entityType: "target",
            entityId: id,
            toast: "Goal deleted",
            audit: {
              action: "target_change",
              entityType: "target",
              entityId: id,
              summary: "Deleted target",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      archiveTarget: (id, paused = true) => {
        const result = archiveGoalOnly(get().plan, id, paused);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "target_edit",
            entityType: "target",
            entityId: id,
            toast: paused ? "Goal archived" : "Goal restored",
            audit: {
              action: "target_change",
              entityType: "target",
              entityId: id,
              summary: paused ? "Archived target" : "Unarchived target",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      repairDuplicateGoals: () => {
        const result = repairDuplicateGoalsOp(get().plan);
        if (!result.ok) return { ok: false, error: result.error };
        if (result.removedIds.length === 0) {
          return { ok: true, removedCount: 0 };
        }
        commitHistory(
          set,
          get,
          {
            actionType: "target_delete",
            entityType: "target",
            toast: `Removed ${result.removedIds.length} duplicate goal(s)`,
            audit: {
              action: "target_change",
              entityType: "target",
              summary: `Repaired duplicate goals (${result.removedIds.length} removed)`,
              metadata: { removedIds: result.removedIds },
            },
          },
          { plan: result.plan },
        );
        return { ok: true, removedCount: result.removedIds.length };
      },

      reconnectGoal: (targetId, input) => {
        const result = reconnectGoalOp(get().plan, targetId, input);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "target_edit",
            entityType: "target",
            entityId: targetId,
            toast: "Goal reconnected",
            audit: {
              action: "target_change",
              entityType: "target",
              entityId: targetId,
              summary:
                input.linkType === "category"
                  ? `Reconnected goal to category ${input.categoryId}`
                  : `Reconnected goal to account ${input.accountId}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      createBackup: (label, reason, importBatchId) => {
        const id = newId("bak");
        const backup: BackupRecord = {
          id,
          label,
          reason,
          createdAt: new Date().toISOString(),
          schemaVersion: IMPORT_SCHEMA_VERSION,
          planSnapshot: structuredClone(get().plan),
          importBatchId,
        };
        set((s) => ({
          backups: [backup, ...s.backups].slice(0, 20),
        }));
        return id;
      },

      commitTransactionImport: ({
        batch,
        rows,
        destination,
        duplicateHandling,
        mergeMode,
        categoriesToCreate,
      }) => {
        const previous = structuredClone(get().plan);
        const backupId = get().createBackup(
          `Before import ${batch.fileName}`,
          "pre_import",
          batch.id,
        );

        const result = commitImport({
          plan: get().plan,
          batch: { ...batch, backupId, mergeMode },
          rows,
          destination,
          duplicateHandling,
          mergeMode,
          categoriesToCreate,
        });

        if (!result.ok) {
          // Rollback — plan unchanged
          set((s) => ({
            plan: previous,
            importBatches: [
              result.batch,
              ...s.importBatches.filter((b) => b.id !== batch.id),
            ],
            importRowsByBatch: {
              ...s.importRowsByBatch,
              [batch.id]: result.rows,
            },
            auditEvents: [
              auditEvent({
                action: "import",
                entityType: "import_batch",
                entityId: batch.id,
                summary: `Import failed: ${result.error}`,
              }),
              ...s.auditEvents,
            ].slice(0, 100),
          }));
          return toCommitResult(result);
        }

        const nextBatches = [
          result.batch,
          ...get().importBatches.filter((b) => b.id !== batch.id),
        ];
        commitHistory(
          set,
          get,
          {
            actionType: "import_batch",
            entityType: "import_batch",
            entityId: batch.id,
            batchId: batch.id,
            toast: `Imported ${result.batch.importedRows} transactions`,
            audit: {
              action: "import",
              entityType: "import_batch",
              entityId: batch.id,
              summary: `Imported ${result.batch.importedRows} transactions from ${batch.fileName}`,
              metadata: {
                importedRows: result.batch.importedRows,
                duplicateRows: result.batch.duplicateRows,
              },
            },
          },
          { plan: result.plan, importBatches: nextBatches },
        );
        set((s) => ({
          importRowsByBatch: {
            ...s.importRowsByBatch,
            [batch.id]: result.rows,
          },
          importPromptDismissed: true,
        }));
        return toCommitResult(result);
      },

      commitBudgetImport: ({ batch, rows, monthKey, createMissingCategories }) => {
        const previous = structuredClone(get().plan);
        const backupId = get().createBackup(
          `Before budget import ${batch.fileName}`,
          "pre_import",
          batch.id,
        );
        const result = commitBudgetHistoryImport({
          plan: get().plan,
          batch: { ...batch, backupId, mergeMode: "merge" },
          rows,
          monthKey,
          createMissingCategories,
        });
        if (!result.ok) {
          set((s) => ({
            plan: previous,
            importBatches: [result.batch, ...s.importBatches],
            importRowsByBatch: { ...s.importRowsByBatch, [batch.id]: result.rows },
          }));
          return toCommitResult(result);
        }
        set((s) => ({
          plan: result.plan,
          importBatches: [result.batch, ...s.importBatches],
          importRowsByBatch: { ...s.importRowsByBatch, [batch.id]: result.rows },
          auditEvents: [
            auditEvent({
              action: "import",
              entityType: "import_batch",
              entityId: batch.id,
              summary: `Imported budget history from ${batch.fileName}`,
            }),
            ...s.auditEvents,
          ].slice(0, 100),
        }));
        return toCommitResult(result);
      },

      commitBalanceImport: ({ batch, rows }) => {
        const previous = structuredClone(get().plan);
        const backupId = get().createBackup(
          `Before balance import ${batch.fileName}`,
          "pre_import",
          batch.id,
        );
        const result = commitAccountBalanceImport({
          plan: get().plan,
          batch: { ...batch, backupId, mergeMode: "merge" },
          rows,
        });
        if (!result.ok) {
          set({ plan: previous });
          return toCommitResult(result);
        }
        set((s) => ({
          plan: result.plan,
          importBatches: [result.batch, ...s.importBatches],
          importRowsByBatch: { ...s.importRowsByBatch, [batch.id]: result.rows },
        }));
        return toCommitResult(result);
      },

      commitYnabZipImport: (input) => {
        const previous = structuredClone(get().plan);
        const backupId = get().createBackup(
          `Before YNAB import ${input.batch.fileName}`,
          "pre_import",
          input.batch.id,
        );
        const result = commitYnabZip({
          ...input,
          plan: get().plan,
          batch: { ...input.batch, backupId, mergeMode: input.mergeMode },
        });
        if (!result.ok || !result.plan) {
          set((s) => ({
            plan: previous,
            importBatches: [
              result.batch,
              ...s.importBatches.filter((b) => b.id !== input.batch.id),
            ],
            importRowsByBatch: {
              ...s.importRowsByBatch,
              [input.batch.id]: result.rows,
            },
            auditEvents: [
              auditEvent({
                action: "import",
                entityType: "import_batch",
                entityId: input.batch.id,
                summary: `YNAB import failed: ${result.error}`,
              }),
              ...s.auditEvents,
            ].slice(0, 100),
          }));
          return result;
        }

        set((s) => ({
          plan: result.plan!,
          importBatches: [
            result.batch,
            ...s.importBatches.filter((b) => b.id !== input.batch.id),
          ],
          importRowsByBatch: {
            ...s.importRowsByBatch,
            [input.batch.id]: result.rows,
          },
          importPromptDismissed: true,
          auditEvents: [
            auditEvent({
              action: "import",
              entityType: "import_batch",
              entityId: input.batch.id,
              summary: `Imported YNAB ZIP ${input.batch.fileName}`,
              metadata: {
                importedRows: result.batch.importedRows,
                duplicateRows: result.batch.duplicateRows,
              },
            }),
            ...s.auditEvents,
          ].slice(0, 100),
        }));
        return result;
      },

      restoreJsonBackup: (content, mode) => {
        const preview = parseJsonBackup(content);
        const batchId = newId("batch");
        const batch: ImportBatch = {
          id: batchId,
          householdId: "local",
          userId: "demo",
          fileName: "backup.json",
          fileType: "json",
          importType: "full_backup",
          status: "draft",
          totalRows: 0,
          importedRows: 0,
          duplicateRows: 0,
          skippedRows: 0,
          errorRows: 0,
          mappingJson: {},
          createdAt: new Date().toISOString(),
          mergeMode: mode,
        };

        if (!preview.ok || !preview.plan) {
          return {
            ok: false,
            batch: { ...batch, status: "failed", errorRows: 1 },
            rows: [],
            error: preview.errors.join(" "),
          };
        }

        const previous = structuredClone(get().plan);
        const backupId = get().createBackup(
          "Before JSON restore",
          "pre_restore",
          batchId,
        );

        try {
          if (mode === "replace") {
            set((s) => ({
              plan: structuredClone(preview.plan!),
              importBatches: [
                {
                  ...batch,
                  status: "committed",
                  backupId,
                  completedAt: new Date().toISOString(),
                  importedRows: preview.transactionCount,
                  totalRows: preview.transactionCount,
                },
                ...s.importBatches,
              ],
              auditEvents: [
                auditEvent({
                  action: "restore",
                  entityType: "backup",
                  summary: "Restored JSON backup (replace)",
                }),
                ...s.auditEvents,
              ],
            }));
          } else {
            // Merge: append transactions/accounts/categories by id
            const plan = structuredClone(get().plan);
            const acctIds = new Set(plan.accounts.map((a) => a.id));
            const catIds = new Set(plan.categories.map((c) => c.id));
            const txnIds = new Set(plan.transactions.map((t) => t.id));
            const incoming = preview.plan!;
            plan.accounts = [
              ...plan.accounts,
              ...incoming.accounts.filter((a) => !acctIds.has(a.id)),
            ];
            plan.categoryGroups = [
              ...plan.categoryGroups,
              ...incoming.categoryGroups.filter(
                (g) => !plan.categoryGroups.some((x) => x.id === g.id),
              ),
            ];
            plan.categories = [
              ...plan.categories,
              ...incoming.categories.filter((c) => !catIds.has(c.id)),
            ];
            plan.transactions = [
              ...incoming.transactions.filter((t) => !txnIds.has(t.id)),
              ...plan.transactions,
            ];
            set((s) => ({
              plan,
              importBatches: [
                {
                  ...batch,
                  status: "committed",
                  backupId,
                  mergeMode: "merge",
                  completedAt: new Date().toISOString(),
                  importedRows: incoming.transactions.length,
                  totalRows: incoming.transactions.length,
                },
                ...s.importBatches,
              ],
            }));
          }
          return {
            ok: true,
            batch: {
              ...batch,
              status: "committed",
              backupId,
              completedAt: new Date().toISOString(),
            },
            rows: [],
          };
        } catch (err) {
          set({ plan: previous });
          return {
            ok: false,
            batch: { ...batch, status: "failed" },
            rows: [],
            error: err instanceof Error ? err.message : "Restore failed.",
          };
        }
      },

      reverseImport: (batchId) => {
        const batch = get().importBatches.find((b) => b.id === batchId);
        if (!batch) return { ok: false, error: "Import batch not found." };
        const backup = get().backups.find(
          (b) => b.id === batch.backupId || b.importBatchId === batchId,
        );
        const result = reverseImportBatch({
          plan: get().plan,
          batch,
          backup,
        });
        if (!result.ok || !result.plan || !result.batch) {
          return { ok: false, error: result.error };
        }
        const nextBatches = get().importBatches.map((b) =>
          b.id === batchId ? result.batch! : b,
        );
        commitHistory(
          set,
          get,
          {
            actionType: "import_reverse",
            entityType: "import_batch",
            entityId: batchId,
            batchId,
            toast: `Reversed import ${batch.fileName}`,
            audit: {
              action: "import_reverse",
              entityType: "import_batch",
              entityId: batchId,
              summary: `Reversed import ${batch.fileName}`,
            },
          },
          { plan: result.plan, importBatches: nextBatches },
        );
        return { ok: true };
      },

      saveMappingPreset: (preset) => {
        const full: ImportMappingPreset = {
          ...preset,
          id: newId("preset"),
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ mappingPresets: [full, ...s.mappingPresets] }));
      },

      savePayeeRule: (sourceName, canonicalName) =>
        set((s) => ({
          payeeAliasRules: {
            ...s.payeeAliasRules,
            [sourceName.toLowerCase()]: canonicalName,
          },
        })),

      renamePayee: (payeeIdOrName, nextName) => {
        const result = renamePayeeOp(get().plan, payeeIdOrName, nextName);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "edit_transaction",
            entityType: "payee",
            toast: "Payee renamed",
            audit: {
              action: "edit",
              entityType: "payee",
              summary: `Renamed payee to ${nextName}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      mergePayees: (sourceIdOrName, targetIdOrName) => {
        const result = mergePayeesOp(
          get().plan,
          sourceIdOrName,
          targetIdOrName,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "edit_transaction",
            entityType: "payee",
            toast: "Payees merged",
            audit: {
              action: "edit",
              entityType: "payee",
              summary: `Merged payee ${sourceIdOrName} into ${targetIdOrName}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      updatePayee: (payeeId, patch) => {
        const result = updatePayeeDefaults(get().plan, payeeId, patch);
        if (!result.ok) return { ok: false, error: result.error };
        set({ plan: result.plan });
        return { ok: true };
      },

      deletePayee: (payeeId) => {
        const result = deletePayeeSafe(get().plan, payeeId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "delete_transaction",
            entityType: "payee",
            entityId: payeeId,
            toast: "Payee deleted",
            audit: {
              action: "delete",
              entityType: "payee",
              entityId: payeeId,
              summary: "Deleted unused payee",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      setSuggestPayeeMemo: (value) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: {
              ...s.plan.preferences,
              suggestPayeeMemo: value,
            },
          },
        })),

      saveCategoryRule: (sourceName, categoryId) =>
        set((s) => ({
          categoryImportRules: {
            ...s.categoryImportRules,
            [sourceName.toLowerCase()]: categoryId,
          },
        })),

      dismissImportPrompt: () => set({ importPromptDismissed: true }),

      resetDemoData: () => {
        const plan = createDemoPlan();
        set({
          plan,
          selectedMonthKey: plan.workingMonthKey,
          selectedCategoryId: null,
          importBatches: [],
          importRowsByBatch: {},
          importPromptDismissed: false,
          undoStack: [],
          redoStack: [],
          toastMessage: null,
        });
      },

      setHydrated: (value) => set({ hydrated: value }),

      updateAccount: (accountId, patch) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_edit",
            entityType: "account",
            entityId: accountId,
            audit: {
              action: "account_edit",
              entityType: "account",
              entityId: accountId,
              summary: "Updated account settings",
              metadata: patch as Record<string, unknown>,
            },
          },
          { plan: applyAccountEdit(get().plan, accountId, patch) },
        );
      },

      hideAccount: (accountId) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_hide",
            entityType: "account",
            entityId: accountId,
            audit: {
              action: "account_hide",
              entityType: "account",
              entityId: accountId,
              summary: "Hid account from sidebar",
            },
          },
          { plan: hideAccountOp(get().plan, accountId) },
        );
      },

      unhideAccount: (accountId) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_unhide",
            entityType: "account",
            entityId: accountId,
            audit: {
              action: "account_unhide",
              entityType: "account",
              entityId: accountId,
              summary: "Unhid account",
            },
          },
          { plan: unhideAccountOp(get().plan, accountId) },
        );
      },

      closeAccount: (input) => {
        const result = closeAccountOp(get().plan, input);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "account_close",
            entityType: "account",
            entityId: input.accountId,
            toast: "Account closed",
            audit: {
              action: "account_close",
              entityType: "account",
              entityId: input.accountId,
              summary: `Closed account (${input.strategy})`,
              metadata: {
                strategy: input.strategy,
                transferToAccountId: input.transferToAccountId,
                reason: input.reason,
              },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      reopenAccount: (accountId, keepHidden = false) => {
        const result = reopenAccountOp(get().plan, { accountId, keepHidden });
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "account_reopen",
            entityType: "account",
            entityId: accountId,
            toast: "Account reopened",
            audit: {
              action: "account_reopen",
              entityType: "account",
              entityId: accountId,
              summary: keepHidden
                ? "Reopened account (kept hidden)"
                : "Reopened account",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      deleteAccount: (accountId) => {
        const result = deleteAccountSafe(get().plan, accountId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "account_delete",
            entityType: "account",
            entityId: accountId,
            toast: "Account deleted",
            audit: {
              action: "account_delete",
              entityType: "account",
              entityId: accountId,
              summary: "Permanently deleted empty account",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkHideAccounts: (accountIds) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_hide",
            entityType: "account",
            audit: {
              action: "bulk_action",
              entityType: "account",
              summary: `Hid ${accountIds.length} account(s)`,
              metadata: { accountIds, action: "hide" },
            },
          },
          { plan: bulkSetHidden(get().plan, accountIds, true) },
        );
      },

      bulkUnhideAccounts: (accountIds) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_unhide",
            entityType: "account",
            audit: {
              action: "bulk_action",
              entityType: "account",
              summary: `Unhid ${accountIds.length} account(s)`,
              metadata: { accountIds, action: "unhide" },
            },
          },
          { plan: bulkSetHidden(get().plan, accountIds, false) },
        );
      },

      bulkCloseAccounts: (accountIds) => {
        const result = bulkCloseAccountsOp(get().plan, accountIds, true);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "account_close",
            entityType: "account",
            audit: {
              action: "bulk_action",
              entityType: "account",
              summary: `Closed ${accountIds.length} account(s)`,
              metadata: { accountIds, action: "close" },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkReopenAccounts: (accountIds, keepHidden = false) => {
        commitHistory(
          set,
          get,
          {
            actionType: "account_reopen",
            entityType: "account",
            audit: {
              action: "bulk_action",
              entityType: "account",
              summary: `Reopened ${accountIds.length} account(s)`,
              metadata: { accountIds, action: "reopen", keepHidden },
            },
          },
          { plan: bulkReopenAccountsOp(get().plan, accountIds, keepHidden) },
        );
      },

      setShowHiddenAccounts: (value) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: { ...s.plan.preferences, showHiddenAccounts: value },
          },
        })),

      setShowClosedAccounts: (value) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: { ...s.plan.preferences, showClosedAccounts: value },
          },
        })),

      setSettingsCategoryGroupExpanded: (groupId, expanded) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: {
              ...s.plan.preferences,
              settingsCategoryGroupsExpanded: {
                ...(s.plan.preferences.settingsCategoryGroupsExpanded ?? {}),
                [groupId]: expanded,
              },
            },
          },
        })),

      setAllSettingsCategoryGroupsExpanded: (groupIds, expanded) =>
        set((s) => {
          const map: Record<string, boolean> = {
            ...(s.plan.preferences.settingsCategoryGroupsExpanded ?? {}),
          };
          for (const id of groupIds) map[id] = expanded;
          return {
            plan: {
              ...s.plan,
              preferences: {
                ...s.plan.preferences,
                settingsCategoryGroupsExpanded: map,
              },
            },
          };
        }),

      setTransactionSort: (scope, criteria) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: withUpdatedSortPreferences(
              s.plan.preferences,
              scope,
              criteria,
            ),
          },
        })),

      resetTransactionSort: (scope) =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: resetSortPreferences(s.plan.preferences, scope),
          },
        })),

      addCategory: (input) => {
        const result = addCategoryOp(get().plan, input);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_add",
            entityType: "category",
            entityId: result.entityId,
            toast: "Category added",
            audit: {
              action: "category_add",
              entityType: "category",
              entityId: result.entityId,
              summary: `Added category ${input.name.trim()}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true, categoryId: result.entityId };
      },

      editCategory: (categoryId, input) => {
        const result = editCategoryOp(get().plan, categoryId, input);
        if (!result.ok) return { ok: false, error: result.error };
        const actionType =
          input.groupId &&
          input.groupId !==
            get().plan.categories.find((c) => c.id === categoryId)?.groupId
            ? "category_move"
            : "category_edit";
        commitHistory(
          set,
          get,
          {
            actionType,
            entityType: "category",
            entityId: categoryId,
            toast: "Category updated",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Edited category",
              metadata: input as Record<string, unknown>,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      hideCategory: (categoryId) => {
        const result = hideCategoryOp(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_hide",
            entityType: "category",
            entityId: categoryId,
            toast: "Category hidden",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Hid category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      unhideCategory: (categoryId) => {
        const result = unhideCategoryOp(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_unhide",
            entityType: "category",
            entityId: categoryId,
            toast: "Category unhidden",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Unhid category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      archiveCategory: (categoryId) => {
        const result = archiveCategoryOp(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_archive",
            entityType: "category",
            entityId: categoryId,
            toast: "Category archived",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Archived category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      unarchiveCategory: (categoryId) => {
        const result = unarchiveCategoryOp(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_restore",
            label: "Unarchive category",
            entityType: "category",
            entityId: categoryId,
            toast: "Category restored",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Unarchived category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      deleteCategory: (categoryId) => {
        const result = deleteCategorySafe(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_delete",
            entityType: "category",
            entityId: categoryId,
            toast: "Category deleted",
            audit: {
              action: "category_delete",
              entityType: "category",
              entityId: categoryId,
              summary: "Deleted category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      deleteCategoryWithStrategy: (categoryId, strategy) => {
        const state = get();
        const result = applyCategoryDeleteStrategy(
          state.plan,
          categoryId,
          state.selectedMonthKey,
          strategy,
        );
        if (!result.ok) return { ok: false, error: result.error };

        let categoryImportRules = state.categoryImportRules;
        if (strategy.mode === "move_then_delete") {
          categoryImportRules = remapCategoryImportRules(
            categoryImportRules,
            categoryId,
            strategy.destinationId,
          );
        } else if (strategy.mode === "force_uncategorized") {
          categoryImportRules = remapCategoryImportRules(
            categoryImportRules,
            categoryId,
            UNCATEGORIZED_ID,
          );
        }

        const toastByMode: Record<CategoryDeleteStrategy["mode"], string> = {
          budget_history: "Category and budget history deleted",
          move_then_delete: "Category history moved, then deleted",
          archive: "Category archived for current and future months",
          force_uncategorized: "Category force-deleted to Uncategorized",
        };

        commitHistory(
          set,
          get,
          {
            actionType:
              strategy.mode === "archive"
                ? "category_archive"
                : "category_delete",
            label: toastByMode[strategy.mode],
            entityType: "category",
            entityId: categoryId,
            toast: toastByMode[strategy.mode],
            audit: {
              action: "category_delete",
              entityType: "category",
              entityId: categoryId,
              summary: toastByMode[strategy.mode],
              metadata: { strategy },
            },
          },
          { plan: result.plan, categoryImportRules },
        );
        return { ok: true };
      },

      restoreCategory: (categoryId) => {
        const result = restoreDeletedCategory(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_restore",
            entityType: "category",
            entityId: categoryId,
            toast: "Category restored",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Restored deleted category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      purgeCategory: (categoryId) => {
        const result = purgeDeletedCategory(get().plan, categoryId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_delete",
            label: "Permanently purge category",
            entityType: "category",
            entityId: categoryId,
            toast: "Category permanently removed",
            audit: {
              action: "category_delete",
              entityType: "category",
              entityId: categoryId,
              summary: "Purged deleted category",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      mergeCategories: (sourceId, destinationId) => {
        const result = mergeCategoriesOp(get().plan, sourceId, destinationId);
        if (!result.ok) return { ok: false, error: result.error };
        const categoryImportRules = remapCategoryImportRules(
          get().categoryImportRules,
          sourceId,
          destinationId,
        );
        commitHistory(
          set,
          get,
          {
            actionType: "category_merge",
            entityType: "category",
            entityId: destinationId,
            toast: "Categories merged",
            audit: {
              action: "category_merge",
              entityType: "category",
              entityId: destinationId,
              summary: `Merged category into ${destinationId}`,
              metadata: { sourceId, destinationId },
            },
          },
          { plan: result.plan, categoryImportRules },
        );
        return { ok: true };
      },

      moveCategory: (categoryId, groupId, index) => {
        const result = moveCategoryToGroupOp(
          get().plan,
          categoryId,
          groupId,
          index,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_move",
            entityType: "category",
            entityId: categoryId,
            toast: "Category moved",
            audit: {
              action: "category_edit",
              entityType: "category",
              entityId: categoryId,
              summary: "Moved category",
              metadata: { groupId, index },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      reorderCategories: (groupId, orderedIds) => {
        const result = reorderCategoriesOp(get().plan, orderedIds, groupId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_reorder",
            entityType: "category_group",
            entityId: groupId,
            audit: {
              action: "category_edit",
              entityType: "category_group",
              entityId: groupId,
              summary: "Reordered categories",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      addCategoryGroup: (name) => {
        const result = addCategoryGroupOp(get().plan, name);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_add",
            entityType: "category_group",
            entityId: result.entityId,
            toast: "Category group added",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              entityId: result.entityId,
              summary: `Added group ${name.trim()}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true, groupId: result.entityId };
      },

      renameCategoryGroup: (groupId, name) => {
        const result = renameCategoryGroupOp(get().plan, groupId, name);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_edit",
            entityType: "category_group",
            entityId: groupId,
            toast: "Group renamed",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              entityId: groupId,
              summary: `Renamed group to ${name.trim()}`,
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      hideCategoryGroup: (groupId, hidden = true) => {
        const result = hideCategoryGroupOp(get().plan, groupId, hidden);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_edit",
            entityType: "category_group",
            entityId: groupId,
            toast: hidden ? "Group hidden" : "Group shown",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              entityId: groupId,
              summary: hidden ? "Hid group" : "Unhid group",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      deleteCategoryGroup: (groupId) => {
        const result = deleteCategoryGroupSafe(get().plan, groupId);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_delete",
            entityType: "category_group",
            entityId: groupId,
            toast: "Group deleted",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              entityId: groupId,
              summary: "Deleted empty group",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      mergeCategoryGroups: (sourceGroupId, destinationGroupId) => {
        const result = mergeCategoryGroupsOp(
          get().plan,
          sourceGroupId,
          destinationGroupId,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_merge",
            entityType: "category_group",
            entityId: destinationGroupId,
            toast: "Groups merged",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              entityId: destinationGroupId,
              summary: "Merged category groups",
              metadata: { sourceGroupId, destinationGroupId },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      reorderCategoryGroups: (orderedIds) => {
        const result = reorderCategoryGroupsOp(get().plan, orderedIds);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_group_reorder",
            entityType: "category_group",
            audit: {
              action: "category_group_change",
              entityType: "category_group",
              summary: "Reordered category groups",
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkHideCategories: (categoryIds, available) => {
        const result = bulkHideWithImpact(
          get().plan,
          categoryIds,
          get().selectedMonthKey,
          available,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_hide",
            label: "Bulk hide categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Hid ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Hid ${categoryIds.length} categories`,
              metadata: { categoryIds },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkUnhideCategories: (categoryIds) => {
        const result = bulkSetCategoryHiddenOp(get().plan, categoryIds, false);
        if (!result.ok) return;
        commitHistory(
          set,
          get,
          {
            actionType: "category_unhide",
            label: "Bulk unhide categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Unhid ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Unhid ${categoryIds.length} categories`,
              metadata: { categoryIds },
            },
          },
          { plan: result.plan },
        );
      },

      bulkArchiveCategories: (categoryIds, available) => {
        const result = bulkArchiveWithImpact(
          get().plan,
          categoryIds,
          get().selectedMonthKey,
          available,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_archive",
            label: "Bulk archive categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Archived ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Archived ${categoryIds.length} categories`,
              metadata: { categoryIds },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkRestoreCategories: (categoryIds) => {
        const result = bulkRestoreCategoriesOp(get().plan, categoryIds);
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_restore",
            label: "Bulk restore categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Restored ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Restored ${categoryIds.length} categories`,
              metadata: { categoryIds },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkMoveCategories: (categoryIds, groupId) => {
        const result = bulkMoveWithValidation(
          get().plan,
          categoryIds,
          groupId,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_move",
            label: "Bulk move categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Moved ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Moved ${categoryIds.length} categories`,
              metadata: { categoryIds, groupId },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkMergeCategories: (sourceIds, destinationId, available) => {
        const result = bulkMergeCategoriesOp(
          get().plan,
          sourceIds,
          destinationId,
          get().selectedMonthKey,
          available,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType: "category_merge",
            label: "Bulk merge categories",
            batchId: newId("bulk"),
            entityType: "category",
            entityId: destinationId,
            toast: `Merged ${sourceIds.length} categories`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              entityId: destinationId,
              summary: `Merged ${sourceIds.length} categories`,
              metadata: { sourceIds, destinationId },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },

      bulkDeleteCategories: (categoryIds, mode, options) => {
        const result = bulkDeleteCategoriesOp(
          get().plan,
          categoryIds,
          get().selectedMonthKey,
          mode,
          options,
        );
        if (!result.ok) return { ok: false, error: result.error };
        commitHistory(
          set,
          get,
          {
            actionType:
              mode === "archive_unsafe" ? "category_archive" : "category_delete",
            label: "Bulk delete categories",
            batchId: newId("bulk"),
            entityType: "category",
            toast: `Updated ${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
            audit: {
              action: "bulk_action",
              entityType: "category",
              summary: `Bulk delete (${mode})`,
              metadata: { categoryIds, mode, options },
            },
          },
          { plan: result.plan },
        );
        return { ok: true };
      },
    }),
    {
      name: "edf-budget-demo",
      partialize: (state) => ({
        plan: state.plan,
        selectedMonthKey: state.selectedMonthKey,
        sidebarCollapsed: state.sidebarCollapsed,
        importBatches: state.importBatches,
        importRowsByBatch: state.importRowsByBatch,
        backups: state.backups.slice(0, 10),
        auditEvents: state.auditEvents.slice(0, 50),
        mappingPresets: state.mappingPresets,
        payeeAliasRules: state.payeeAliasRules,
        categoryImportRules: state.categoryImportRules,
        importPromptDismissed: state.importPromptDismissed,
        // Persist undo/redo so history survives navigation/refresh
        undoStack: state.undoStack.slice(-15),
        redoStack: state.redoStack.slice(-15),
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.plan) {
          state.plan = migratePlanTargets(
            migratePlanCategories(migratePlanAccounts(state.plan)),
          );
        }
        state?.setHydrated(true);
      },
    },
  ),
);
