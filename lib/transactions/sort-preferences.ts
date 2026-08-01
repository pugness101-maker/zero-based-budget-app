import type { UserPreferences } from "@/lib/types/budget";
import type {
  SortCriterion,
  SortDirection,
  TransactionSortField,
} from "@/lib/transactions/sort";
import {
  DEFAULT_ACCOUNT_REGISTER_SORT,
  DEFAULT_ALL_TRANSACTIONS_SORT,
} from "@/lib/transactions/sort";

const KNOWN_FIELDS = new Set<TransactionSortField>([
  "date",
  "account",
  "payee",
  "category",
  "amount",
  "outflow",
  "inflow",
  "cleared",
  "createdAt",
  "updatedAt",
  "runningBalance",
]);

function normalizeCriteria(
  raw: Array<{ field: string; direction: "asc" | "desc" }> | undefined,
): SortCriterion[] | undefined {
  if (!raw?.length) return undefined;
  const next: SortCriterion[] = [];
  for (const item of raw) {
    if (!KNOWN_FIELDS.has(item.field as TransactionSortField)) continue;
    if (item.direction !== "asc" && item.direction !== "desc") continue;
    next.push({
      field: item.field as TransactionSortField,
      direction: item.direction as SortDirection,
    });
  }
  return next.length ? next : undefined;
}

export type SortPreferenceScope =
  | "allTransactions"
  | "importPreview"
  | "scheduled"
  | { accountId: string };

export interface TransactionSortPreferences {
  allTransactions?: SortCriterion[];
  /** Per-account register sorts */
  accountRegisters?: Record<string, SortCriterion[]>;
  importPreview?: SortCriterion[];
  scheduled?: SortCriterion[];
}

export function getSortPreferences(
  preferences: UserPreferences,
): TransactionSortPreferences {
  const raw = preferences.transactionSort;
  if (!raw) return {};
  return {
    allTransactions: normalizeCriteria(raw.allTransactions),
    accountRegisters: raw.accountRegisters
      ? Object.fromEntries(
          Object.entries(raw.accountRegisters).flatMap(([id, criteria]) => {
            const normalized = normalizeCriteria(criteria);
            return normalized ? [[id, normalized] as const] : [];
          }),
        )
      : undefined,
    importPreview: normalizeCriteria(raw.importPreview),
    scheduled: normalizeCriteria(raw.scheduled),
  };
}

export function getSortCriteriaForScope(
  preferences: UserPreferences,
  scope: SortPreferenceScope,
): SortCriterion[] {
  const prefs = getSortPreferences(preferences);
  if (scope === "allTransactions") {
    return (
      normalizeCriteria(prefs.allTransactions) ?? [
        ...DEFAULT_ALL_TRANSACTIONS_SORT,
      ]
    );
  }
  if (scope === "importPreview") {
    return (
      normalizeCriteria(prefs.importPreview) ?? [
        ...DEFAULT_ALL_TRANSACTIONS_SORT,
      ]
    );
  }
  if (scope === "scheduled") {
    return (
      normalizeCriteria(prefs.scheduled) ?? [...DEFAULT_ALL_TRANSACTIONS_SORT]
    );
  }
  const saved = normalizeCriteria(prefs.accountRegisters?.[scope.accountId]);
  return saved ?? [...DEFAULT_ACCOUNT_REGISTER_SORT];
}

export function withUpdatedSortPreferences(
  preferences: UserPreferences,
  scope: SortPreferenceScope,
  criteria: SortCriterion[] | null,
): UserPreferences {
  const current = { ...(preferences.transactionSort ?? {}) };
  if (scope === "allTransactions") {
    current.allTransactions = criteria ?? undefined;
  } else if (scope === "importPreview") {
    current.importPreview = criteria ?? undefined;
  } else if (scope === "scheduled") {
    current.scheduled = criteria ?? undefined;
  } else {
    const registers = { ...(current.accountRegisters ?? {}) };
    if (!criteria || criteria.length === 0) {
      delete registers[scope.accountId];
    } else {
      registers[scope.accountId] = criteria;
    }
    current.accountRegisters = registers;
  }
  return {
    ...preferences,
    transactionSort: current,
  };
}

export function resetSortPreferences(
  preferences: UserPreferences,
  scope?: SortPreferenceScope,
): UserPreferences {
  if (!scope) {
    return { ...preferences, transactionSort: undefined };
  }
  return withUpdatedSortPreferences(preferences, scope, null);
}
