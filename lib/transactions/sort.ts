import type {
  Account,
  Category,
  ClearedStatus,
  Transaction,
} from "@/lib/types/budget";

export type TransactionSortField =
  | "date"
  | "account"
  | "payee"
  | "category"
  | "amount"
  | "outflow"
  | "inflow"
  | "cleared"
  | "createdAt"
  | "updatedAt"
  | "runningBalance";

export type SortDirection = "asc" | "desc";

export interface SortCriterion {
  field: TransactionSortField;
  direction: SortDirection;
}

export type TransactionSortPreset =
  | "newest"
  | "oldest"
  | "highest_amount"
  | "lowest_amount"
  | "largest_outflow"
  | "largest_inflow"
  | "account_az"
  | "account_za"
  | "payee_az"
  | "payee_za"
  | "category_az"
  | "category_za"
  | "cleared_first"
  | "uncleared_first"
  | "recently_added"
  | "recently_edited";

export interface SortContext {
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  /** Chronological running balance by transaction id (register only). */
  runningBalances?: Map<string, number>;
}

export const DEFAULT_ALL_TRANSACTIONS_SORT: SortCriterion[] = [
  { field: "date", direction: "desc" },
];

export const DEFAULT_ACCOUNT_REGISTER_SORT: SortCriterion[] = [
  { field: "date", direction: "desc" },
];

export const SORT_PRESET_OPTIONS: {
  id: TransactionSortPreset;
  label: string;
  criteria: SortCriterion[];
}[] = [
  {
    id: "newest",
    label: "Newest first",
    criteria: [{ field: "date", direction: "desc" }],
  },
  {
    id: "oldest",
    label: "Oldest first",
    criteria: [{ field: "date", direction: "asc" }],
  },
  {
    id: "highest_amount",
    label: "Highest amount",
    criteria: [{ field: "amount", direction: "desc" }],
  },
  {
    id: "lowest_amount",
    label: "Lowest amount",
    criteria: [{ field: "amount", direction: "asc" }],
  },
  {
    id: "largest_outflow",
    label: "Largest outflow",
    criteria: [{ field: "outflow", direction: "desc" }],
  },
  {
    id: "largest_inflow",
    label: "Largest inflow",
    criteria: [{ field: "inflow", direction: "desc" }],
  },
  {
    id: "account_az",
    label: "Account A–Z",
    criteria: [{ field: "account", direction: "asc" }],
  },
  {
    id: "account_za",
    label: "Account Z–A",
    criteria: [{ field: "account", direction: "desc" }],
  },
  {
    id: "payee_az",
    label: "Payee A–Z",
    criteria: [{ field: "payee", direction: "asc" }],
  },
  {
    id: "payee_za",
    label: "Payee Z–A",
    criteria: [{ field: "payee", direction: "desc" }],
  },
  {
    id: "category_az",
    label: "Category A–Z",
    criteria: [{ field: "category", direction: "asc" }],
  },
  {
    id: "category_za",
    label: "Category Z–A",
    criteria: [{ field: "category", direction: "desc" }],
  },
  {
    id: "cleared_first",
    label: "Cleared first",
    criteria: [{ field: "cleared", direction: "desc" }],
  },
  {
    id: "uncleared_first",
    label: "Uncleared first",
    criteria: [{ field: "cleared", direction: "asc" }],
  },
  {
    id: "recently_added",
    label: "Recently added",
    criteria: [{ field: "createdAt", direction: "desc" }],
  },
  {
    id: "recently_edited",
    label: "Recently edited",
    criteria: [{ field: "updatedAt", direction: "desc" }],
  },
];

const CLEARED_RANK: Record<ClearedStatus, number> = {
  uncleared: 0,
  cleared: 1,
  reconciled: 2,
};

const FIELD_LABELS: Record<TransactionSortField, string> = {
  date: "date",
  account: "account",
  payee: "payee",
  category: "category",
  amount: "amount",
  outflow: "outflow",
  inflow: "inflow",
  cleared: "cleared status",
  createdAt: "created date",
  updatedAt: "last edited date",
  runningBalance: "running balance",
};

export function buildSortContext(
  accounts: Account[],
  categories: Category[],
  runningBalances?: Map<string, number>,
): SortContext {
  return {
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    runningBalances,
  };
}

/** Normalized sortable timestamp from posted/scheduled date + optional time. */
export function transactionDateTimestamp(txn: Transaction): number {
  const base = Date.parse(`${txn.date}T12:00:00.000Z`);
  if (Number.isNaN(base)) return 0;
  // Prefer precise timestamps when available (same calendar day).
  if (txn.updatedAt) {
    const u = Date.parse(txn.updatedAt);
    if (!Number.isNaN(u) && txn.updatedAt.startsWith(txn.date)) return u;
  }
  if (txn.createdAt) {
    const c = Date.parse(txn.createdAt);
    if (!Number.isNaN(c) && txn.createdAt.startsWith(txn.date)) return c;
  }
  return base;
}

function timestampOrZero(value?: string): number {
  if (!value) return 0;
  const n = Date.parse(value);
  return Number.isNaN(n) ? 0 : n;
}

function categoryLabel(
  txn: Transaction,
  ctx: SortContext,
): string {
  if (txn.isTransfer) return "Transfer";
  if (!txn.categoryId) {
    return txn.amountCents > 0 ? "Ready to Assign" : "";
  }
  return ctx.categoriesById.get(txn.categoryId)?.name ?? "";
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  // Nulls (e.g. no outflow) sort after real values.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function fieldCompare(
  a: Transaction,
  b: Transaction,
  field: TransactionSortField,
  direction: SortDirection,
  ctx: SortContext,
): number {
  const dir = direction === "asc" ? 1 : -1;

  switch (field) {
    case "date": {
      const diff = transactionDateTimestamp(a) - transactionDateTimestamp(b);
      return diff * dir;
    }
    case "account": {
      const an = ctx.accountsById.get(a.accountId)?.name ?? "";
      const bn = ctx.accountsById.get(b.accountId)?.name ?? "";
      return compareStrings(an, bn) * dir;
    }
    case "payee":
      return compareStrings(a.payeeName, b.payeeName) * dir;
    case "category":
      return (
        compareStrings(categoryLabel(a, ctx), categoryLabel(b, ctx)) * dir
      );
    case "amount":
      return (a.amountCents - b.amountCents) * dir;
    case "outflow": {
      const ao = a.amountCents < 0 ? Math.abs(a.amountCents) : null;
      const bo = b.amountCents < 0 ? Math.abs(b.amountCents) : null;
      return compareNullableNumber(ao, bo, direction);
    }
    case "inflow": {
      const ai = a.amountCents > 0 ? a.amountCents : null;
      const bi = b.amountCents > 0 ? b.amountCents : null;
      return compareNullableNumber(ai, bi, direction);
    }
    case "cleared":
      return (CLEARED_RANK[a.cleared] - CLEARED_RANK[b.cleared]) * dir;
    case "createdAt":
      return (
        (timestampOrZero(a.createdAt) - timestampOrZero(b.createdAt)) * dir
      );
    case "updatedAt":
      return (
        (timestampOrZero(a.updatedAt) - timestampOrZero(b.updatedAt)) * dir
      );
    case "runningBalance": {
      const ar = ctx.runningBalances?.get(a.id) ?? 0;
      const br = ctx.runningBalances?.get(b.id) ?? 0;
      return (ar - br) * dir;
    }
    default:
      return 0;
  }
}

/** Stable tie-break: date timestamp → createdAt → id. */
export function compareStableTieBreak(a: Transaction, b: Transaction): number {
  const dateDiff = transactionDateTimestamp(b) - transactionDateTimestamp(a);
  if (dateDiff !== 0) return dateDiff;
  const createdDiff =
    timestampOrZero(b.createdAt) - timestampOrZero(a.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return b.id.localeCompare(a.id);
}

/**
 * Sort transactions by criteria. Empty criteria uses default newest-first
 * with stable same-date ordering.
 */
export function sortTransactions(
  transactions: Transaction[],
  criteria: SortCriterion[] | undefined,
  ctx: SortContext,
  defaultCriteria: SortCriterion[] = DEFAULT_ALL_TRANSACTIONS_SORT,
): Transaction[] {
  const active =
    criteria && criteria.length > 0 ? criteria : defaultCriteria;
  const copy = [...transactions];
  copy.sort((a, b) => {
    for (const c of active) {
      const cmp = fieldCompare(a, b, c.field, c.direction, ctx);
      if (cmp !== 0) return cmp;
    }
    return compareStableTieBreak(a, b);
  });
  return copy;
}

/** Sort the full list, then slice for pagination. */
export function sortThenPaginate(
  transactions: Transaction[],
  criteria: SortCriterion[] | undefined,
  ctx: SortContext,
  page: number,
  pageSize: number,
  defaultCriteria?: SortCriterion[],
): { rows: Transaction[]; total: number; pageCount: number } {
  const sorted = sortTransactions(
    transactions,
    criteria,
    ctx,
    defaultCriteria,
  );
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * pageSize;
  return {
    rows: sorted.slice(start, start + pageSize),
    total,
    pageCount,
  };
}

export function criteriaEqual(
  a: SortCriterion[] | undefined,
  b: SortCriterion[] | undefined,
): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every(
    (c, i) => c.field === bb[i]!.field && c.direction === bb[i]!.direction,
  );
}

export function isDefaultSort(
  criteria: SortCriterion[] | undefined,
  defaultCriteria: SortCriterion[],
): boolean {
  return !criteria || criteria.length === 0 || criteriaEqual(criteria, defaultCriteria);
}

/**
 * Cycle a column: unsorted→asc→desc→unsorted (default).
 * With shiftKey, multi-column: add/update without clearing others.
 */
export function cycleSortCriteria(
  current: SortCriterion[],
  field: TransactionSortField,
  options: { shiftKey?: boolean; defaultCriteria: SortCriterion[] } ,
): SortCriterion[] {
  const { shiftKey = false, defaultCriteria } = options;
  const active = current.length ? current : [];

  if (!shiftKey) {
    const existing = active.length === 1 ? active[0] : undefined;
    if (!existing || existing.field !== field) {
      return [{ field, direction: "asc" }];
    }
    if (existing.direction === "asc") {
      return [{ field, direction: "desc" }];
    }
    // Third click → default
    return [...defaultCriteria];
  }

  // Multi-column: Shift+click
  const idx = active.findIndex((c) => c.field === field);
  if (idx === -1) {
    return [...active, { field, direction: "asc" }];
  }
  const item = active[idx]!;
  if (item.direction === "asc") {
    return active.map((c, i) =>
      i === idx ? { field, direction: "desc" } : c,
    );
  }
  // Remove this criterion
  const next = active.filter((_, i) => i !== idx);
  return next.length ? next : [...defaultCriteria];
}

export function sortDirectionForField(
  criteria: SortCriterion[],
  field: TransactionSortField,
): SortDirection | null {
  const found = criteria.find((c) => c.field === field);
  return found?.direction ?? null;
}

export function sortPriorityForField(
  criteria: SortCriterion[],
  field: TransactionSortField,
): number | null {
  const idx = criteria.findIndex((c) => c.field === field);
  return idx === -1 ? null : idx + 1;
}

export function sortAriaLabel(
  field: TransactionSortField,
  direction: SortDirection | null,
): string {
  const name = FIELD_LABELS[field];
  if (direction === "asc") return `Sort by ${name} ascending`;
  if (direction === "desc") return `Sort by ${name} descending`;
  return `Clear ${name} sorting`;
}

export function describeSortCriteria(criteria: SortCriterion[]): string {
  if (!criteria.length) return "Newest first";
  return criteria
    .map((c) => {
      const name = FIELD_LABELS[c.field];
      const dir =
        c.field === "date" ||
        c.field === "createdAt" ||
        c.field === "updatedAt"
          ? c.direction === "desc"
            ? "newest"
            : "oldest"
          : c.direction === "asc"
            ? "A–Z / low→high"
            : "Z–A / high→low";
      return `${name} (${dir})`;
    })
    .join(", then ");
}

export function presetFromCriteria(
  criteria: SortCriterion[],
): TransactionSortPreset | null {
  for (const preset of SORT_PRESET_OPTIONS) {
    if (criteriaEqual(criteria, preset.criteria)) return preset.id;
  }
  return null;
}

export function criteriaFromPreset(
  preset: TransactionSortPreset,
): SortCriterion[] {
  return (
    SORT_PRESET_OPTIONS.find((p) => p.id === preset)?.criteria ??
    DEFAULT_ALL_TRANSACTIONS_SORT
  );
}
