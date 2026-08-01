import type { BudgetPlan, Category, CategoryGroup, Payee } from "@/lib/types/budget";
import type { CategoryMatchDecision, ImportRow } from "@/lib/types/import";

export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[/_]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** YNAB often uses "Group: Category" or "Group/Category". */
export function splitCategoryPath(raw: string): { group?: string; category: string } {
  const trimmed = raw.trim();
  if (trimmed.includes(":")) {
    const [group, ...rest] = trimmed.split(":");
    return { group: group?.trim(), category: rest.join(":").trim() };
  }
  if (trimmed.includes("/")) {
    const [group, ...rest] = trimmed.split("/");
    return { group: group?.trim(), category: rest.join("/").trim() };
  }
  return { category: trimmed };
}

export function findCategoryByName(
  plan: BudgetPlan,
  rawName: string,
  options: { includeHidden?: boolean } = {},
): Category | undefined {
  const { category } = splitCategoryPath(rawName);
  const target = normalizeCategoryName(category);
  const includeHidden = options.includeHidden ?? false;
  // Prefer active matches, then allow hidden (imports warn when used)
  const active = plan.categories.find(
    (c) =>
      !c.deletedAt &&
      !c.hidden &&
      !c.isArchived &&
      normalizeCategoryName(c.name) === target,
  );
  if (active) return active;
  if (!includeHidden) return undefined;
  return plan.categories.find(
    (c) =>
      !c.deletedAt &&
      (c.hidden || c.isArchived) &&
      normalizeCategoryName(c.name) === target,
  );
}

export function findPayeeByNameOrAlias(
  plan: BudgetPlan,
  name: string,
  aliases: Record<string, string> = {},
): Payee | undefined {
  const key = normalizeCategoryName(name);
  const aliasTarget = aliases[key];
  if (aliasTarget) {
    return plan.payees.find(
      (p) => normalizeCategoryName(p.name) === normalizeCategoryName(aliasTarget),
    );
  }
  return plan.payees.find((p) => normalizeCategoryName(p.name) === key);
}

export function applyCategoryMatching(
  rows: ImportRow[],
  plan: BudgetPlan,
  decisions: CategoryMatchDecision[],
  createMissing: boolean,
  defaultGroupId?: string,
): {
  rows: ImportRow[];
  categoriesToCreate: Array<{ name: string; groupId: string }>;
} {
  const decisionBySource = new Map(
    decisions.map((d) => [normalizeCategoryName(d.sourceName), d]),
  );
  const toCreate: Array<{ name: string; groupId: string }> = [];
  const seenCreate = new Set<string>();

  const next = rows.map((row) => {
    if (row.status === "invalid" || row.status === "duplicate") return row;
    if (!row.categoryName) {
      return { ...row, categoryId: null, status: "ready" as const };
    }

    const key = normalizeCategoryName(row.categoryName);
    const decision = decisionBySource.get(key);
    if (decision) {
      if (decision.createNew) {
        const ck = normalizeCategoryName(decision.createNew.name);
        if (!seenCreate.has(ck)) {
          seenCreate.add(ck);
          toCreate.push(decision.createNew);
        }
        return {
          ...row,
          categoryId: null,
          status: "ready" as const,
          // placeholder — resolved at commit with created id map
        };
      }
      return {
        ...row,
        categoryId: decision.categoryId,
        status: "ready" as const,
        include: row.include,
      };
    }

    const existing =
      findCategoryByName(plan, row.categoryName) ??
      findCategoryByName(plan, row.categoryName, { includeHidden: true });
    if (existing) {
      const warnHidden =
        existing.hidden || existing.isArchived
          ? "Matched a hidden/archived category."
          : null;
      return {
        ...row,
        categoryId: existing.id,
        status: "ready" as const,
        errors: warnHidden
          ? row.errors.includes(warnHidden)
            ? row.errors
            : [...row.errors, warnHidden]
          : row.errors,
      };
    }

    if (createMissing) {
      const { category, group } = splitCategoryPath(row.categoryName);
      const groupId =
        plan.categoryGroups.find(
          (g) =>
            group &&
            normalizeCategoryName(g.name) === normalizeCategoryName(group),
        )?.id ??
        defaultGroupId ??
        plan.categoryGroups[0]?.id;
      if (groupId) {
        const ck = normalizeCategoryName(category);
        if (!seenCreate.has(ck)) {
          seenCreate.add(ck);
          toCreate.push({ name: category, groupId });
        }
        return { ...row, status: "ready" as const };
      }
    }

    return {
      ...row,
      categoryId: null,
      status: "needs_category" as const,
      include: true,
      errors: row.errors.includes("Category not matched.")
        ? row.errors
        : [...row.errors, "Category not matched."],
    };
  });

  return { rows: next, categoriesToCreate: toCreate };
}

export function ensureImportedGroup(plan: BudgetPlan): CategoryGroup {
  const existing = plan.categoryGroups.find(
    (g) => normalizeCategoryName(g.name) === "imported",
  );
  if (existing) return existing;
  return {
    id: "grp-imported",
    name: "Imported",
    sortOrder: plan.categoryGroups.length,
    hidden: false,
  };
}
