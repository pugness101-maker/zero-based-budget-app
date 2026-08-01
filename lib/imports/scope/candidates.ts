import { subDays } from "date-fns";
import { toISODate } from "@/lib/dates";
import { normalizeCategoryName } from "@/lib/imports/map-categories";
import { resolveCategoryNames } from "@/lib/imports/ynab/preview";
import { suggestAccountType } from "@/lib/imports/ynab/suggest-account-type";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { BudgetPlan } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type {
  ScopeAccountCandidate,
  ScopeCategoryCandidate,
  ScopeCategoryGroupCandidate,
} from "@/lib/imports/scope/types";

export function categoryKey(groupName: string, categoryName: string): string {
  return `${normalizeCategoryName(groupName)}::${normalizeCategoryName(categoryName)}`;
}

export function buildScopeAccountCandidates(input: {
  registerRows: YnabRegisterRow[];
  plan: BudgetPlan;
  now?: Date;
}): ScopeAccountCandidate[] {
  const now = input.now ?? new Date();
  const currentYear = String(now.getFullYear());
  const activeCutoff = toISODate(subDays(now, 90));

  const names = new Set<string>();
  for (const row of input.registerRows) {
    if (row.accountName) names.add(row.accountName);
    if (row.transferTargetAccount) names.add(row.transferTargetAccount);
  }

  const byName = new Map<
    string,
    {
      count: number;
      earliest?: string;
      latest?: string;
      net: number;
    }
  >();

  for (const name of names) {
    byName.set(name, { count: 0, net: 0 });
  }

  for (const row of input.registerRows) {
    if (!row.accountName) continue;
    const entry = byName.get(row.accountName)!;
    entry.count += 1;
    if (row.date) {
      if (!entry.earliest || row.date < entry.earliest) entry.earliest = row.date;
      if (!entry.latest || row.date > entry.latest) entry.latest = row.date;
    }
    if (row.amountCents != null) entry.net += row.amountCents;
  }

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((accountName) => {
      const suggestion = suggestAccountType(accountName);
      const stats = byName.get(accountName)!;
      const existing = input.plan.accounts.find(
        (a) =>
          !a.deletedAt &&
          normalizeCategoryName(a.name) === normalizeCategoryName(accountName),
      );
      const hasCurrentYearActivity = Boolean(
        stats.latest?.startsWith(currentYear) ||
          stats.earliest?.startsWith(currentYear),
      );
      return {
        accountName,
        suggestedType: suggestion.suggestedType,
        suggestedKind: suggestion.suggestedKind,
        transactionCount: stats.count,
        earliestDate: stats.earliest,
        latestDate: stats.latest,
        netEffectCents: stats.net as Cents,
        existingAccountId: existing?.id,
        existingAccountName: existing?.name,
        hasCurrentYearActivity,
        appearsActive: Boolean(stats.latest && stats.latest >= activeCutoff),
      };
    });
}

export function buildScopeCategoryCandidates(input: {
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  plan: BudgetPlan;
}): ScopeCategoryCandidate[] {
  const map = new Map<
    string,
    {
      groupName: string;
      categoryName: string;
      txnCount: number;
      planCount: number;
      earliest?: string;
      latest?: string;
      assigned: number;
      activity: number;
      available: number;
    }
  >();

  function touch(
    groupName: string,
    categoryName: string,
    patch: Partial<{
      txn: number;
      plan: number;
      date?: string;
      assigned?: number;
      activity?: number;
      available?: number;
    }>,
  ) {
    const key = categoryKey(groupName, categoryName);
    const cur = map.get(key) ?? {
      groupName,
      categoryName,
      txnCount: 0,
      planCount: 0,
      assigned: 0,
      activity: 0,
      available: 0,
    };
    if (patch.txn) cur.txnCount += patch.txn;
    if (patch.plan) cur.planCount += patch.plan;
    if (patch.date) {
      if (!cur.earliest || patch.date < cur.earliest) cur.earliest = patch.date;
      if (!cur.latest || patch.date > cur.latest) cur.latest = patch.date;
    }
    if (patch.assigned) cur.assigned += patch.assigned;
    if (patch.activity) cur.activity += patch.activity;
    if (patch.available) cur.available += patch.available;
    map.set(key, cur);
  }

  for (const row of input.registerRows) {
    const resolved = resolveCategoryNames(row);
    if (!resolved) continue;
    touch(resolved.groupName, resolved.categoryName, {
      txn: 1,
      date: row.date ?? undefined,
    });
  }

  for (const row of input.planRows) {
    const resolved = resolveCategoryNames(row);
    if (!resolved) continue;
    touch(resolved.groupName, resolved.categoryName, {
      plan: 1,
      date: row.monthKey ? `${row.monthKey}-01` : undefined,
      assigned: row.assignedCents ?? 0,
      activity: row.activityCents ?? 0,
      available: row.availableCents ?? 0,
    });
  }

  return [...map.entries()]
    .map(([key, v]) => {
      const existing = input.plan.categories.find((c) => {
        if (c.deletedAt) return false;
        const group = input.plan.categoryGroups.find((g) => g.id === c.groupId);
        return (
          categoryKey(group?.name ?? "", c.name) === key ||
          normalizeCategoryName(c.name) === normalizeCategoryName(v.categoryName)
        );
      });
      return {
        key,
        groupName: v.groupName,
        categoryName: v.categoryName,
        transactionCount: v.txnCount,
        planRowCount: v.planCount,
        earliestDate: v.earliest,
        latestDate: v.latest,
        assignedCents: v.assigned as Cents,
        activityCents: v.activity as Cents,
        availableCents: v.available as Cents,
        existingCategoryId: existing?.id,
        existingCategoryName: existing?.name,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function groupScopeCategories(
  categories: ScopeCategoryCandidate[],
): ScopeCategoryGroupCandidate[] {
  const groups = new Map<string, ScopeCategoryCandidate[]>();
  for (const c of categories) {
    const list = groups.get(c.groupName) ?? [];
    list.push(c);
    groups.set(c.groupName, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupName, cats]) => ({
      groupName,
      categories: cats,
      transactionCount: cats.reduce((s, c) => s + c.transactionCount, 0),
      planRowCount: cats.reduce((s, c) => s + c.planRowCount, 0),
    }));
}

/** Categories used by rows belonging to the given account names. */
export function categoryKeysUsedByAccounts(
  registerRows: YnabRegisterRow[],
  accountNames: Set<string>,
): string[] {
  const keys = new Set<string>();
  const normalized = new Set(
    [...accountNames].map((n) => normalizeCategoryName(n)),
  );
  for (const row of registerRows) {
    if (!normalized.has(normalizeCategoryName(row.accountName))) continue;
    const resolved = resolveCategoryNames(row);
    if (resolved) {
      keys.add(categoryKey(resolved.groupName, resolved.categoryName));
    }
  }
  return [...keys];
}
