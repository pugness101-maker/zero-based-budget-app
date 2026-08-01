"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildGroupedAccountOptions,
  type AccountPickerOption,
} from "@/lib/goals/selectors";
import { MoneyText } from "@/components/shared/money-text";
import type { BudgetPlan } from "@/lib/types/budget";
import { cn } from "@/lib/utils";

export function GoalAccountCombobox({
  plan,
  value,
  onChange,
  excludeAccountIds,
}: {
  plan: BudgetPlan;
  value: string;
  onChange: (accountId: string) => void;
  excludeAccountIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [includeHiddenClosed, setIncludeHiddenClosed] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () =>
      buildGroupedAccountOptions({
        plan,
        query,
        includeHiddenClosed,
        excludeAccountIds,
      }),
    [plan, query, includeHiddenClosed, excludeAccountIds],
  );

  const selected = plan.accounts.find((a) => a.id === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function select(opt: AccountPickerOption) {
    if (opt.disabled) return;
    onChange(opt.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className="input flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn(!selected && "text-muted")}>
          {selected ? selected.name : "Select account…"}
        </span>
      </button>

      {open && (
        <div
          id={listId}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg flex flex-col"
        >
          <div className="border-b border-border p-2 space-y-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts"
              className="input"
            />
            <label className="flex items-center gap-2 text-[11px] text-muted px-0.5">
              <input
                type="checkbox"
                checked={includeHiddenClosed}
                onChange={(e) => setIncludeHiddenClosed(e.target.checked)}
              />
              Show hidden/closed accounts
            </label>
          </div>
          <div className="overflow-y-auto flex-1">
            {groups.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted">No matches</p>
            )}
            {groups.map((group) => (
              <div key={group.section}>
                <p className="sticky top-0 bg-canvas px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {group.section}
                </p>
                <ul>
                  {group.accounts.map((opt) => (
                    <li key={opt.id}>
                      <button
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => select(opt)}
                        className={cn(
                          "flex w-full min-h-10 items-center justify-between gap-2 py-2 pl-6 pr-3 text-left text-sm hover:bg-black/5",
                          opt.id === value && "bg-accent-muted/40",
                          opt.disabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <span className="flex flex-col items-start">
                          <span>{opt.name}</span>
                          <span className="text-[10px] text-muted">
                            {opt.hidden ? "Hidden · " : ""}
                            {opt.closed ? "Closed · " : ""}
                            <MoneyText cents={opt.balanceCents} signed />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
