"use client";

import { useMemo, useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import { listManagedPayees } from "@/lib/payees/manage";
import { formatDisplayDate } from "@/lib/dates";
import { getSelectableCategories } from "@/lib/categories/lifecycle";

export function PayeesSettings() {
  const plan = useBudgetStore((s) => s.plan);
  const aliasRules = useBudgetStore((s) => s.payeeAliasRules);
  const renamePayee = useBudgetStore((s) => s.renamePayee);
  const mergePayees = useBudgetStore((s) => s.mergePayees);
  const updatePayee = useBudgetStore((s) => s.updatePayee);
  const deletePayee = useBudgetStore((s) => s.deletePayee);
  const savePayeeRule = useBudgetStore((s) => s.savePayeeRule);
  const setSuggestPayeeMemo = useBudgetStore((s) => s.setSuggestPayeeMemo);
  const suggestPayeeMemo = Boolean(plan.preferences.suggestPayeeMemo);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [aliasDraft, setAliasDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => listManagedPayees(plan, aliasRules),
    [plan, aliasRules],
  );

  const filtered = rows.filter((r) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.aliases.some((a) => a.toLowerCase().includes(q))
    );
  });

  const selected = rows.find(
    (r) => (r.payeeId ?? r.name) === selectedId,
  );
  const categories = getSelectableCategories(plan, { includeHidden: true });

  function selectRow(id: string, name: string) {
    setSelectedId(id);
    setRenameValue(name);
    setMergeTarget("");
    setAliasDraft("");
    setError(null);
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Payees</h2>
        <p className="mt-1 text-sm text-muted">
          Search, rename, merge, and set defaults used by the smart Payee field.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Suggest last-used memo when selecting a payee</span>
        <input
          type="checkbox"
          checked={suggestPayeeMemo}
          onChange={(e) => setSuggestPayeeMemo(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search payees or aliases"
        className="input"
      />

      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {filtered.map((r) => {
          const id = r.payeeId ?? r.name;
          const active = selectedId === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => selectRow(id, r.name)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-black/5 ${
                  active ? "bg-accent-muted/40" : ""
                }`}
              >
                <span className="font-medium">
                  {r.name}
                  {r.hidden ? (
                    <span className="ml-2 text-[11px] uppercase text-muted">
                      Hidden
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {r.transactionCount} txn
                  {r.transactionCount === 1 ? "" : "s"}
                  {r.lastUsedDate
                    ? ` · last ${formatDisplayDate(r.lastUsedDate)}`
                    : " · never used"}
                  {r.defaultCategoryId
                    ? ` · default ${
                        plan.categories.find((c) => c.id === r.defaultCategoryId)
                          ?.name ?? "category"
                      }`
                    : ""}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-4 text-sm text-muted">No payees match.</li>
        )}
      </ul>

      {selected && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Manage {selected.name}
          </p>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Rename</span>
            <div className="flex gap-2">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="input flex-1"
              />
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => {
                  const result = renamePayee(
                    selected.payeeId ?? selected.name,
                    renameValue,
                  );
                  if (!result.ok) {
                    setError(result.error ?? "Rename failed");
                    return;
                  }
                  setSelectedId(null);
                }}
              >
                Save
              </button>
            </div>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">
              Default category
            </span>
            <select
              className="input"
              value={selected.payee?.defaultCategoryId ?? ""}
              disabled={!selected.payeeId}
              onChange={(e) => {
                if (!selected.payeeId) return;
                updatePayee(selected.payeeId, {
                  defaultCategoryId: e.target.value || null,
                });
              }}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Default memo</span>
            <input
              className="input"
              disabled={!selected.payeeId}
              defaultValue={selected.payee?.defaultMemo ?? ""}
              key={`${selected.payeeId}-memo`}
              onBlur={(e) => {
                if (!selected.payeeId) return;
                updatePayee(selected.payeeId, {
                  defaultMemo: e.target.value || null,
                });
              }}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">Add alias</span>
            <div className="flex gap-2">
              <input
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                className="input flex-1"
                placeholder="e.g. AMZN MKTP"
              />
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => {
                  if (!aliasDraft.trim()) return;
                  savePayeeRule(aliasDraft.trim(), selected.name);
                  if (selected.payeeId) {
                    const next = [
                      ...(selected.payee?.aliases ?? []),
                      aliasDraft.trim(),
                    ];
                    updatePayee(selected.payeeId, { aliases: next });
                  }
                  setAliasDraft("");
                }}
              >
                Add
              </button>
            </div>
            {(selected.aliases.length > 0 ||
              (selected.payee?.aliases?.length ?? 0) > 0) && (
              <p className="mt-1 text-xs text-muted">
                Aliases:{" "}
                {[
                  ...new Set([
                    ...selected.aliases,
                    ...(selected.payee?.aliases ?? []),
                  ]),
                ].join(", ")}
              </p>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted">
              Merge into another payee
            </span>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
              >
                <option value="">Select target…</option>
                {rows
                  .filter((r) => r.name !== selected.name)
                  .map((r) => (
                    <option key={r.payeeId ?? r.name} value={r.payeeId ?? r.name}>
                      {r.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm"
                disabled={!mergeTarget}
                onClick={() => {
                  const result = mergePayees(
                    selected.payeeId ?? selected.name,
                    mergeTarget,
                  );
                  if (!result.ok) {
                    setError(result.error ?? "Merge failed");
                    return;
                  }
                  setSelectedId(null);
                }}
              >
                Merge
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            {selected.payeeId && (
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() =>
                  updatePayee(selected.payeeId!, {
                    hidden: !selected.hidden,
                  })
                }
              >
                {selected.hidden ? "Unhide" : "Hide"}
              </button>
            )}
            {selected.payeeId && selected.transactionCount === 0 && (
              <button
                type="button"
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger"
                onClick={() => {
                  const result = deletePayee(selected.payeeId!);
                  if (!result.ok) {
                    setError(result.error ?? "Delete failed");
                    return;
                  }
                  setSelectedId(null);
                }}
              >
                Delete
              </button>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
}
