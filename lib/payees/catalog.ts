import type {
  Account,
  BudgetPlan,
  Category,
  Payee,
  Transaction,
} from "@/lib/types/budget";
import { isAccountClosed, isAccountHidden } from "@/lib/accounts/lifecycle";

export interface PayeeUsage {
  name: string;
  payeeId?: string;
  lastUsedDate: string;
  transactionCount: number;
  lastCategoryId: string | null;
  lastMemo?: string;
  aliases: string[];
  hidden?: boolean;
  defaultCategoryId?: string;
  defaultMemo?: string;
}

export type PayeePickerOption =
  | {
      kind: "payee";
      id: string;
      payeeId?: string;
      name: string;
      lastUsedDate: string;
      transactionCount: number;
      lastCategoryId: string | null;
      lastCategoryName?: string;
      lastMemo?: string;
      section: "recent" | "all";
    }
  | {
      kind: "transfer";
      id: string;
      accountId: string;
      name: string;
      label: string;
      section: "transfers";
    }
  | {
      kind: "create";
      id: string;
      name: string;
      section: "create";
      nearMatchName?: string;
    };

export function normalizePayeeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function payeeNamesEqual(a: string, b: string): boolean {
  return normalizePayeeName(a).toLowerCase() === normalizePayeeName(b).toLowerCase();
}

/** Build usage stats from transactions + registered payees. */
export function buildPayeeUsage(
  plan: BudgetPlan,
  aliasRules: Record<string, string> = {},
): PayeeUsage[] {
  const byKey = new Map<string, PayeeUsage>();

  for (const p of plan.payees) {
    if (p.hidden) continue;
    const key = p.name.toLowerCase();
    const aliasesFromRules = Object.entries(aliasRules)
      .filter(([, canon]) => payeeNamesEqual(canon, p.name))
      .map(([alias]) => alias);
    byKey.set(key, {
      name: p.name,
      payeeId: p.id,
      lastUsedDate: "",
      transactionCount: 0,
      lastCategoryId: p.defaultCategoryId ?? null,
      aliases: [...new Set([...(p.aliases ?? []), ...aliasesFromRules])],
      defaultCategoryId: p.defaultCategoryId,
      defaultMemo: p.defaultMemo,
      hidden: p.hidden,
    });
  }

  const sortedTxns = [...plan.transactions]
    .filter((t) => !t.isTransfer && t.payeeName.trim())
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  for (const t of sortedTxns) {
    const name = normalizePayeeName(t.payeeName);
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name,
        payeeId: t.payeeId,
        lastUsedDate: t.date,
        transactionCount: 1,
        lastCategoryId: t.categoryId,
        lastMemo: t.memo,
        aliases: [],
      });
    } else {
      existing.transactionCount += 1;
      if (!existing.lastUsedDate || t.date >= existing.lastUsedDate) {
        existing.lastUsedDate = t.date;
        if (t.categoryId) existing.lastCategoryId = t.categoryId;
        if (t.memo) existing.lastMemo = t.memo;
      }
      if (!existing.payeeId && t.payeeId) existing.payeeId = t.payeeId;
    }
  }

  for (const [alias, canon] of Object.entries(aliasRules)) {
    const usage = byKey.get(canon.toLowerCase());
    if (usage && !usage.aliases.some((a) => payeeNamesEqual(a, alias))) {
      usage.aliases.push(alias);
    }
  }

  return [...byKey.values()];
}

export function getRecentPayees(usage: PayeeUsage[], limit = 8): PayeeUsage[] {
  return [...usage]
    .filter((u) => u.lastUsedDate)
    .sort(
      (a, b) =>
        b.lastUsedDate.localeCompare(a.lastUsedDate) ||
        b.transactionCount - a.transactionCount,
    )
    .slice(0, limit);
}

export function getAlphabeticalPayees(usage: PayeeUsage[]): PayeeUsage[] {
  return [...usage].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function getTransferDestinations(
  accounts: Account[],
  currentAccountId: string | undefined,
  options: { includeHidden?: boolean } = {},
): Account[] {
  return accounts
    .filter((a) => {
      if (a.deletedAt) return false;
      if (isAccountClosed(a)) return false;
      if (a.id === currentAccountId) return false;
      if (!options.includeHidden && isAccountHidden(a)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function categoryName(
  categories: Category[],
  categoryId: string | null,
): string | undefined {
  if (!categoryId) return undefined;
  return categories.find((c) => c.id === categoryId)?.name;
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

export function buildPayeePickerOptions(input: {
  plan: BudgetPlan;
  query: string;
  currentAccountId?: string;
  includeHiddenTransfers?: boolean;
  aliasRules?: Record<string, string>;
  recentLimit?: number;
}): PayeePickerOption[] {
  const {
    plan,
    query,
    currentAccountId,
    includeHiddenTransfers = false,
    aliasRules = {},
    recentLimit = 8,
  } = input;
  const q = query.trim();
  const usage = buildPayeeUsage(plan, aliasRules);
  const recent = getRecentPayees(usage, recentLimit);
  const all = getAlphabeticalPayees(usage);
  const options: PayeePickerOption[] = [];

  const recentFiltered = recent.filter(
    (u) =>
      matchesQuery(u.name, q) ||
      u.aliases.some((a) => matchesQuery(a, q)),
  );
  for (const u of recentFiltered) {
    options.push({
      kind: "payee",
      id: `recent:${u.payeeId ?? u.name}`,
      payeeId: u.payeeId,
      name: u.name,
      lastUsedDate: u.lastUsedDate,
      transactionCount: u.transactionCount,
      lastCategoryId: u.lastCategoryId,
      lastCategoryName: categoryName(plan.categories, u.lastCategoryId),
      lastMemo: u.defaultMemo ?? u.lastMemo,
      section: "recent",
    });
  }

  const recentNames = new Set(recentFiltered.map((u) => u.name.toLowerCase()));
  for (const u of all) {
    if (recentNames.has(u.name.toLowerCase())) continue;
    if (
      !matchesQuery(u.name, q) &&
      !u.aliases.some((a) => matchesQuery(a, q))
    ) {
      continue;
    }
    options.push({
      kind: "payee",
      id: `all:${u.payeeId ?? u.name}`,
      payeeId: u.payeeId,
      name: u.name,
      lastUsedDate: u.lastUsedDate,
      transactionCount: u.transactionCount,
      lastCategoryId: u.lastCategoryId,
      lastCategoryName: categoryName(plan.categories, u.lastCategoryId),
      lastMemo: u.defaultMemo ?? u.lastMemo,
      section: "all",
    });
  }

  const transfers = getTransferDestinations(plan.accounts, currentAccountId, {
    includeHidden: includeHiddenTransfers,
  }).filter(
    (a) =>
      matchesQuery(a.name, q) || matchesQuery(`Transfer to ${a.name}`, q),
  );

  for (const a of transfers) {
    options.push({
      kind: "transfer",
      id: `xfer:${a.id}`,
      accountId: a.id,
      name: a.name,
      label: `Transfer to ${a.name}`,
      section: "transfers",
    });
  }

  const normalized = normalizePayeeName(q);
  if (normalized) {
    const exact = usage.find((u) => payeeNamesEqual(u.name, normalized));
    if (!exact) {
      const near = usage.find(
        (u) =>
          u.name.toLowerCase().startsWith(normalized.toLowerCase()) ||
          normalized.toLowerCase().startsWith(u.name.toLowerCase()),
      );
      options.push({
        kind: "create",
        id: `create:${normalized}`,
        name: normalized,
        section: "create",
        nearMatchName: near?.name,
      });
    }
  }

  return options;
}

export function movePayeeActiveIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, current + delta));
}

export function findDuplicatePayee(
  plan: BudgetPlan,
  name: string,
  excludeId?: string,
): Payee | undefined {
  const normalized = normalizePayeeName(name);
  return plan.payees.find(
    (p) =>
      p.id !== excludeId &&
      !p.hidden &&
      payeeNamesEqual(p.name, normalized),
  );
}

/** Ensure payee exists on plan when saving a transaction (no-op if duplicate). */
export function ensurePayeeOnPlan(
  plan: BudgetPlan,
  name: string,
  defaults?: { defaultCategoryId?: string | null },
): BudgetPlan {
  const normalized = normalizePayeeName(name);
  if (!normalized) return plan;
  if (findDuplicatePayee(plan, normalized)) {
    if (defaults?.defaultCategoryId) {
      return {
        ...plan,
        payees: plan.payees.map((p) =>
          payeeNamesEqual(p.name, normalized) && !p.defaultCategoryId
            ? { ...p, defaultCategoryId: defaults.defaultCategoryId! }
            : p,
        ),
      };
    }
    return plan;
  }
  const payee: Payee = {
    id: `payee-${crypto.randomUUID().slice(0, 8)}`,
    name: normalized,
    defaultCategoryId: defaults?.defaultCategoryId ?? undefined,
  };
  return { ...plan, payees: [...plan.payees, payee] };
}

export function highlightPayeeMatch(
  text: string,
  query: string,
): { before: string; match: string; after: string } | null {
  if (!query.trim()) return null;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + query.trim().length),
    after: text.slice(idx + query.trim().length),
  };
}

export function lastUsedCategoryForPayee(
  transactions: Transaction[],
  payeeName: string,
): string | null {
  const sorted = [...transactions]
    .filter(
      (t) =>
        !t.isTransfer &&
        payeeNamesEqual(t.payeeName, payeeName) &&
        t.categoryId,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0]?.categoryId ?? null;
}

/** Prefer suggesting category only when the user has not already chosen one. */
export function suggestCategoryForPayeeSelection(input: {
  currentCategoryId: string | null | undefined;
  categoryTouched: boolean;
  suggestedCategoryId?: string | null;
}): string | null | undefined {
  if (input.categoryTouched) return input.currentCategoryId;
  if (input.currentCategoryId) return input.currentCategoryId;
  return input.suggestedCategoryId ?? input.currentCategoryId;
}
