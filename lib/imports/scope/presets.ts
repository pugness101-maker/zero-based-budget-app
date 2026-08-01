import type { ImportScopePreset, ImportScopeSelection } from "@/lib/imports/scope/types";

const STORAGE_KEY = "edf-import-scope-presets";

export const BUILTIN_SCOPE_PRESET_TEMPLATES: Array<{
  id: string;
  name: string;
  apply: (ctx: {
    accountNames: string[];
    categoryKeys: string[];
    activeAccountNames: string[];
    onBudgetAccountNames: string[];
  }) => Partial<ImportScopeSelection>;
}> = [
  {
    id: "builtin-2026",
    name: "2026 only",
    apply: () => ({
      dateRange: {
        preset: "year_2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      },
    }),
  },
  {
    id: "builtin-active-accounts",
    name: "Active accounts only",
    apply: ({ activeAccountNames }) => ({
      accountScopeMode: "selected",
      selectedAccountNames: activeAccountNames,
    }),
  },
  {
    id: "builtin-checking-credit",
    name: "Checking and credit cards",
    apply: ({ accountNames }) => ({
      accountScopeMode: "selected",
      selectedAccountNames: accountNames.filter((n) => {
        const lower = n.toLowerCase();
        return (
          lower.includes("checking") ||
          lower.includes("credit") ||
          lower.includes("visa") ||
          lower.includes("mastercard") ||
          lower.includes("amex") ||
          lower.includes("sapphire") ||
          lower.includes("card")
        );
      }),
    }),
  },
  {
    id: "builtin-no-tracking",
    name: "No tracking accounts",
    apply: ({ onBudgetAccountNames }) => ({
      accountScopeMode: "selected",
      selectedAccountNames: onBudgetAccountNames,
    }),
  },
  {
    id: "builtin-selected-categories",
    name: "Selected categories only",
    apply: ({ categoryKeys }) => ({
      categoryScopeMode: "selected",
      selectedCategoryKeys: categoryKeys,
    }),
  },
];

export function loadImportScopePresets(): ImportScopePreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImportScopePreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveImportScopePreset(
  preset: Omit<ImportScopePreset, "id" | "createdAt"> & { id?: string },
): ImportScopePreset {
  const next: ImportScopePreset = {
    id: preset.id ?? `scope-preset-${crypto.randomUUID().slice(0, 8)}`,
    name: preset.name,
    createdAt: new Date().toISOString(),
    selectedAccountNames: preset.selectedAccountNames,
    selectedCategoryKeys: preset.selectedCategoryKeys,
    dateRange: preset.dateRange,
    transferHandlingMode: preset.transferHandlingMode,
    unselectedCategoryHandlingMode: preset.unselectedCategoryHandlingMode,
    accountScopeMode: preset.accountScopeMode,
    categoryScopeMode: preset.categoryScopeMode,
  };
  const existing = loadImportScopePresets().filter((p) => p.id !== next.id);
  const all = [next, ...existing].slice(0, 20);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

export function deleteImportScopePreset(id: string): void {
  const all = loadImportScopePresets().filter((p) => p.id !== id);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export function presetToSelection(
  preset: ImportScopePreset,
): Partial<ImportScopeSelection> {
  return {
    selectedAccountNames: preset.selectedAccountNames,
    selectedCategoryKeys: preset.selectedCategoryKeys,
    dateRange: preset.dateRange,
    transferHandlingMode: preset.transferHandlingMode,
    unselectedCategoryHandlingMode: preset.unselectedCategoryHandlingMode,
    accountScopeMode: preset.accountScopeMode,
    categoryScopeMode: preset.categoryScopeMode,
    scopePresetId: preset.id,
  };
}

export function selectionToPresetPayload(
  name: string,
  scope: ImportScopeSelection,
): Omit<ImportScopePreset, "id" | "createdAt"> {
  return {
    name,
    selectedAccountNames: scope.selectedAccountNames,
    selectedCategoryKeys: scope.selectedCategoryKeys,
    dateRange: scope.dateRange,
    transferHandlingMode: scope.transferHandlingMode,
    unselectedCategoryHandlingMode: scope.unselectedCategoryHandlingMode,
    accountScopeMode: scope.accountScopeMode,
    categoryScopeMode: scope.categoryScopeMode,
  };
}
