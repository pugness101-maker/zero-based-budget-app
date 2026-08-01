"use client";

import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  getAssignedForCategory,
  getCategoryActivity,
  getCategoryAvailable,
} from "@/lib/calculations/plan";
import {
  categoryLastUsedDate,
  categoryTransactionCount,
} from "@/lib/categories/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { RowActionsMenu } from "@/components/budget/row-actions-menu";
import { CategoryFormModal } from "@/components/budget/category-form-modal";
import { cn } from "@/lib/utils";
import type { BudgetPlan, Category, CategoryGroup } from "@/lib/types/budget";
import type { MonthKey } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import { toggleIdInSet } from "@/lib/categories/selection";

function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-accent-muted px-0.5 text-ink">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

interface CatMetrics {
  assigned: Cents;
  activity: Cents;
  available: Cents;
  target: Cents | null;
  txnCount: number;
  lastUsed?: string;
}

function buildCategoryMetrics(
  plan: BudgetPlan,
  category: Category,
  monthKey: MonthKey,
): CatMetrics {
  const target =
    plan.targets.find((t) => t.categoryId === category.id)?.amountCents ?? null;
  return {
    assigned: getAssignedForCategory(
      plan.monthlyBudgets,
      category.id,
      monthKey,
    ),
    activity: getCategoryActivity(
      plan.transactions,
      category.id,
      monthKey,
    ),
    available: getCategoryAvailable(plan, category, monthKey),
    target,
    txnCount: categoryTransactionCount(plan.transactions, category.id),
    lastUsed: categoryLastUsedDate(plan.transactions, category.id),
  };
}

export function CategoryGroupsPanel({
  selectedGroups,
  onSelectedGroupsChange,
}: {
  selectedGroups: Set<string>;
  onSelectedGroupsChange: (next: Set<string>) => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const expandedMap = useMemo(
    () => plan.preferences.settingsCategoryGroupsExpanded ?? {},
    [plan.preferences.settingsCategoryGroupsExpanded],
  );
  const setExpanded = useBudgetStore((s) => s.setSettingsCategoryGroupExpanded);
  const setAllExpanded = useBudgetStore(
    (s) => s.setAllSettingsCategoryGroupsExpanded,
  );
  const addCategoryGroup = useBudgetStore((s) => s.addCategoryGroup);
  const renameCategoryGroup = useBudgetStore((s) => s.renameCategoryGroup);
  const hideCategoryGroup = useBudgetStore((s) => s.hideCategoryGroup);
  const deleteCategoryGroup = useBudgetStore((s) => s.deleteCategoryGroup);
  const mergeCategoryGroups = useBudgetStore((s) => s.mergeCategoryGroups);
  const reorderCategoryGroups = useBudgetStore((s) => s.reorderCategoryGroups);
  const reorderCategories = useBudgetStore((s) => s.reorderCategories);
  const moveCategory = useBudgetStore((s) => s.moveCategory);
  const hideCategory = useBudgetStore((s) => s.hideCategory);
  const archiveCategory = useBudgetStore((s) => s.archiveCategory);
  const editCategory = useBudgetStore((s) => s.editCategory);
  const mergeCategories = useBudgetStore((s) => s.mergeCategories);

  const [search, setSearch] = useState("");
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [mobileActions, setMobileActions] = useState<{
    title: string;
    actions: { label: string; onClick: () => void; danger?: boolean }[];
  } | null>(null);
  const [modal, setModal] = useState<{
    mode: "add" | "edit";
    categoryId?: string;
    groupId?: string;
  } | null>(null);

  const groups = useMemo(
    () =>
      [...plan.categoryGroups]
        .filter((g) => !g.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [plan.categoryGroups],
  );

  const categoriesByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const g of groups) map.set(g.id, []);
    for (const c of plan.categories) {
      if (c.deletedAt) continue;
      const list = map.get(c.groupId);
      if (list) list.push(c);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      map.set(id, list);
    }
    return map;
  }, [plan.categories, groups]);

  const q = search.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      return (categoriesByGroup.get(g.id) ?? []).some((c) =>
        c.name.toLowerCase().includes(q),
      );
    });
  }, [groups, categoriesByGroup, q]);

  const autoExpanded = useMemo(() => {
    if (!q) return new Set<string>();
    const set = new Set<string>();
    for (const g of visibleGroups) {
      const cats = categoriesByGroup.get(g.id) ?? [];
      if (
        cats.some((c) => c.name.toLowerCase().includes(q)) ||
        g.name.toLowerCase().includes(q)
      ) {
        // Auto-expand when a category matches (or group name matches)
        if (cats.some((c) => c.name.toLowerCase().includes(q))) {
          set.add(g.id);
        }
      }
    }
    return set;
  }, [visibleGroups, categoriesByGroup, q]);

  const isExpanded = useCallback(
    (groupId: string) => {
      if (autoExpanded.has(groupId)) return true;
      return Boolean(expandedMap[groupId]);
    },
    [autoExpanded, expandedMap],
  );

  function expandAll() {
    setAllExpanded(
      visibleGroups.map((g) => g.id),
      true,
    );
  }

  function collapseAll() {
    setAllExpanded(
      groups.map((g) => g.id),
      false,
    );
  }

  function handleDropCategory(targetGroupId: string, targetCatId?: string) {
    if (!dragCatId) return;
    const source = plan.categories.find((c) => c.id === dragCatId);
    if (!source || source.deletedAt) {
      setDragCatId(null);
      return;
    }

    if (source.groupId !== targetGroupId) {
      const destCats = (categoriesByGroup.get(targetGroupId) ?? []).map(
        (c) => c.id,
      );
      const index = targetCatId
        ? Math.max(0, destCats.indexOf(targetCatId))
        : destCats.length;
      moveCategory(dragCatId, targetGroupId, index);
      setExpanded(targetGroupId, true);
    } else if (targetCatId && targetCatId !== dragCatId) {
      const ids = (categoriesByGroup.get(targetGroupId) ?? []).map((c) => c.id);
      const from = ids.indexOf(dragCatId);
      const to = ids.indexOf(targetCatId);
      if (from >= 0 && to >= 0) {
        const next = [...ids];
        next.splice(from, 1);
        next.splice(to, 0, dragCatId);
        reorderCategories(targetGroupId, next);
      }
    }
    setDragCatId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const name = prompt("New group name?");
            if (!name?.trim()) return;
            const result = addCategoryGroup(name);
            if (!result.ok) alert(result.error);
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Add Category Group
        </button>
        <button
          type="button"
          onClick={expandAll}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Expand All
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Collapse All
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search groups or categories"
        className="input"
        aria-label="Search category groups"
      />

      <div className="space-y-2 md:space-y-0 md:divide-y md:divide-border md:rounded-lg md:border md:border-border">
        {visibleGroups.map((group, index) => {
          const cats = categoriesByGroup.get(group.id) ?? [];
          // When group name matches (or no search), show all cats; else only matching cats
          const displayCats =
            !q || group.name.toLowerCase().includes(q)
              ? cats
              : cats.filter((c) => c.name.toLowerCase().includes(q));

          return (
            <GroupAccordion
              key={group.id}
              group={group}
              categories={displayCats}
              totalCategories={cats}
              monthKey={monthKey}
              plan={plan}
              search={search}
              expanded={isExpanded(group.id)}
              selected={selectedGroups.has(group.id)}
              onToggleSelected={() =>
                onSelectedGroupsChange(
                  toggleIdInSet(selectedGroups, group.id),
                )
              }
              onToggleExpanded={() =>
                setExpanded(group.id, !isExpanded(group.id))
              }
              onRename={() => {
                const name = prompt("Rename group", group.name);
                if (!name?.trim()) return;
                renameCategoryGroup(group.id, name);
              }}
              onAddCategory={() =>
                setModal({ mode: "add", groupId: group.id })
              }
              onHide={() => hideCategoryGroup(group.id, !group.hidden)}
              onDelete={() => {
                const result = deleteCategoryGroup(group.id);
                if (!result.ok) alert(result.error);
              }}
              onMerge={() => {
                const dest = prompt("Merge into group name:");
                if (!dest?.trim()) return;
                const destGroup = groups.find(
                  (g) =>
                    g.name.toLowerCase() === dest.trim().toLowerCase() &&
                    g.id !== group.id,
                );
                if (!destGroup) {
                  alert("Destination group not found.");
                  return;
                }
                const result = mergeCategoryGroups(group.id, destGroup.id);
                if (!result.ok) alert(result.error);
              }}
              onMoveUp={() => {
                if (index <= 0) return;
                const ids = groups.map((g) => g.id);
                const next = [...ids];
                [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                reorderCategoryGroups(next);
              }}
              onMoveDown={() => {
                if (index >= groups.length - 1) return;
                const ids = groups.map((g) => g.id);
                const next = [...ids];
                [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                reorderCategoryGroups(next);
              }}
              dragCatId={dragCatId}
              onDragCatStart={setDragCatId}
              onDropCategory={(catId) => handleDropCategory(group.id, catId)}
              onDropOnGroup={() => handleDropCategory(group.id)}
              dragGroupId={dragGroupId}
              onDragGroupStart={setDragGroupId}
              onDropGroup={() => {
                if (!dragGroupId || dragGroupId === group.id) {
                  setDragGroupId(null);
                  return;
                }
                const ids = groups.map((g) => g.id);
                const from = ids.indexOf(dragGroupId);
                const to = ids.indexOf(group.id);
                if (from < 0 || to < 0) {
                  setDragGroupId(null);
                  return;
                }
                const next = [...ids];
                next.splice(from, 1);
                next.splice(to, 0, dragGroupId);
                reorderCategoryGroups(next);
                setDragGroupId(null);
              }}
              onEditCategory={(id) =>
                setModal({ mode: "edit", categoryId: id })
              }
              onMoveCategory={(id) => {
                const name = prompt("Move to group name:");
                if (!name?.trim()) return;
                const dest = groups.find(
                  (g) => g.name.toLowerCase() === name.trim().toLowerCase(),
                );
                if (!dest) {
                  alert("Group not found.");
                  return;
                }
                moveCategory(id, dest.id);
              }}
              onPinCategory={(id, pinned) => editCategory(id, { pinned })}
              onHideCategory={(id) => hideCategory(id)}
              onArchiveCategory={(id) => archiveCategory(id)}
              onMergeCategory={(id) => {
                const destName = prompt("Merge into category name:");
                if (!destName?.trim()) return;
                const dest = plan.categories.find(
                  (c) =>
                    !c.deletedAt &&
                    c.name.toLowerCase() === destName.trim().toLowerCase(),
                );
                if (!dest) {
                  alert("Destination not found.");
                  return;
                }
                if (!confirm(`Merge into ${dest.name}?`)) return;
                const result = mergeCategories(id, dest.id);
                if (!result.ok) alert(result.error);
              }}
              onOpenMobileActions={setMobileActions}
            />
          );
        })}
      </div>

      {visibleGroups.length === 0 && (
        <p className="text-sm text-muted">No groups match your search.</p>
      )}

      {mobileActions && (
        <MobileActionsSheet
          title={mobileActions.title}
          actions={mobileActions.actions}
          onClose={() => setMobileActions(null)}
        />
      )}

      <CategoryFormModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        mode={modal?.mode ?? "add"}
        categoryId={modal?.categoryId}
        defaultGroupId={modal?.groupId}
      />
    </div>
  );
}

const GroupAccordion = memo(function GroupAccordion({
  group,
  categories,
  totalCategories,
  monthKey,
  plan,
  search,
  expanded,
  selected,
  onToggleSelected,
  onToggleExpanded,
  onRename,
  onAddCategory,
  onHide,
  onDelete,
  onMerge,
  onMoveUp,
  onMoveDown,
  dragCatId,
  onDragCatStart,
  onDropCategory,
  onDropOnGroup,
  dragGroupId,
  onDragGroupStart,
  onDropGroup,
  onEditCategory,
  onMoveCategory,
  onPinCategory,
  onHideCategory,
  onArchiveCategory,
  onMergeCategory,
  onOpenMobileActions,
}: {
  group: CategoryGroup;
  categories: Category[];
  totalCategories: Category[];
  monthKey: MonthKey;
  plan: BudgetPlan;
  search: string;
  expanded: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onRename: () => void;
  onAddCategory: () => void;
  onHide: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragCatId: string | null;
  onDragCatStart: (id: string | null) => void;
  onDropCategory: (catId: string) => void;
  onDropOnGroup: () => void;
  dragGroupId: string | null;
  onDragGroupStart: (id: string | null) => void;
  onDropGroup: () => void;
  onEditCategory: (id: string) => void;
  onMoveCategory: (id: string) => void;
  onPinCategory: (id: string, pinned: boolean) => void;
  onHideCategory: (id: string) => void;
  onArchiveCategory: (id: string) => void;
  onMergeCategory: (id: string) => void;
  onOpenMobileActions: (sheet: {
    title: string;
    actions: { label: string; onClick: () => void; danger?: boolean }[];
  }) => void;
}) {
  const metricsList = useMemo(() => {
    if (!expanded) return [];
    return categories.map((c) => ({
      category: c,
      metrics: buildCategoryMetrics(plan, c, monthKey),
    }));
  }, [expanded, categories, plan, monthKey]);

  const totals = useMemo(() => {
    let assigned = 0;
    let activity = 0;
    let available = 0;
    for (const c of totalCategories) {
      const m = buildCategoryMetrics(plan, c, monthKey);
      assigned += m.assigned;
      activity += m.activity;
      available += m.available;
    }
    return { assigned, activity, available };
  }, [totalCategories, plan, monthKey]);

  const groupActions = [
    { label: expanded ? "Collapse" : "Expand", onClick: onToggleExpanded },
    { label: "Add Category", onClick: onAddCategory },
    { label: "Rename", onClick: onRename },
    { label: "Move up", onClick: onMoveUp },
    { label: "Move down", onClick: onMoveDown },
    { label: group.hidden ? "Unhide Group" : "Hide Group", onClick: onHide },
    { label: "Merge Group", onClick: onMerge },
    { label: "Delete Group", onClick: onDelete, danger: true },
  ];

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface md:rounded-none md:border-0",
        dragGroupId === group.id && "opacity-50",
      )}
      draggable
      onDragStart={() => onDragGroupStart(group.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (dragCatId) onDropOnGroup();
        else onDropGroup();
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-1.5 accent-[var(--accent)]"
          aria-label={`Select group ${group.name}`}
          checked={selected}
          onChange={onToggleSelected}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.name}`}
          className="mt-0.5 rounded p-0.5 text-muted hover:bg-black/5"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {highlightMatch(group.name, search)}
            </span>
            {group.hidden && (
              <Badge>Hidden</Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            <span>
              {totalCategories.length} categor
              {totalCategories.length === 1 ? "y" : "ies"}
            </span>
            <span>
              Assigned <MoneyText cents={totals.assigned} />
            </span>
            <span>
              Activity <MoneyText cents={totals.activity} signed />
            </span>
            <span>
              Available <MoneyText cents={totals.available} />
            </span>
          </div>
        </button>
        <div className="hidden md:block">
          <RowActionsMenu
            label={`${group.name} group actions`}
            actions={groupActions}
          />
        </div>
        <button
          type="button"
          className="md:hidden rounded-md px-2 py-1 text-xs font-medium text-accent"
          onClick={() =>
            onOpenMobileActions({
              title: group.name,
              actions: groupActions,
            })
          }
        >
          Actions
        </button>
      </div>

      {expanded && (
        <ExpandedCategoryList
          metricsList={metricsList}
          search={search}
          dragCatId={dragCatId}
          onDragCatStart={onDragCatStart}
          onDropCategory={onDropCategory}
          onEditCategory={onEditCategory}
          onMoveCategory={onMoveCategory}
          onPinCategory={onPinCategory}
          onHideCategory={onHideCategory}
          onArchiveCategory={onArchiveCategory}
          onMergeCategory={onMergeCategory}
          onOpenMobileActions={onOpenMobileActions}
        />
      )}
    </div>
  );
}, areGroupPropsEqual);

function areGroupPropsEqual(
  prev: Readonly<{
    group: CategoryGroup;
    categories: Category[];
    totalCategories: Category[];
    expanded: boolean;
    selected: boolean;
    search: string;
    dragCatId: string | null;
    dragGroupId: string | null;
    monthKey: MonthKey;
  }>,
  next: Readonly<{
    group: CategoryGroup;
    categories: Category[];
    totalCategories: Category[];
    expanded: boolean;
    selected: boolean;
    search: string;
    dragCatId: string | null;
    dragGroupId: string | null;
    monthKey: MonthKey;
  }>,
): boolean {
  return (
    prev.group === next.group &&
    prev.categories === next.categories &&
    prev.totalCategories === next.totalCategories &&
    prev.expanded === next.expanded &&
    prev.selected === next.selected &&
    prev.search === next.search &&
    prev.dragCatId === next.dragCatId &&
    prev.dragGroupId === next.dragGroupId &&
    prev.monthKey === next.monthKey
  );
}

/** Lazy: only mounted while parent group is expanded. */
function ExpandedCategoryList({
  metricsList,
  search,
  dragCatId,
  onDragCatStart,
  onDropCategory,
  onEditCategory,
  onMoveCategory,
  onPinCategory,
  onHideCategory,
  onArchiveCategory,
  onMergeCategory,
  onOpenMobileActions,
}: {
  metricsList: { category: Category; metrics: CatMetrics }[];
  search: string;
  dragCatId: string | null;
  onDragCatStart: (id: string | null) => void;
  onDropCategory: (catId: string) => void;
  onEditCategory: (id: string) => void;
  onMoveCategory: (id: string) => void;
  onPinCategory: (id: string, pinned: boolean) => void;
  onHideCategory: (id: string) => void;
  onArchiveCategory: (id: string) => void;
  onMergeCategory: (id: string) => void;
  onOpenMobileActions: (sheet: {
    title: string;
    actions: { label: string; onClick: () => void; danger?: boolean }[];
  }) => void;
}) {
  return (
    <ul className="border-t border-border divide-y divide-border/70">
      {metricsList.length === 0 && (
        <li className="px-4 py-3 pl-12 text-sm text-muted">
          No categories in this group.
        </li>
      )}
      {metricsList.map(({ category, metrics }) => (
        <CategoryRow
          key={category.id}
          category={category}
          metrics={metrics}
          search={search}
          dragging={dragCatId === category.id}
          onDragStart={() => onDragCatStart(category.id)}
          onDrop={() => onDropCategory(category.id)}
          onEdit={() => onEditCategory(category.id)}
          onMove={() => onMoveCategory(category.id)}
          onPin={() => onPinCategory(category.id, !category.pinned)}
          onHide={() => onHideCategory(category.id)}
          onArchive={() => onArchiveCategory(category.id)}
          onMerge={() => onMergeCategory(category.id)}
          onDelete={() => onEditCategory(category.id)}
          onOpenMobileActions={onOpenMobileActions}
        />
      ))}
    </ul>
  );
}

const CategoryRow = memo(function CategoryRow({
  category,
  metrics,
  search,
  dragging,
  onDragStart,
  onDrop,
  onEdit,
  onMove,
  onPin,
  onHide,
  onArchive,
  onMerge,
  onDelete,
  onOpenMobileActions,
}: {
  category: Category;
  metrics: CatMetrics;
  search: string;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onEdit: () => void;
  onMove: () => void;
  onPin: () => void;
  onHide: () => void;
  onArchive: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onOpenMobileActions: (sheet: {
    title: string;
    actions: { label: string; onClick: () => void; danger?: boolean }[];
  }) => void;
}) {
  const actions = [
    { label: "Edit", onClick: onEdit },
    { label: "Move to another group", onClick: onMove },
    { label: "Set/Edit Target", onClick: onEdit },
    { label: category.pinned ? "Unpin" : "Pin", onClick: onPin },
    { label: "Hide", onClick: onHide },
    { label: "Archive", onClick: onArchive },
    { label: "Merge", onClick: onMerge },
    { label: "Delete", onClick: onDelete, danger: true },
  ];

  return (
    <li
      className={cn(
        "flex items-start gap-2 py-2.5 pl-10 pr-3 md:pl-12",
        dragging && "opacity-40",
      )}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
    >
      <GripVertical
        className="mt-1 hidden h-4 w-4 shrink-0 text-muted md:block"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">
            {highlightMatch(category.name, search)}
          </span>
          {category.hidden && <Badge>Hidden</Badge>}
          {category.isArchived && <Badge>Archived</Badge>}
          {category.pinned && <Badge>Pinned</Badge>}
          {metrics.target != null && <Badge>Target</Badge>}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted sm:grid-cols-4">
          <span>
            Assigned <MoneyText cents={metrics.assigned} />
          </span>
          <span>
            Activity <MoneyText cents={metrics.activity} signed />
          </span>
          <span>
            Available <MoneyText cents={metrics.available} />
          </span>
          <span>
            {metrics.target != null ? (
              <>
                Target <MoneyText cents={metrics.target} />
              </>
            ) : (
              "No target"
            )}
          </span>
          <span>{metrics.txnCount} txn(s)</span>
          <span>
            Last used{" "}
            {metrics.lastUsed ? formatDisplayDate(metrics.lastUsed) : "—"}
          </span>
        </div>
      </div>
      <div className="hidden md:block">
        <RowActionsMenu
          label={`${category.name} actions`}
          actions={actions}
        />
      </div>
      <button
        type="button"
        className="md:hidden rounded-md px-2 py-1 text-xs font-medium text-accent"
        onClick={() =>
          onOpenMobileActions({ title: category.name, actions })
        }
      >
        Actions
      </button>
    </li>
  );
});

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

function MobileActionsSheet({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close actions"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-1">
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  action.onClick();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-black/5",
                  action.danger && "text-danger",
                )}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
