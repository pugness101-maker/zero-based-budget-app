import {
  createBlankPlan,
  createBlankPlanWithTemplate,
  defaultPreferences,
} from "@/lib/seed/blank-plan";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import type { BudgetPlan } from "@/lib/types/budget";
import type { AuditEvent, ImportBatch, ImportRow } from "@/lib/types/import";

export type ClearDataScope =
  | "all"
  | "transactions"
  | "accounts_and_history"
  | "categories_and_groups"
  | "goals"
  | "scheduled"
  | "payees_and_rules"
  | "import_history"
  | "audit_history"
  | "preferences_only"
  | "demo_data_only";

export type AfterClearChoice =
  | "blank"
  | "simplified_template"
  | "demo"
  | "import_backup";

export const CLEAR_SCOPE_OPTIONS: Array<{
  id: ClearDataScope;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All app data",
    description:
      "Accounts, transactions, categories, goals, payees, imports, audit, and preferences.",
  },
  {
    id: "transactions",
    label: "Transactions only",
    description:
      "Transactions, splits, transfers, and scheduled transactions. Accounts and categories stay.",
  },
  {
    id: "accounts_and_history",
    label: "Accounts and account history",
    description:
      "Accounts and account-linked records (transactions, goals, scheduled). Categories stay.",
  },
  {
    id: "categories_and_groups",
    label: "Categories and category groups",
    description:
      "Categories, groups, and budgets. Transaction category links are cleared (no orphans).",
  },
  {
    id: "goals",
    label: "Goals",
    description: "Remove goals only. Categories and accounts stay.",
  },
  {
    id: "scheduled",
    label: "Scheduled transactions",
    description: "Remove scheduled transactions only.",
  },
  {
    id: "payees_and_rules",
    label: "Payees and rules",
    description: "Payees plus payee/category import alias rules.",
  },
  {
    id: "import_history",
    label: "Import history",
    description: "Import batches and cached import rows.",
  },
  {
    id: "audit_history",
    label: "Audit history",
    description: "Clear the local audit log (a new clear event is recorded after).",
  },
  {
    id: "preferences_only",
    label: "User preferences only",
    description:
      "Reset layout, filters, sorting, hidden states, and appearance. Keep financial data.",
  },
  {
    id: "demo_data_only",
    label: "Demo data only",
    description:
      "Replace the current plan with a blank budget (same as clearing seed demo contents).",
  },
];

export interface ClearDataCounts {
  accounts: number;
  transactions: number;
  categories: number;
  categoryGroups: number;
  goals: number;
  scheduled: number;
  payees: number;
  monthlyBudgets: number;
  importBatches: number;
  auditEvents: number;
}

export interface ClearDataStateSlice {
  plan: BudgetPlan;
  importBatches: ImportBatch[];
  importRowsByBatch: Record<string, ImportRow[]>;
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
  auditEvents: AuditEvent[];
  importPromptDismissed: boolean;
  selectedMonthKey: string;
  selectedCategoryId: string | null;
  undoStack: unknown[];
  redoStack: unknown[];
}

export function countClearableRecords(input: {
  plan: BudgetPlan;
  importBatches: ImportBatch[];
  auditEvents: AuditEvent[];
}): ClearDataCounts {
  const { plan, importBatches, auditEvents } = input;
  return {
    accounts: plan.accounts.filter((a) => !a.deletedAt).length,
    transactions: plan.transactions.length,
    categories: plan.categories.filter((c) => !c.deletedAt).length,
    categoryGroups: plan.categoryGroups.filter((g) => !g.deletedAt).length,
    goals: plan.targets.length,
    scheduled: plan.scheduledTransactions?.length ?? 0,
    payees: plan.payees.filter((p) => !p.hidden).length,
    monthlyBudgets: plan.monthlyBudgets.length,
    importBatches: importBatches.length,
    auditEvents: auditEvents.length,
  };
}

export interface ClearDataResult {
  ok: true;
  plan: BudgetPlan;
  importBatches: ImportBatch[];
  importRowsByBatch: Record<string, ImportRow[]>;
  payeeAliasRules: Record<string, string>;
  categoryImportRules: Record<string, string>;
  auditEvents: AuditEvent[];
  importPromptDismissed: boolean;
  selectedMonthKey: string;
  selectedCategoryId: null;
  undoStack: [];
  redoStack: [];
  sectionsCleared: ClearDataScope[];
  countsBefore: ClearDataCounts;
}

function stripTransactionCategoryLinks(plan: BudgetPlan): BudgetPlan {
  return {
    ...plan,
    transactions: plan.transactions.map((t) => ({
      ...t,
      categoryId: null,
      splits: t.splits?.map((s) => ({ ...s, categoryId: null })),
    })),
    scheduledTransactions: (plan.scheduledTransactions ?? []).map((s) => ({
      ...s,
      categoryId: null,
    })),
    payees: plan.payees.map((p) => ({
      ...p,
      defaultCategoryId: undefined,
    })),
    targets: plan.targets.map((t) =>
      t.linkType === "category"
        ? { ...t, categoryId: null, paused: true }
        : t,
    ),
  };
}

/**
 * Apply a clear scope. Pure function — store wraps with backup/audit/undo.
 */
export function applyClearData(
  state: ClearDataStateSlice,
  scope: ClearDataScope,
  after: AfterClearChoice,
): ClearDataResult {
  const countsBefore = countClearableRecords({
    plan: state.plan,
    importBatches: state.importBatches,
    auditEvents: state.auditEvents,
  });

  let plan = structuredClone(state.plan);
  const importBatches = [...state.importBatches];
  const importRowsByBatch = { ...state.importRowsByBatch };
  const payeeAliasRules = { ...state.payeeAliasRules };
  let categoryImportRules = { ...state.categoryImportRules };
  const auditEvents = [...state.auditEvents];
  const importPromptDismissed = state.importPromptDismissed;

  const finish = (
    nextPlan: BudgetPlan,
    extras: Partial<
      Pick<
        ClearDataResult,
        | "importBatches"
        | "importRowsByBatch"
        | "payeeAliasRules"
        | "categoryImportRules"
        | "auditEvents"
        | "importPromptDismissed"
      >
    > = {},
  ): ClearDataResult => ({
    ok: true,
    plan: nextPlan,
    importBatches: extras.importBatches ?? importBatches,
    importRowsByBatch: extras.importRowsByBatch ?? importRowsByBatch,
    payeeAliasRules: extras.payeeAliasRules ?? payeeAliasRules,
    categoryImportRules: extras.categoryImportRules ?? categoryImportRules,
    auditEvents: extras.auditEvents ?? auditEvents,
    importPromptDismissed:
      extras.importPromptDismissed ?? importPromptDismissed,
    selectedMonthKey: nextPlan.workingMonthKey,
    selectedCategoryId: null,
    undoStack: [],
    redoStack: [],
    sectionsCleared: [scope],
    countsBefore,
  });

  if (scope === "all" || scope === "demo_data_only") {
    let next: BudgetPlan;
    if (after === "demo") next = createDemoPlan();
    else if (after === "simplified_template") next = createBlankPlanWithTemplate();
    else next = createBlankPlan(); // blank or import_backup (user imports next)

    return finish(next, {
      importBatches: [],
      importRowsByBatch: {},
      payeeAliasRules: {},
      categoryImportRules: {},
      auditEvents: scope === "all" ? [] : auditEvents,
      importPromptDismissed: false,
    });
  }

  if (scope === "transactions") {
    plan = {
      ...plan,
      transactions: [],
      scheduledTransactions: [],
    };
    return finish(plan);
  }

  if (scope === "accounts_and_history") {
    plan = {
      ...plan,
      accounts: [],
      transactions: [],
      scheduledTransactions: [],
      targets: plan.targets.filter((t) => t.linkType !== "account"),
    };
    return finish(plan);
  }

  if (scope === "categories_and_groups") {
    plan = stripTransactionCategoryLinks({
      ...plan,
      categories: [],
      categoryGroups: [],
      monthlyBudgets: [],
      targets: plan.targets.filter((t) => t.linkType !== "category"),
    });
    categoryImportRules = {};
    return finish(plan, { categoryImportRules });
  }

  if (scope === "goals") {
    plan = { ...plan, targets: [] };
    return finish(plan);
  }

  if (scope === "scheduled") {
    plan = { ...plan, scheduledTransactions: [] };
    return finish(plan);
  }

  if (scope === "payees_and_rules") {
    plan = { ...plan, payees: [] };
    return finish(plan, {
      payeeAliasRules: {},
      categoryImportRules: {},
    });
  }

  if (scope === "import_history") {
    return finish(plan, {
      importBatches: [],
      importRowsByBatch: {},
      importPromptDismissed: false,
    });
  }

  if (scope === "audit_history") {
    return finish(plan, { auditEvents: [] });
  }

  if (scope === "preferences_only") {
    plan = {
      ...plan,
      preferences: defaultPreferences({
        currency: plan.currency,
        timezone: plan.preferences.timezone,
      }),
      // Clear hidden/closed visual flags on entities? Spec: reset hidden states
      accounts: plan.accounts.map((a) => ({
        ...a,
        isHidden: false,
      })),
      categories: plan.categories.map((c) => ({
        ...c,
        hidden: false,
      })),
      categoryGroups: plan.categoryGroups.map((g) => ({
        ...g,
        hidden: false,
        collapsed: g.name === "Hidden" ? true : false,
      })),
    };
    return finish(plan);
  }

  return finish(plan);
}

/** Detect orphaned category / account references after a clear. */
export function findOrphanedClearReferences(plan: BudgetPlan): string[] {
  const accountIds = new Set(plan.accounts.map((a) => a.id));
  const categoryIds = new Set(plan.categories.map((c) => c.id));
  const issues: string[] = [];

  for (const t of plan.transactions) {
    if (!accountIds.has(t.accountId)) {
      issues.push(`txn:${t.id}:missing_account`);
    }
    if (t.categoryId && !categoryIds.has(t.categoryId)) {
      issues.push(`txn:${t.id}:orphan_category`);
    }
    for (const s of t.splits ?? []) {
      if (s.categoryId && !categoryIds.has(s.categoryId)) {
        issues.push(`split:${s.id ?? t.id}:orphan_category`);
      }
    }
  }
  for (const g of plan.targets) {
    if (g.linkType === "account" && g.accountId && !accountIds.has(g.accountId)) {
      issues.push(`goal:${g.id}:missing_account`);
    }
    if (
      g.linkType === "category" &&
      g.categoryId &&
      !categoryIds.has(g.categoryId)
    ) {
      issues.push(`goal:${g.id}:orphan_category`);
    }
  }
  return issues;
}
