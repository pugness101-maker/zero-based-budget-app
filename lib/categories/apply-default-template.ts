import {
  buildDefaultCategoryGroups,
  DEFAULT_CATEGORY_GROUP_DEFS,
} from "@/lib/seed/default-templates";
import type { BudgetPlan, CategoryGroup } from "@/lib/types/budget";

export interface TemplateGroupMapping {
  /** Existing group id → default template group id, or null to keep separate */
  [existingGroupId: string]: string | null;
}

export interface ApplyTemplatePreview {
  defaultGroups: Array<{ id: string; name: string; sortOrder: number }>;
  existingGroups: Array<{
    id: string;
    name: string;
    categoryCount: number;
    suggestedDefaultId: string | null;
  }>;
  groupsToAdd: string[];
}

function suggestDefaultId(name: string): string | null {
  const n = name.trim().toLowerCase();
  const exact = DEFAULT_CATEGORY_GROUP_DEFS.find(
    (g) => g.name.toLowerCase() === n,
  );
  if (exact) return exact.id;

  const aliases: Record<string, string> = {
    giving: "grp-gifts",
    college: "grp-education",
    education: "grp-education",
    transportation: "grp-transport",
    travel: "grp-transport",
    "transportation/travel": "grp-transport",
    fitness: "grp-health",
    health: "grp-health",
    "health/fitness": "grp-health",
    fun: "grp-entertainment",
    entertainment: "grp-entertainment",
    debt: "grp-misc",
    shopping: "grp-shopping",
    investments: "grp-investments",
    investing: "grp-investments",
    savings: "grp-savings",
    bills: "grp-bills",
    food: "grp-food",
    personal: "grp-personal",
    gifts: "grp-gifts",
    income: "grp-income",
    miscellaneous: "grp-misc",
    misc: "grp-misc",
    annual: "grp-annual",
    "annual expenses": "grp-annual",
    hidden: "grp-hidden",
  };
  return aliases[n] ?? null;
}

export function buildApplyTemplatePreview(
  plan: BudgetPlan,
): ApplyTemplatePreview {
  const existing = plan.categoryGroups
    .filter((g) => !g.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const existingIds = new Set(existing.map((g) => g.id));
  const groupsToAdd = DEFAULT_CATEGORY_GROUP_DEFS.filter(
    (g) => !existingIds.has(g.id) && !existing.some((e) => e.name === g.name),
  ).map((g) => g.name);

  return {
    defaultGroups: DEFAULT_CATEGORY_GROUP_DEFS.map((g) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
    })),
    existingGroups: existing.map((g) => ({
      id: g.id,
      name: g.name,
      categoryCount: plan.categories.filter(
        (c) => c.groupId === g.id && !c.deletedAt,
      ).length,
      suggestedDefaultId: suggestDefaultId(g.name),
    })),
    groupsToAdd,
  };
}

/**
 * Apply simplified defaults without wiping custom data blindly.
 * - Ensures all 15 default groups exist (by id or name)
 * - Remaps categories for groups mapped to a default
 * - Soft-deletes empty source groups that were mapped away
 * - Does not delete groups marked "keep" (null mapping)
 */
export function applySimplifiedDefaultTemplate(
  plan: BudgetPlan,
  mapping: TemplateGroupMapping,
): { ok: true; plan: BudgetPlan } | { ok: false; error: string } {
  const defaults = buildDefaultCategoryGroups();
  const byId = new Map(plan.categoryGroups.map((g) => [g.id, g]));
  const byName = new Map(
    plan.categoryGroups
      .filter((g) => !g.deletedAt)
      .map((g) => [g.name.toLowerCase(), g]),
  );

  let groups: CategoryGroup[] = [...plan.categoryGroups];

  for (const def of defaults) {
    const existingById = byId.get(def.id);
    const existingByName = byName.get(def.name.toLowerCase());
    if (existingById && !existingById.deletedAt) {
      groups = groups.map((g) =>
        g.id === def.id
          ? {
              ...g,
              name: def.name,
              sortOrder: def.sortOrder,
              collapsed: def.id === "grp-hidden" ? true : g.collapsed,
            }
          : g,
      );
    } else if (existingByName) {
      // Rename/reorder the name-matched group to match template identity loosely
      groups = groups.map((g) =>
        g.id === existingByName.id
          ? {
              ...g,
              sortOrder: def.sortOrder,
              collapsed: def.id === "grp-hidden" ? true : g.collapsed,
            }
          : g,
      );
    } else {
      groups.push(def);
    }
  }

  // Resolve name-based default targets to actual group ids present after ensure
  function resolveTargetId(defaultId: string): string {
    const direct = groups.find((g) => g.id === defaultId && !g.deletedAt);
    if (direct) return direct.id;
    const def = defaults.find((d) => d.id === defaultId);
    if (!def) return defaultId;
    const byN = groups.find(
      (g) => !g.deletedAt && g.name.toLowerCase() === def.name.toLowerCase(),
    );
    return byN?.id ?? defaultId;
  }

  const categories = plan.categories.map((c) => {
    const targetDefault = mapping[c.groupId];
    if (!targetDefault) return c;
    return { ...c, groupId: resolveTargetId(targetDefault) };
  });

  // Soft-delete empty mapped-away groups (not defaults that still exist)
  const defaultIds = new Set(defaults.map((d) => d.id));
  groups = groups.map((g) => {
    if (g.deletedAt) return g;
    const mappedTo = mapping[g.id];
    if (!mappedTo) return g;
    if (defaultIds.has(g.id)) return g;
    const stillHasCats = categories.some(
      (c) => c.groupId === g.id && !c.deletedAt,
    );
    if (stillHasCats) return g;
    return {
      ...g,
      deletedAt: new Date().toISOString(),
      hidden: true,
    };
  });

  // Ensure Hidden is last + collapsed
  groups = groups.map((g) => {
    if (g.id === "grp-hidden" || g.name === "Hidden") {
      return {
        ...g,
        sortOrder: 14,
        collapsed: true,
        hidden: false,
      };
    }
    return g;
  });

  return {
    ok: true,
    plan: {
      ...plan,
      categoryGroups: groups,
      categories,
    },
  };
}
