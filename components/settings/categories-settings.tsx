"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildPlanMonthSummary, getCategoryAvailable } from "@/lib/calculations/plan";
import {
  categoryLastUsedDate,
  categoryTransactionCount,
} from "@/lib/categories/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { CategoryFormModal } from "@/components/budget/category-form-modal";
import { formatDisplayDate } from "@/lib/dates";
import { CategoryBulkBar } from "@/components/budget/category-bulk-bar";
import {
  CategoryBulkDialogs,
  type BulkDialogKind,
} from "@/components/budget/category-bulk-dialogs";
import { setManyInSet, toggleIdInSet } from "@/lib/categories/selection";

type Tab = "active" | "hidden" | "archived" | "deleted" | "groups";

const DELETION_LABELS: Record<string, string> = {
  empty: "Unused delete",
  budget_history: "Deleted with budget history",
  move_then_delete: "Moved history, then deleted",
  archive: "Archived",
  force_uncategorized: "Force → Uncategorized",
  merge: "Merged",
  purge: "Purged",
};

export function CategoriesSettings() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const unhideCategory = useBudgetStore((s) => s.unhideCategory);
  const hideCategory = useBudgetStore((s) => s.hideCategory);
  const unarchiveCategory = useBudgetStore((s) => s.unarchiveCategory);
  const restoreCategory = useBudgetStore((s) => s.restoreCategory);
  const purgeCategory = useBudgetStore((s) => s.purgeCategory);
  const bulkUnhideCategories = useBudgetStore((s) => s.bulkUnhideCategories);
  const bulkRestoreCategories = useBudgetStore((s) => s.bulkRestoreCategories);
  const bulkMoveCategories = useBudgetStore((s) => s.bulkMoveCategories);
  const addCategoryGroup = useBudgetStore((s) => s.addCategoryGroup);
  const renameCategoryGroup = useBudgetStore((s) => s.renameCategoryGroup);
  const deleteCategoryGroup = useBudgetStore((s) => s.deleteCategoryGroup);
  const hideCategoryGroup = useBudgetStore((s) => s.hideCategoryGroup);
  const mergeCategoryGroups = useBudgetStore((s) => s.mergeCategoryGroups);

  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [hasTxns, setHasTxns] = useState(false);
  const [hasTarget, setHasTarget] = useState(false);
  const [hasAvailable, setHasAvailable] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<BulkDialogKind>(null);
  const [modal, setModal] = useState<{
    mode: "add" | "edit";
    categoryId?: string;
    groupId?: string;
  } | null>(null);

  const summary = buildPlanMonthSummary(plan, monthKey);
  const metrics = useMemo(() => {
    const map = new Map<
      string,
      { assigned: number; activity: number; available: number; target: number | null }
    >();
    for (const g of summary.groups) {
      for (const c of g.categories) {
        map.set(c.categoryId, {
          assigned: c.assignedCents,
          activity: c.activityCents,
          available: c.availableCents,
          target: c.targetAmountCents,
        });
      }
    }
    return map;
  }, [summary]);

  const categories = plan.categories.filter((c) => {
    if (tab === "deleted") return Boolean(c.deletedAt);
    if (c.deletedAt) return false;
    if (tab === "active") return !c.hidden && !c.isArchived;
    if (tab === "hidden") return c.hidden && !c.isArchived;
    if (tab === "archived") return Boolean(c.isArchived);
    return false;
  });

  const filtered = categories.filter((c) => {
    if (groupFilter && c.groupId !== groupFilter) return false;
    if (statusFilter === "hidden" && !c.hidden) return false;
    if (statusFilter === "archived" && !c.isArchived) return false;
    if (hasTxns && categoryTransactionCount(plan.transactions, c.id) === 0) {
      return false;
    }
    if (hasTarget && !plan.targets.some((t) => t.categoryId === c.id)) {
      return false;
    }
    if (hasAvailable) {
      const avail = getCategoryAvailable(plan, c, monthKey);
      if (avail === 0) return false;
    }
    if (!query.trim()) return true;
    return c.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const groups = plan.categoryGroups
    .filter((g) => !g.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Categories</h2>
          <p className="mt-1 text-sm text-muted">
            Manage categories and groups. Hidden categories stay in history and
            reports.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setModal({ mode: "add", groupId: groups[0]?.id })
          }
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Add Category
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["active", "Active"],
            ["hidden", "Hidden"],
            ["archived", "Archived"],
            ["deleted", "Deleted / Recently Removed"],
            ["groups", "Category Groups"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === id
                ? "bg-accent-muted text-accent"
                : "text-muted hover:bg-black/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "groups" && tab !== "deleted" && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories"
              className="input"
            />
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="input"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              <option value="">Any status</option>
              <option value="hidden">Hidden</option>
              <option value="archived">Archived</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={hasTxns}
                onChange={(e) => setHasTxns(e.target.checked)}
              />
              Has transactions
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={hasTarget}
                onChange={(e) => setHasTarget(e.target.checked)}
              />
              Has target
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={hasAvailable}
                onChange={(e) => setHasAvailable(e.target.checked)}
              />
              Has available balance
            </label>
          </div>

          {selected.size > 0 && (
            <CategoryBulkBar
              selectedCount={selected.size}
              showSelectAll
              onSelectAll={() =>
                setSelected(new Set(filtered.map((c) => c.id)))
              }
              onHide={
                tab === "active"
                  ? () => setBulkDialog("hide")
                  : undefined
              }
              onArchive={() => setBulkDialog("archive")}
              onMove={() => setBulkDialog("move")}
              onMerge={() => setBulkDialog("merge")}
              onDelete={() => setBulkDialog("delete")}
              onClear={() => setSelected(new Set())}
              extraActions={
                <>
                  {(tab === "hidden" || tab === "archived") && (
                    <button
                      type="button"
                      className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
                      onClick={() => {
                        if (tab === "hidden") {
                          bulkUnhideCategories(Array.from(selected));
                        } else {
                          bulkRestoreCategories(Array.from(selected));
                        }
                        setSelected(new Set());
                      }}
                    >
                      {tab === "hidden" ? "Unhide" : "Restore"}
                    </button>
                  )}
                </>
              }
            />
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all visible categories"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((c) => selected.has(c.id))
                      }
                      ref={(el) => {
                        if (!el) return;
                        const some = filtered.some((c) => selected.has(c.id));
                        const all =
                          filtered.length > 0 &&
                          filtered.every((c) => selected.has(c.id));
                        el.indeterminate = some && !all;
                      }}
                      onChange={(e) => {
                        setSelected(
                          setManyInSet(
                            selected,
                            filtered.map((c) => c.id),
                            e.target.checked,
                          ),
                        );
                      }}
                    />
                  </th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Group</th>
                  <th className="px-2 py-2 text-right">Assigned</th>
                  <th className="px-2 py-2 text-right">Activity</th>
                  <th className="px-2 py-2 text-right">Available</th>
                  <th className="px-2 py-2 text-right">Txns</th>
                  <th className="px-2 py-2">Last used</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const group = groups.find((g) => g.id === c.groupId);
                  const m = metrics.get(c.id);
                  const last = categoryLastUsedDate(plan.transactions, c.id);
                  const count = categoryTransactionCount(
                    plan.transactions,
                    c.id,
                  );
                  return (
                    <tr key={c.id} className="border-t border-border/70">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selected.has(c.id)}
                          onChange={() =>
                            setSelected(toggleIdInSet(selected, c.id))
                          }
                        />
                      </td>
                      <td className="px-2 py-2 font-medium">{c.name}</td>
                      <td className="px-2 py-2 text-muted">{group?.name}</td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText cents={m?.assigned ?? 0} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText cents={m?.activity ?? 0} signed />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText cents={m?.available ?? 0} />
                      </td>
                      <td className="px-2 py-2 text-right">{count}</td>
                      <td className="px-2 py-2 text-muted">
                        {last ? formatDisplayDate(last) : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted">
                        {c.isArchived
                          ? "Archived"
                          : c.hidden
                            ? "Hidden"
                            : "Active"}
                      </td>
                      <td className="px-2 py-2 text-right space-x-2 whitespace-nowrap">
                        {tab !== "archived" && (
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline"
                            onClick={() =>
                              setModal({ mode: "edit", categoryId: c.id })
                            }
                          >
                            Edit
                          </button>
                        )}
                        {tab === "archived" ? (
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline"
                            onClick={() => unarchiveCategory(c.id)}
                          >
                            Restore
                          </button>
                        ) : c.hidden ? (
                          <button
                            type="button"
                            className="text-xs text-accent hover:underline"
                            onClick={() => unhideCategory(c.id)}
                          >
                            Unhide
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted hover:underline"
                            onClick={() => hideCategory(c.id)}
                          >
                            Hide
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted">No categories here.</p>
            )}
          </div>
        </>
      )}

      {tab === "deleted" && (
        <div className="space-y-3">
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => {
                  bulkRestoreCategories(Array.from(selected));
                  setSelected(new Set());
                }}
              >
                Restore selected
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger"
                onClick={() => {
                  if (!confirm("Purge selected categories where safe?")) return;
                  for (const id of selected) {
                    purgeCategory(id);
                  }
                  setSelected(new Set());
                }}
              >
                Purge where safe
              </button>
            </div>
          )}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-2 py-2 w-8" />
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Deleted</th>
                <th className="px-2 py-2">Method</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border/70">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name}`}
                      checked={selected.has(c.id)}
                      onChange={() =>
                        setSelected(toggleIdInSet(selected, c.id))
                      }
                    />
                  </td>
                  <td className="px-2 py-2 font-medium">{c.name}</td>
                  <td className="px-2 py-2 text-muted">
                    {c.deletedAt
                      ? formatDisplayDate(c.deletedAt.slice(0, 10))
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-xs text-muted">
                    {c.deletionMethod
                      ? (DELETION_LABELS[c.deletionMethod] ?? c.deletionMethod)
                      : "Removed"}
                    {c.mergedIntoCategoryId
                      ? ` → ${plan.categories.find((x) => x.id === c.mergedIntoCategoryId)?.name ?? "category"}`
                      : ""}
                  </td>
                  <td className="px-2 py-2 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      onClick={() => {
                        const result = restoreCategory(c.id);
                        if (!result.ok) alert(result.error);
                      }}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => {
                        if (
                          !confirm(
                            "Permanently purge this category? This cannot be undone from Settings.",
                          )
                        ) {
                          return;
                        }
                        const result = purgeCategory(c.id);
                        if (!result.ok) alert(result.error);
                      }}
                    >
                      Purge
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted">
              No recently removed categories.
            </p>
          )}
        </div>
        </div>
      )}

      {tab === "groups" && (
        <div className="space-y-3">
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
          {selectedGroups.size > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-muted">{selectedGroups.size} groups</span>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2"
                onClick={() => {
                  for (const id of selectedGroups) {
                    hideCategoryGroup(id, true);
                  }
                  setSelectedGroups(new Set());
                }}
              >
                Hide groups
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2"
                onClick={() => {
                  for (const id of selectedGroups) {
                    hideCategoryGroup(id, false);
                  }
                  setSelectedGroups(new Set());
                }}
              >
                Unhide groups
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2"
                onClick={() => {
                  const destName = prompt(
                    "Move all categories in selected groups to group name:",
                  );
                  if (!destName?.trim()) return;
                  const dest = groups.find(
                    (g) =>
                      g.name.toLowerCase() === destName.trim().toLowerCase(),
                  );
                  if (!dest) {
                    alert("Destination group not found.");
                    return;
                  }
                  const catIds = plan.categories
                    .filter(
                      (c) =>
                        selectedGroups.has(c.groupId) &&
                        !c.deletedAt &&
                        c.groupId !== dest.id,
                    )
                    .map((c) => c.id);
                  if (catIds.length) {
                    bulkMoveCategories(catIds, dest.id);
                  }
                  setSelectedGroups(new Set());
                }}
              >
                Move categories…
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2"
                onClick={() => {
                  const ids = Array.from(selectedGroups);
                  if (ids.length < 2) {
                    alert("Select at least two groups to merge.");
                    return;
                  }
                  const [dest, ...sources] = ids;
                  for (const src of sources) {
                    const result = mergeCategoryGroups(src!, dest!);
                    if (!result.ok) alert(result.error);
                  }
                  setSelectedGroups(new Set());
                }}
              >
                Merge groups
              </button>
              <button
                type="button"
                className="rounded-lg border border-danger/40 px-3 py-2 text-danger"
                onClick={() => {
                  for (const id of selectedGroups) {
                    const result = deleteCategoryGroup(id);
                    if (!result.ok) alert(result.error);
                  }
                  setSelectedGroups(new Set());
                }}
              >
                Delete empty groups
              </button>
            </div>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {groups.map((g) => {
              const count = plan.categories.filter(
                (c) => c.groupId === g.id && !c.deletedAt,
              ).length;
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--accent)]"
                      aria-label={`Select group ${g.name}`}
                      checked={selectedGroups.has(g.id)}
                      onChange={() =>
                        setSelectedGroups(toggleIdInSet(selectedGroups, g.id))
                      }
                    />
                    <div>
                    <p className="font-medium">
                      {g.name}
                      {g.hidden ? (
                        <span className="ml-2 text-xs text-muted">Hidden</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {count} categor{count === 1 ? "y" : "ies"}
                    </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-accent hover:underline"
                      onClick={() => {
                        const name = prompt("Rename group", g.name);
                        if (!name?.trim()) return;
                        renameCategoryGroup(g.id, name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="text-xs text-muted hover:underline"
                      onClick={() => hideCategoryGroup(g.id, !g.hidden)}
                    >
                      {g.hidden ? "Unhide" : "Hide"}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => {
                        const result = deleteCategoryGroup(g.id);
                        if (!result.ok) alert(result.error);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <CategoryFormModal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        mode={modal?.mode ?? "add"}
        categoryId={modal?.categoryId}
        defaultGroupId={modal?.groupId}
      />
      <CategoryBulkDialogs
        kind={bulkDialog}
        categoryIds={Array.from(selected)}
        onClose={() => setBulkDialog(null)}
        onApplied={() => setSelected(new Set())}
      />
    </section>
  );
}
