"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  StickyNote,
  Plus,
} from "lucide-react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import type { CategoryMonthMetrics, GroupMonthMetrics } from "@/lib/types/budget";
import { MoneyText } from "@/components/shared/money-text";
import { parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CategoryInspector } from "@/components/budget/category-inspector";
import { PlanSummary } from "@/components/budget/plan-summary";
import { ImportPrompt } from "@/components/imports/import-prompt";
import { ImportWizard } from "@/components/imports/import-wizard";
import { CategoryFormModal } from "@/components/budget/category-form-modal";
import { RowActionsMenu } from "@/components/budget/row-actions-menu";

export function PlanGrid() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const toggleGroupCollapsed = useBudgetStore((s) => s.toggleGroupCollapsed);
  const setSelectedCategory = useBudgetStore((s) => s.setSelectedCategory);
  const setAssigned = useBudgetStore((s) => s.setAssigned);
  const addCategoryGroup = useBudgetStore((s) => s.addCategoryGroup);
  const renameCategoryGroup = useBudgetStore((s) => s.renameCategoryGroup);
  const hideCategoryGroup = useBudgetStore((s) => s.hideCategoryGroup);
  const deleteCategoryGroup = useBudgetStore((s) => s.deleteCategoryGroup);
  const mergeCategoryGroups = useBudgetStore((s) => s.mergeCategoryGroups);
  const reorderCategoryGroups = useBudgetStore((s) => s.reorderCategoryGroups);
  const hideCategory = useBudgetStore((s) => s.hideCategory);
  const editCategory = useBudgetStore((s) => s.editCategory);
  const moveCategory = useBudgetStore((s) => s.moveCategory);
  const reorderCategories = useBudgetStore((s) => s.reorderCategories);
  const mergeCategories = useBudgetStore((s) => s.mergeCategories);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState<{
    mode: "add" | "edit";
    categoryId?: string;
    groupId?: string;
  } | null>(null);
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);

  const summary = buildPlanMonthSummary(plan, monthKey);
  const activeGroups = plan.categoryGroups
    .filter((g) => !g.deletedAt && !g.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function openAddCategory(groupId?: string) {
    setCategoryModal({
      mode: "add",
      groupId: groupId ?? activeGroups[0]?.id,
    });
  }

  return (
    <div>
      <ImportPrompt onImport={() => setWizardOpen(true)} />
      <PlanSummary summary={summary} />

      <div className="flex flex-wrap gap-2 px-4 md:px-6 pt-2">
        <button
          type="button"
          onClick={() => openAddCategory()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
        <button
          type="button"
          onClick={() => {
            const name = prompt("New category group name?");
            if (!name?.trim()) return;
            const result = addCategoryGroup(name);
            if (!result.ok) alert(result.error);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          <Plus className="h-4 w-4" />
          Add Category Group
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block px-4 py-4 md:px-6">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold w-28">Assigned</th>
                <th className="px-3 py-2.5 font-semibold w-28">Activity</th>
                <th className="px-3 py-2.5 font-semibold w-28">Available</th>
                <th className="px-3 py-2.5 w-12" />
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((group) => (
                <GroupRows
                  key={group.groupId}
                  group={group}
                  collapsed={Boolean(
                    plan.categoryGroups.find((g) => g.id === group.groupId)
                      ?.collapsed,
                  )}
                  onToggle={() => toggleGroupCollapsed(group.groupId)}
                  onSelect={setSelectedCategory}
                  onAssign={setAssigned}
                  onAddCategory={() => openAddCategory(group.groupId)}
                  onRenameGroup={() => {
                    const name = prompt("Rename group", group.name);
                    if (!name?.trim()) return;
                    const result = renameCategoryGroup(group.groupId, name);
                    if (!result.ok) alert(result.error);
                  }}
                  onHideGroup={() => hideCategoryGroup(group.groupId, true)}
                  onDeleteGroup={() => {
                    const result = deleteCategoryGroup(group.groupId);
                    if (!result.ok) alert(result.error);
                  }}
                  onMergeGroup={() => {
                    const dest = prompt(
                      "Merge into group id (see Settings → Categories for ids), or type destination group name:",
                    );
                    if (!dest?.trim()) return;
                    const destGroup =
                      plan.categoryGroups.find((g) => g.id === dest.trim()) ??
                      plan.categoryGroups.find(
                        (g) =>
                          g.name.toLowerCase() === dest.trim().toLowerCase(),
                      );
                    if (!destGroup) {
                      alert("Destination group not found.");
                      return;
                    }
                    const result = mergeCategoryGroups(
                      group.groupId,
                      destGroup.id,
                    );
                    if (!result.ok) alert(result.error);
                  }}
                  onMoveGroupUp={() => {
                    const ids = activeGroups.map((g) => g.id);
                    const idx = ids.indexOf(group.groupId);
                    if (idx <= 0) return;
                    const next = [...ids];
                    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
                    reorderCategoryGroups(next);
                  }}
                  onMoveGroupDown={() => {
                    const ids = activeGroups.map((g) => g.id);
                    const idx = ids.indexOf(group.groupId);
                    if (idx < 0 || idx >= ids.length - 1) return;
                    const next = [...ids];
                    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
                    reorderCategoryGroups(next);
                  }}
                  dragCatId={dragCatId}
                  onDragCatStart={setDragCatId}
                  onDropCat={(targetCatId) => {
                    if (!dragCatId || dragCatId === targetCatId) return;
                    const cats = plan.categories
                      .filter(
                        (c) =>
                          c.groupId === group.groupId &&
                          !c.deletedAt &&
                          !c.hidden,
                      )
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    const ids = cats.map((c) => c.id);
                    const from = ids.indexOf(dragCatId);
                    const to = ids.indexOf(targetCatId);
                    if (from < 0) {
                      // cross-group move
                      moveCategory(dragCatId, group.groupId, Math.max(0, to));
                    } else if (to >= 0) {
                      const next = [...ids];
                      next.splice(from, 1);
                      next.splice(to, 0, dragCatId);
                      reorderCategories(group.groupId, next);
                    }
                    setDragCatId(null);
                  }}
                  onEditCategory={(id) =>
                    setCategoryModal({ mode: "edit", categoryId: id })
                  }
                  onHideCategory={(id) => hideCategory(id)}
                  onPinCategory={(id, pinned) =>
                    editCategory(id, { pinned })
                  }
                  onMoveCategory={(id) => {
                    const groupName = prompt(
                      "Move to group name:",
                      plan.categoryGroups.find((g) => g.id === group.groupId)
                        ?.name,
                    );
                    if (!groupName?.trim()) return;
                    const dest = plan.categoryGroups.find(
                      (g) =>
                        g.name.toLowerCase() === groupName.trim().toLowerCase(),
                    );
                    if (!dest) {
                      alert("Group not found.");
                      return;
                    }
                    const result = moveCategory(id, dest.id);
                    if (!result.ok) alert(result.error);
                  }}
                  onMergeCategory={(id) => {
                    const destName = prompt("Merge into category name:");
                    if (!destName?.trim()) return;
                    const dest = plan.categories.find(
                      (c) =>
                        !c.deletedAt &&
                        c.name.toLowerCase() === destName.trim().toLowerCase(),
                    );
                    if (!dest) {
                      alert("Destination category not found.");
                      return;
                    }
                    if (
                      !confirm(
                        `Merge into ${dest.name}? History will be preserved.`,
                      )
                    ) {
                      return;
                    }
                    const result = mergeCategories(id, dest.id);
                    if (!result.ok) alert(result.error);
                  }}
                  dragGroupId={dragGroupId}
                  onDragGroupStart={setDragGroupId}
                  onDropGroup={() => {
                    if (!dragGroupId || dragGroupId === group.groupId) {
                      setDragGroupId(null);
                      return;
                    }
                    const ids = activeGroups.map((g) => g.id);
                    const from = ids.indexOf(dragGroupId);
                    const to = ids.indexOf(group.groupId);
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
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3 px-3 py-3">
        {summary.groups.map((group) => {
          const collapsed = Boolean(
            plan.categoryGroups.find((g) => g.id === group.groupId)?.collapsed,
          );
          return (
            <section
              key={group.groupId}
              className="rounded-xl border border-border bg-surface overflow-hidden"
            >
              <div className="flex items-center gap-1 px-2 py-2">
                <button
                  type="button"
                  onClick={() => toggleGroupCollapsed(group.groupId)}
                  className="flex min-w-0 flex-1 items-center justify-between px-1 py-1 text-left"
                >
                  <span className="font-semibold truncate">{group.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <MoneyText cents={group.availableCents} />
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>
                <RowActionsMenu
                  label={`${group.name} group actions`}
                  actions={[
                    {
                      label: "Add Category",
                      onClick: () => openAddCategory(group.groupId),
                    },
                    {
                      label: "Rename",
                      onClick: () => {
                        const name = prompt("Rename group", group.name);
                        if (!name?.trim()) return;
                        renameCategoryGroup(group.groupId, name);
                      },
                    },
                    {
                      label: "Hide group",
                      onClick: () => hideCategoryGroup(group.groupId, true),
                    },
                  ]}
                />
              </div>
              {!collapsed && (
                <ul className="divide-y divide-border border-t border-border">
                  {group.categories.map((cat) => (
                    <li key={cat.categoryId} className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(cat.categoryId)}
                        className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium flex items-center gap-1.5">
                            {cat.name}
                            {cat.notes && (
                              <StickyNote className="h-3.5 w-3.5 text-muted" />
                            )}
                            {cat.overspendingType && (
                              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            )}
                          </span>
                          <MoneyText
                            cents={cat.availableCents}
                            className="font-semibold"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted">
                          <span>
                            Assigned <MoneyText cents={cat.assignedCents} />
                          </span>
                          <span>
                            Activity{" "}
                            <MoneyText cents={cat.activityCents} signed />
                          </span>
                        </div>
                      </button>
                      <div className="pt-3 pr-2">
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Edit",
                              onClick: () =>
                                setCategoryModal({
                                  mode: "edit",
                                  categoryId: cat.categoryId,
                                }),
                            },
                            {
                              label: "Move",
                              onClick: () => {
                                const groupName = prompt("Move to group name:");
                                if (!groupName?.trim()) return;
                                const dest = plan.categoryGroups.find(
                                  (g) =>
                                    g.name.toLowerCase() ===
                                    groupName.trim().toLowerCase(),
                                );
                                if (!dest) return;
                                moveCategory(cat.categoryId, dest.id);
                              },
                            },
                            {
                              label: "Hide",
                              onClick: () => hideCategory(cat.categoryId),
                            },
                          ]}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <CategoryInspector
        onEditCategory={(id) =>
          setCategoryModal({ mode: "edit", categoryId: id })
        }
      />
      <CategoryFormModal
        open={Boolean(categoryModal)}
        onClose={() => setCategoryModal(null)}
        mode={categoryModal?.mode ?? "add"}
        categoryId={categoryModal?.categoryId}
        defaultGroupId={categoryModal?.groupId}
      />
      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}

function GroupRows({
  group,
  collapsed,
  onToggle,
  onSelect,
  onAssign,
  onAddCategory,
  onRenameGroup,
  onHideGroup,
  onDeleteGroup,
  onMergeGroup,
  onMoveGroupUp,
  onMoveGroupDown,
  dragCatId,
  onDragCatStart,
  onDropCat,
  onEditCategory,
  onHideCategory,
  onPinCategory,
  onMoveCategory,
  onMergeCategory,
  onDragGroupStart,
  onDropGroup,
}: {
  group: GroupMonthMetrics;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAssign: (id: string, cents: number) => void;
  onAddCategory: () => void;
  onRenameGroup: () => void;
  onHideGroup: () => void;
  onDeleteGroup: () => void;
  onMergeGroup: () => void;
  onMoveGroupUp: () => void;
  onMoveGroupDown: () => void;
  dragCatId: string | null;
  onDragCatStart: (id: string | null) => void;
  onDropCat: (targetCatId: string) => void;
  onEditCategory: (id: string) => void;
  onHideCategory: (id: string) => void;
  onPinCategory: (id: string, pinned: boolean) => void;
  onMoveCategory: (id: string) => void;
  onMergeCategory: (id: string) => void;
  dragGroupId: string | null;
  onDragGroupStart: (id: string | null) => void;
  onDropGroup: () => void;
}) {
  const plan = useBudgetStore((s) => s.plan);
  return (
    <>
      <tr
        className="bg-canvas/80 border-t border-border"
        draggable
        onDragStart={() => onDragGroupStart(group.groupId)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onDropGroup();
        }}
      >
        <td colSpan={5} className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left font-semibold hover:bg-black/5"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>{group.name}</span>
              <span className="ml-auto text-xs font-normal text-muted tabular-nums">
                <MoneyText cents={group.availableCents} /> available
              </span>
            </button>
            <RowActionsMenu
              label={`${group.name} group actions`}
              actions={[
                { label: "Add Category", onClick: onAddCategory },
                { label: "Rename", onClick: onRenameGroup },
                { label: "Move up", onClick: onMoveGroupUp },
                { label: "Move down", onClick: onMoveGroupDown },
                { label: "Hide", onClick: onHideGroup },
                { label: "Merge Group", onClick: onMergeGroup },
                { label: "Delete Group", onClick: onDeleteGroup, danger: true },
              ]}
            />
          </div>
        </td>
      </tr>
      {!collapsed &&
        group.categories.map((cat) => {
          const meta = plan.categories.find((c) => c.id === cat.categoryId);
          return (
            <CategoryRow
              key={cat.categoryId}
              category={cat}
              pinned={Boolean(meta?.pinned)}
              onSelect={() => onSelect(cat.categoryId)}
              onAssign={(cents) => onAssign(cat.categoryId, cents)}
              draggable
              dragging={dragCatId === cat.categoryId}
              onDragStart={() => onDragCatStart(cat.categoryId)}
              onDrop={() => onDropCat(cat.categoryId)}
              actions={[
                { label: "Edit", onClick: () => onEditCategory(cat.categoryId) },
                { label: "Move", onClick: () => onMoveCategory(cat.categoryId) },
                {
                  label: "Set/Edit Target",
                  onClick: () => onSelect(cat.categoryId),
                },
                {
                  label: meta?.pinned ? "Unpin" : "Pin",
                  onClick: () =>
                    onPinCategory(cat.categoryId, !meta?.pinned),
                },
                {
                  label: "Hide",
                  onClick: () => onHideCategory(cat.categoryId),
                },
                {
                  label: "Merge",
                  onClick: () => onMergeCategory(cat.categoryId),
                },
                {
                  label: "Delete",
                  onClick: () => onEditCategory(cat.categoryId),
                  danger: true,
                },
              ]}
            />
          );
        })}
    </>
  );
}

function CategoryRow({
  category,
  pinned,
  onSelect,
  onAssign,
  draggable: canDrag,
  dragging,
  onDragStart,
  onDrop,
  actions,
}: {
  category: CategoryMonthMetrics;
  pinned?: boolean;
  onSelect: () => void;
  onAssign: (cents: number) => void;
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: () => void;
  onDrop?: () => void;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const startEdit = () => {
    setValue((category.assignedCents / 100).toFixed(2));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseMoneyInput(value);
    if (parsed !== null && parsed >= 0) onAssign(parsed);
    setEditing(false);
  };

  return (
    <tr
      className={cn(
        "border-t border-border/70 hover:bg-accent-muted/40",
        dragging && "opacity-50",
      )}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.();
      }}
    >
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-left font-medium hover:text-accent"
        >
          {category.name}
          {pinned && (
            <span className="text-[10px] uppercase tracking-wide text-accent">
              Pin
            </span>
          )}
          {category.notes && <StickyNote className="h-3.5 w-3.5 text-muted" />}
          {category.overspendingType && (
            <span
              className="inline-flex items-center gap-1 text-xs text-warning"
              title={
                category.overspendingType === "credit"
                  ? "Credit overspending"
                  : "Cash overspending"
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {category.overspendingType === "credit" ? "Credit" : "Cash"}
            </span>
          )}
        </button>
        <div className="mt-1 max-w-[14rem]">
          <Progress
            assigned={category.assignedCents}
            target={category.targetAmountCents}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-24 rounded-md border border-accent bg-white px-2 py-1 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label={`Assigned for ${category.name}`}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-md px-2 py-1 tabular-nums hover:bg-black/5"
          >
            <MoneyText cents={category.assignedCents} />
          </button>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <MoneyText cents={category.activityCents} signed />
      </td>
      <td
        className={cn(
          "px-3 py-2 font-semibold tabular-nums",
          category.availableCents < 0 && "text-danger",
        )}
      >
        <button type="button" onClick={onSelect} className="hover:underline">
          <MoneyText cents={category.availableCents} />
        </button>
      </td>
      <td className="px-2 py-2 text-right">
        <RowActionsMenu actions={actions} />
      </td>
    </tr>
  );
}

function Progress({
  assigned,
  target,
}: {
  assigned: number;
  target: number | null;
}) {
  if (target === null || target <= 0) return null;
  const pct = Math.min(100, Math.round((assigned / target) * 100));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-black/5"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= 100 ? "bg-success" : "bg-accent",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
