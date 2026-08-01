"use client";

import { useState } from "react";
import { getSelectableCategories } from "@/lib/categories/lifecycle";
import type { BudgetPlan } from "@/lib/types/budget";

export function CategorySelect({
  plan,
  value,
  onChange,
  className,
  allowEmpty = true,
  emptyLabel = "Ready to Assign / none",
  includeHiddenLabel = "Include hidden categories",
}: {
  plan: BudgetPlan;
  value: string;
  onChange: (categoryId: string) => void;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  includeHiddenLabel?: string;
}) {
  const [includeHidden, setIncludeHidden] = useState(false);
  const categories = getSelectableCategories(plan, {
    includeHidden,
  });

  // Ensure current value remains selectable even if hidden
  const current = plan.categories.find((c) => c.id === value);
  const options =
    current && !categories.some((c) => c.id === current.id)
      ? [current, ...categories]
      : categories;

  const groups = plan.categoryGroups
    .filter((g) => !g.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? "input"}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {groups.map((g) => {
          const cats = options.filter((c) => c.groupId === g.id);
          if (cats.length === 0) return null;
          return (
            <optgroup key={g.id} label={g.name}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.hidden ? " (hidden)" : ""}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={includeHidden}
          onChange={(e) => setIncludeHidden(e.target.checked)}
        />
        {includeHiddenLabel}
      </label>
    </div>
  );
}
