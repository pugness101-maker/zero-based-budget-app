import type { YnabRegisterRow } from "@/lib/imports/ynab/parse-register";
import type { YnabPlanRow } from "@/lib/imports/ynab/parse-plan";
import {
  suggestAccountType,
  type AccountTypeSuggestion,
} from "@/lib/imports/ynab/suggest-account-type";
import { normalizeCategoryName } from "@/lib/imports/map-categories";
import type { Cents } from "@/lib/money";

export interface YnabCategoryCandidate {
  groupName: string;
  categoryName: string;
  key: string;
}

export interface YnabZipPreviewSummary {
  registerRowCount: number;
  planRowCount: number;
  accounts: AccountTypeSuggestion[];
  categoryGroups: string[];
  categories: YnabCategoryCandidate[];
  earliestDate?: string;
  latestDate?: string;
  historicalRowCount: number;
  futureScheduledRowCount: number;
  clearedCount: number;
  unclearedCount: number;
  reconciledCount: number;
  duplicateRowCount: number;
  invalidRowCount: number;
  transferRowCount: number;
  balanceEffectByAccount: Array<{ accountName: string; effectCents: Cents }>;
  registerFileName?: string;
  planFileName?: string;
}

function resolveCategoryNames(row: {
  categoryGroup?: string;
  category?: string;
  categoryGroupCategory?: string;
}): { groupName: string; categoryName: string } | null {
  if (row.categoryGroup && row.category) {
    return { groupName: row.categoryGroup, categoryName: row.category };
  }
  if (row.categoryGroupCategory) {
    const parts = row.categoryGroupCategory.split(":");
    if (parts.length >= 2) {
      return {
        groupName: parts[0]!.trim(),
        categoryName: parts.slice(1).join(":").trim(),
      };
    }
    return { groupName: "Imported", categoryName: row.categoryGroupCategory };
  }
  if (row.category) {
    return { groupName: "Imported", categoryName: row.category };
  }
  return null;
}

export function buildYnabZipPreview(input: {
  registerRows: YnabRegisterRow[];
  planRows: YnabPlanRow[];
  registerFileName?: string;
  planFileName?: string;
}): YnabZipPreviewSummary {
  const accountNames = new Set<string>();
  const groupNames = new Set<string>();
  const categories = new Map<string, YnabCategoryCandidate>();
  let earliest: string | undefined;
  let latest: string | undefined;
  let historical = 0;
  let future = 0;
  let cleared = 0;
  let uncleared = 0;
  let reconciled = 0;
  let invalid = 0;
  let transfers = 0;
  const balanceMap = new Map<string, number>();

  for (const row of input.registerRows) {
    if (row.accountName) accountNames.add(row.accountName);
    if (row.isTransfer) transfers++;
    if (row.errors.length) invalid++;

    if (row.cleared === "reconciled") reconciled++;
    else if (row.cleared === "cleared") cleared++;
    else uncleared++;

    if (row.isFuture) future++;
    else historical++;

    if (row.date) {
      if (!earliest || row.date < earliest) earliest = row.date;
      if (!latest || row.date > latest) latest = row.date;
    }

    const cat = resolveCategoryNames(row);
    if (cat) {
      groupNames.add(cat.groupName);
      const key = `${normalizeCategoryName(cat.groupName)}::${normalizeCategoryName(cat.categoryName)}`;
      categories.set(key, {
        groupName: cat.groupName,
        categoryName: cat.categoryName,
        key,
      });
    }

    if (row.amountCents != null && row.accountName) {
      balanceMap.set(
        row.accountName,
        (balanceMap.get(row.accountName) ?? 0) + row.amountCents,
      );
    }
  }

  for (const row of input.planRows) {
    const cat = resolveCategoryNames(row);
    if (cat) {
      groupNames.add(cat.groupName);
      const key = `${normalizeCategoryName(cat.groupName)}::${normalizeCategoryName(cat.categoryName)}`;
      categories.set(key, {
        groupName: cat.groupName,
        categoryName: cat.categoryName,
        key,
      });
    }
    if (row.errors.length) invalid++;
  }

  // Also collect transfer target accounts
  for (const row of input.registerRows) {
    if (row.transferTargetAccount) accountNames.add(row.transferTargetAccount);
  }

  const accounts = [...accountNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => suggestAccountType(name));

  return {
    registerRowCount: input.registerRows.length,
    planRowCount: input.planRows.length,
    accounts,
    categoryGroups: [...groupNames].sort((a, b) => a.localeCompare(b)),
    categories: [...categories.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
    earliestDate: earliest,
    latestDate: latest,
    historicalRowCount: historical,
    futureScheduledRowCount: future,
    clearedCount: cleared,
    unclearedCount: uncleared,
    reconciledCount: reconciled,
    duplicateRowCount: 0, // filled by caller after duplicate pass
    invalidRowCount: invalid,
    transferRowCount: transfers,
    balanceEffectByAccount: [...balanceMap.entries()]
      .map(([accountName, effectCents]) => ({ accountName, effectCents }))
      .sort((a, b) => a.accountName.localeCompare(b.accountName)),
    registerFileName: input.registerFileName,
    planFileName: input.planFileName,
  };
}

export function findSimilarCategoryPairs(
  candidates: YnabCategoryCandidate[],
): Array<{ a: YnabCategoryCandidate; b: YnabCategoryCandidate }> {
  const pairs: Array<{ a: YnabCategoryCandidate; b: YnabCategoryCandidate }> =
    [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (
        normalizeCategoryName(a.categoryName) ===
          normalizeCategoryName(b.categoryName) &&
        normalizeCategoryName(a.groupName) !==
          normalizeCategoryName(b.groupName)
      ) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

export { resolveCategoryNames };
