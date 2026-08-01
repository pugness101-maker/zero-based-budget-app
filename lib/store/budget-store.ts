"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import type {
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
  deleteTransaction: (id: string) => void;
  setCleared: (id: string, cleared: ClearedStatus) => void;
  addTransfer: (input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: Cents;
    date: string;
    memo?: string;
  }) => void;
  addTarget: (input: {
    categoryId: string;
    type: TargetType;
    amountCents: Cents;
    dueDate?: string;
    notes?: string;
  }) => string;
  updateTarget: (id: string, patch: Partial<Target>) => void;
  deleteTarget: (id: string) => void;
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

      setAssigned: (categoryId, assignedCents) =>
        set((s) => {
          const monthKey = s.selectedMonthKey;
          const existing = s.plan.monthlyBudgets.find(
            (b) => b.categoryId === categoryId && b.monthKey === monthKey,
          );
          const monthlyBudgets = existing
            ? s.plan.monthlyBudgets.map((b) =>
                b.categoryId === categoryId && b.monthKey === monthKey
                  ? { ...b, assignedCents }
                  : b,
              )
            : [
                ...s.plan.monthlyBudgets,
                { categoryId, monthKey, assignedCents },
              ];
          return { plan: { ...s.plan, monthlyBudgets } };
        }),

      addTransaction: (input) => {
        const id = newId("txn");
        const txn: Transaction = {
          ...input,
          id,
          approved: input.approved ?? true,
        };
        set((s) => ({
          plan: { ...s.plan, transactions: [txn, ...s.plan.transactions] },
        }));
        return id;
      },

      updateTransaction: (id, patch) =>
        set((s) => ({
          plan: {
            ...s.plan,
            transactions: s.plan.transactions.map((t) =>
              t.id === id ? { ...t, ...patch } : t,
            ),
          },
        })),

      deleteTransaction: (id) =>
        set((s) => {
          const target = s.plan.transactions.find((t) => t.id === id);
          let transactions = s.plan.transactions.filter((t) => t.id !== id);
          if (target?.transferPairId) {
            transactions = transactions.filter(
              (t) => t.id !== target.transferPairId,
            );
          }
          return { plan: { ...s.plan, transactions } };
        }),

      setCleared: (id, cleared) =>
        set((s) => ({
          plan: {
            ...s.plan,
            transactions: s.plan.transactions.map((t) =>
              t.id === id ? { ...t, cleared } : t,
            ),
          },
        })),

      addTransfer: ({ fromAccountId, toAccountId, amountCents, date, memo }) => {
        const transferId = newId("xfer");
        const outId = newId("txn");
        const inId = newId("txn");
        const from = get().plan.accounts.find((a) => a.id === fromAccountId);
        const to = get().plan.accounts.find((a) => a.id === toAccountId);

        const outTxn: Transaction = {
          id: outId,
          accountId: fromAccountId,
          date,
          payeeName: `Transfer to ${to?.name ?? "account"}`,
          categoryId: null,
          memo,
          amountCents: -Math.abs(amountCents),
          cleared: "uncleared",
          approved: true,
          isTransfer: true,
          transferId,
          transferPairId: inId,
        };

        const inTxn: Transaction = {
          id: inId,
          accountId: toAccountId,
          date,
          payeeName: `Transfer from ${from?.name ?? "account"}`,
          categoryId: null,
          memo,
          amountCents: Math.abs(amountCents),
          cleared: "uncleared",
          approved: true,
          isTransfer: true,
          transferId,
          transferPairId: outId,
        };

        set((s) => ({
          plan: {
            ...s.plan,
            transactions: [outTxn, inTxn, ...s.plan.transactions],
          },
        }));
      },

      addTarget: ({ categoryId, type, amountCents, dueDate, notes }) => {
        const id = newId("tgt");
        const target: Target = {
          id,
          categoryId,
          type,
          amountCents,
          dueDate,
          notes,
        };
        set((s) => ({
          plan: { ...s.plan, targets: [...s.plan.targets, target] },
        }));
        return id;
      },

      updateTarget: (id, patch) =>
        set((s) => ({
          plan: {
            ...s.plan,
            targets: s.plan.targets.map((t) =>
              t.id === id ? { ...t, ...patch } : t,
            ),
          },
        })),

      deleteTarget: (id) =>
        set((s) => ({
          plan: {
            ...s.plan,
            targets: s.plan.targets.filter((t) => t.id !== id),
          },
        })),

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

        set((s) => ({
          plan: result.plan,
          importBatches: [
            result.batch,
            ...s.importBatches.filter((b) => b.id !== batch.id),
          ],
          importRowsByBatch: {
            ...s.importRowsByBatch,
            [batch.id]: result.rows,
          },
          importPromptDismissed: true,
          auditEvents: [
            auditEvent({
              action: "import",
              entityType: "import_batch",
              entityId: batch.id,
              summary: `Imported ${result.batch.importedRows} transactions from ${batch.fileName}`,
              metadata: {
                importedRows: result.batch.importedRows,
                duplicateRows: result.batch.duplicateRows,
              },
            }),
            ...s.auditEvents,
          ].slice(0, 100),
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
        set((s) => ({
          plan: result.plan!,
          importBatches: s.importBatches.map((b) =>
            b.id === batchId ? result.batch! : b,
          ),
          auditEvents: [
            auditEvent({
              action: "import_reverse",
              entityType: "import_batch",
              entityId: batchId,
              summary: `Reversed import ${batch.fileName}`,
            }),
            ...s.auditEvents,
          ].slice(0, 100),
        }));
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
        });
      },

      setHydrated: (value) => set({ hydrated: value }),
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
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
