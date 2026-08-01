"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import {
  categoryLastUsedDate,
  categoryTransactionCount,
} from "@/lib/categories/lifecycle";
import { MoneyText } from "@/components/shared/money-text";
import { CategoryFormModal } from "@/components/budget/category-form-modal";
import { formatDisplayDate } from "@/lib/dates";

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
  const bulkHideCategories = useBudgetStore((s) => s.bulkHideCategories);
  const bulkUnhideCategories = useBudgetStore((s) => s.bulkUnhideCategories);
  const bulkMoveCategories = useBudgetStore((s) => s.bulkMoveCategories);
  const addCategoryGroup = useBudgetStore((s) => s.addCategoryGroup);
  const renameCategoryGroup = useBudgetStore((s) => s.renameCategoryGroup);
  const deleteCategoryGroup = useBudgetStore((s) => s.deleteCategoryGroup);
  const hideCategoryGroup = useBudgetStore((s) => s.hideCategoryGroup);

  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
          <div className="grid gap-2 sm:grid-cols-2">
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
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-muted">{selected.size} selected</span>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1"
                onClick={() => bulkHideCategories(Array.from(selected))}
              >
                Bulk hide
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1"
                onClick={() => bulkUnhideCategories(Array.from(selected))}
              >
                Bulk unhide
              </button>
              <select
                className="input w-auto text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  bulkMoveCategories(Array.from(selected), e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Bulk move…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-2 py-2 w-8" />
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
                          checked={selected.has(c.id)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            });
                          }}
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Deleted</th>
                <th className="px-2 py-2">Method</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border/70">
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
    </section>
  );
}
