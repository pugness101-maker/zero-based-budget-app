import type {
  BudgetPlan,
  Category,
  CategoryGroup,
  Target,
  TargetType,
} from "@/lib/types/budget";
import type { Cents } from "@/lib/money";
import type { MonthKey } from "@/lib/dates";
import {
  findDuplicateCategoryName,
  getGroupCategoryCount,
} from "@/lib/categories/lifecycle";
import { deleteEmptyOrBudgetOnlyCategory } from "@/lib/categories/deletion";
import { reassignCategoryId } from "@/lib/categories/reassign";

export { reassignCategoryId } from "@/lib/categories/reassign";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export type OpResult =
  | { ok: true; plan: BudgetPlan; entityId?: string }
  | { ok: false; error: string };

export interface AddCategoryInput {
  name: string;
  groupId: string;
  notes?: string;
  rollover?: boolean;
  pinned?: boolean;
  monthKey?: MonthKey;
  startingAssignedCents?: Cents;
  target?: {
    type: TargetType;
    amountCents: Cents;
    dueDate?: string;
    notes?: string;
  };
}

export function addCategory(plan: BudgetPlan, input: AddCategoryInput): OpResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Category name is required." };
  const group = plan.categoryGroups.find(
    (g) => g.id === input.groupId && !g.deletedAt,
  );
  if (!group) return { ok: false, error: "Category group not found." };
  if (findDuplicateCategoryName(plan, name, input.groupId)) {
    return {
      ok: false,
      error: "A category with this name already exists in the group.",
    };
  }

  const siblings = plan.categories.filter(
    (c) => c.groupId === input.groupId && !c.deletedAt,
  );
  const id = newId("cat");
  const category: Category = {
    id,
    groupId: input.groupId,
    name,
    sortOrder: siblings.length
      ? Math.max(...siblings.map((c) => c.sortOrder)) + 1
      : 0,
    hidden: false,
    notes: input.notes?.trim() || undefined,
    rollover: input.rollover ?? true,
    pinned: Boolean(input.pinned),
    isArchived: false,
    reportIncluded: true,
  };

  let monthlyBudgets = plan.monthlyBudgets;
  if (input.monthKey && input.startingAssignedCents != null) {
    monthlyBudgets = [
      ...monthlyBudgets,
      {
        categoryId: id,
        monthKey: input.monthKey,
        assignedCents: input.startingAssignedCents,
      },
    ];
  }

  let targets = plan.targets;
  if (input.target) {
    const target: Target = {
      id: newId("tgt"),
      categoryId: id,
      type: input.target.type,
      amountCents: input.target.amountCents,
      dueDate: input.target.dueDate,
      notes: input.target.notes,
    };
    targets = [...targets, target];
  }

  return {
    ok: true,
    entityId: id,
    plan: {
      ...plan,
      categories: [...plan.categories, category],
      monthlyBudgets,
      targets,
    },
  };
}

export interface EditCategoryInput {
  name?: string;
  groupId?: string;
  notes?: string | null;
  rollover?: boolean;
  pinned?: boolean;
  hidden?: boolean;
  isArchived?: boolean;
  reportIncluded?: boolean;
  color?: string | null;
  icon?: string | null;
}

export function editCategory(
  plan: BudgetPlan,
  categoryId: string,
  input: EditCategoryInput,
): OpResult {
  const existing = plan.categories.find((c) => c.id === categoryId);
  if (!existing || existing.deletedAt) {
    return { ok: false, error: "Category not found." };
  }

  const nextGroupId = input.groupId ?? existing.groupId;
  const nextName = input.name?.trim() ?? existing.name;
  if (!nextName) return { ok: false, error: "Category name is required." };

  if (
    findDuplicateCategoryName(plan, nextName, nextGroupId, categoryId)
  ) {
    return {
      ok: false,
      error: "A category with this name already exists in the group.",
    };
  }

  if (nextGroupId !== existing.groupId) {
    const group = plan.categoryGroups.find(
      (g) => g.id === nextGroupId && !g.deletedAt,
    );
    if (!group) return { ok: false, error: "Destination group not found." };
  }

  let sortOrder = existing.sortOrder;
  if (nextGroupId !== existing.groupId) {
    const siblings = plan.categories.filter(
      (c) => c.groupId === nextGroupId && !c.deletedAt && c.id !== categoryId,
    );
    sortOrder = siblings.length
      ? Math.max(...siblings.map((c) => c.sortOrder)) + 1
      : 0;
  }

  return {
    ok: true,
    entityId: categoryId,
    plan: {
      ...plan,
      categories: plan.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              name: nextName,
              groupId: nextGroupId,
              sortOrder,
              notes:
                input.notes === null
                  ? undefined
                  : input.notes !== undefined
                    ? input.notes.trim() || undefined
                    : c.notes,
              rollover: input.rollover ?? c.rollover,
              pinned: input.pinned ?? c.pinned,
              hidden: input.hidden ?? c.hidden,
              isArchived: input.isArchived ?? c.isArchived,
              reportIncluded: input.reportIncluded ?? c.reportIncluded,
              color:
                input.color === null
                  ? undefined
                  : input.color !== undefined
                    ? input.color
                    : c.color,
              icon:
                input.icon === null
                  ? undefined
                  : input.icon !== undefined
                    ? input.icon
                    : c.icon,
            }
          : c,
      ),
    },
  };
}

export function hideCategory(plan: BudgetPlan, categoryId: string): OpResult {
  return editCategory(plan, categoryId, { hidden: true, isArchived: false });
}

export function unhideCategory(plan: BudgetPlan, categoryId: string): OpResult {
  return editCategory(plan, categoryId, { hidden: false });
}

export function archiveCategory(plan: BudgetPlan, categoryId: string): OpResult {
  return editCategory(plan, categoryId, {
    isArchived: true,
    hidden: true,
  });
}

export function unarchiveCategory(
  plan: BudgetPlan,
  categoryId: string,
): OpResult {
  return editCategory(plan, categoryId, {
    isArchived: false,
    hidden: false,
  });
}

/** Delete unused category (no hard links). Soft-deletes so restore remains possible. */
export function deleteCategorySafe(
  plan: BudgetPlan,
  categoryId: string,
): OpResult {
  return deleteEmptyOrBudgetOnlyCategory(plan, categoryId);
}

export function mergeCategories(
  plan: BudgetPlan,
  sourceId: string,
  destinationId: string,
): OpResult {
  if (sourceId === destinationId) {
    return { ok: false, error: "Choose a different destination category." };
  }
  const source = plan.categories.find((c) => c.id === sourceId);
  const dest = plan.categories.find((c) => c.id === destinationId);
  if (!source || source.deletedAt) {
    return { ok: false, error: "Source category not found." };
  }
  if (!dest || dest.deletedAt) {
    return { ok: false, error: "Destination category not found." };
  }

  let next = reassignCategoryId(plan, sourceId, destinationId);
  const combinedNotes = [dest.notes, source.notes].filter(Boolean).join("\n\n");
  next = {
    ...next,
    categories: next.categories.map((c) => {
      if (c.id === destinationId) {
        return {
          ...c,
          notes: combinedNotes || undefined,
        };
      }
      if (c.id === sourceId) {
        return {
          ...c,
          deletedAt: new Date().toISOString(),
          mergedIntoCategoryId: destinationId,
          deletionMethod: "merge" as const,
          hidden: true,
          isArchived: true,
        };
      }
      return c;
    }),
  };

  return { ok: true, entityId: destinationId, plan: next };
}

export function moveCategoryHistory(
  plan: BudgetPlan,
  sourceId: string,
  destinationId: string,
): OpResult {
  // Same as merge but keep source as hidden empty shell without soft-delete? Spec says move all history
  return mergeCategories(plan, sourceId, destinationId);
}

export function reorderCategories(
  plan: BudgetPlan,
  orderedIds: string[],
  groupId: string,
): OpResult {
  const idSet = new Set(orderedIds);
  return {
    ok: true,
    plan: {
      ...plan,
      categories: plan.categories.map((c) => {
        if (c.groupId !== groupId || !idSet.has(c.id)) return c;
        const idx = orderedIds.indexOf(c.id);
        return { ...c, sortOrder: idx, groupId };
      }),
    },
  };
}

export function moveCategoryToGroup(
  plan: BudgetPlan,
  categoryId: string,
  groupId: string,
  index?: number,
): OpResult {
  const edited = editCategory(plan, categoryId, { groupId });
  if (!edited.ok) return edited;
  if (index == null) return edited;

  const inGroup = edited.plan.categories
    .filter((c) => c.groupId === groupId && !c.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const without = inGroup.filter((c) => c.id !== categoryId);
  const clamped = Math.max(0, Math.min(index, without.length));
  const ordered = [
    ...without.slice(0, clamped).map((c) => c.id),
    categoryId,
    ...without.slice(clamped).map((c) => c.id),
  ];
  return reorderCategories(edited.plan, ordered, groupId);
}

export function addCategoryGroup(
  plan: BudgetPlan,
  name: string,
): OpResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Group name is required." };
  if (
    plan.categoryGroups.some(
      (g) =>
        !g.deletedAt && g.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return { ok: false, error: "A group with this name already exists." };
  }
  const id = newId("grp");
  const sortOrder = plan.categoryGroups.filter((g) => !g.deletedAt).length
    ? Math.max(
        ...plan.categoryGroups
          .filter((g) => !g.deletedAt)
          .map((g) => g.sortOrder),
      ) + 1
    : 0;
  const group: CategoryGroup = {
    id,
    name: trimmed,
    sortOrder,
    hidden: false,
    collapsed: false,
  };
  return {
    ok: true,
    entityId: id,
    plan: { ...plan, categoryGroups: [...plan.categoryGroups, group] },
  };
}

export function renameCategoryGroup(
  plan: BudgetPlan,
  groupId: string,
  name: string,
): OpResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Group name is required." };
  const existing = plan.categoryGroups.find((g) => g.id === groupId);
  if (!existing || existing.deletedAt) {
    return { ok: false, error: "Group not found." };
  }
  if (
    plan.categoryGroups.some(
      (g) =>
        !g.deletedAt &&
        g.id !== groupId &&
        g.name.trim().toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return { ok: false, error: "A group with this name already exists." };
  }
  return {
    ok: true,
    entityId: groupId,
    plan: {
      ...plan,
      categoryGroups: plan.categoryGroups.map((g) =>
        g.id === groupId ? { ...g, name: trimmed } : g,
      ),
    },
  };
}

export function hideCategoryGroup(
  plan: BudgetPlan,
  groupId: string,
  hidden: boolean,
): OpResult {
  return {
    ok: true,
    entityId: groupId,
    plan: {
      ...plan,
      categoryGroups: plan.categoryGroups.map((g) =>
        g.id === groupId ? { ...g, hidden } : g,
      ),
    },
  };
}

export function deleteCategoryGroupSafe(
  plan: BudgetPlan,
  groupId: string,
): OpResult {
  const count = getGroupCategoryCount(plan, groupId);
  if (count > 0) {
    return {
      ok: false,
      error: `Group still has ${count} categor${count === 1 ? "y" : "ies"}. Move, merge, hide, or delete them first.`,
    };
  }
  return {
    ok: true,
    entityId: groupId,
    plan: {
      ...plan,
      categoryGroups: plan.categoryGroups.filter((g) => g.id !== groupId),
    },
  };
}

export function reorderCategoryGroups(
  plan: BudgetPlan,
  orderedIds: string[],
): OpResult {
  const idSet = new Set(orderedIds);
  return {
    ok: true,
    plan: {
      ...plan,
      categoryGroups: plan.categoryGroups.map((g) => {
        if (!idSet.has(g.id)) return g;
        return { ...g, sortOrder: orderedIds.indexOf(g.id) };
      }),
    },
  };
}

export function mergeCategoryGroups(
  plan: BudgetPlan,
  sourceGroupId: string,
  destinationGroupId: string,
): OpResult {
  if (sourceGroupId === destinationGroupId) {
    return { ok: false, error: "Choose a different destination group." };
  }
  const source = plan.categoryGroups.find((g) => g.id === sourceGroupId);
  const dest = plan.categoryGroups.find((g) => g.id === destinationGroupId);
  if (!source || source.deletedAt || !dest || dest.deletedAt) {
    return { ok: false, error: "Group not found." };
  }

  let next = plan;
  const sourceCats = plan.categories.filter(
    (c) => c.groupId === sourceGroupId && !c.deletedAt,
  );
  for (const cat of sourceCats) {
    // If duplicate name in dest, rename slightly
    let name = cat.name;
    if (findDuplicateCategoryName(next, name, destinationGroupId, cat.id)) {
      name = `${cat.name} (merged)`;
    }
    const moved = editCategory(next, cat.id, {
      groupId: destinationGroupId,
      name,
    });
    if (!moved.ok) return moved;
    next = moved.plan;
  }

  next = {
    ...next,
    categoryGroups: next.categoryGroups.map((g) =>
      g.id === sourceGroupId
        ? {
            ...g,
            deletedAt: new Date().toISOString(),
            mergedIntoGroupId: destinationGroupId,
            hidden: true,
          }
        : g,
    ),
  };

  return { ok: true, entityId: destinationGroupId, plan: next };
}

export function bulkSetCategoryHidden(
  plan: BudgetPlan,
  categoryIds: string[],
  hidden: boolean,
): OpResult {
  const ids = new Set(categoryIds);
  return {
    ok: true,
    plan: {
      ...plan,
      categories: plan.categories.map((c) =>
        ids.has(c.id) && !c.deletedAt
          ? { ...c, hidden, isArchived: hidden ? c.isArchived : false }
          : c,
      ),
    },
  };
}

export function bulkMoveCategories(
  plan: BudgetPlan,
  categoryIds: string[],
  groupId: string,
): OpResult {
  let next = plan;
  for (const id of categoryIds) {
    const result = moveCategoryToGroup(next, id, groupId);
    if (!result.ok) return result;
    next = result.plan;
  }
  return { ok: true, plan: next };
}
