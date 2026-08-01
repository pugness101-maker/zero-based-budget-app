"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildPayeePickerOptions,
  highlightPayeeMatch,
  movePayeeActiveIndex,
  type PayeePickerOption,
} from "@/lib/payees/catalog";
import { formatDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PayeeComboboxValue =
  | {
      mode: "payee";
      payeeName: string;
      payeeId?: string;
      suggestedCategoryId?: string | null;
      suggestedMemo?: string;
    }
  | {
      mode: "transfer";
      payeeName: string;
      transferAccountId: string;
    };

export function PayeeCombobox({
  value,
  onChange,
  currentAccountId,
  disabled,
  placeholder = "Payee",
  className,
  allowTransfers = true,
}: {
  value: string;
  onChange: (next: PayeeComboboxValue) => void;
  currentAccountId?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  allowTransfers?: boolean;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const aliasRules = useBudgetStore((s) => s.payeeAliasRules);
  const suggestMemo = Boolean(plan.preferences.suggestPayeeMemo);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [valueSnapshot, setValueSnapshot] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [listEpoch, setListEpoch] = useState(`${value}|0|false`);
  const [showHiddenTransfers, setShowHiddenTransfers] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  if (value !== valueSnapshot) {
    setValueSnapshot(value);
    setQuery(value);
  }

  const nextEpoch = `${query}|${open ? 1 : 0}|${showHiddenTransfers}`;
  if (nextEpoch !== listEpoch) {
    setListEpoch(nextEpoch);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const options = useMemo(() => {
    const built = buildPayeePickerOptions({
      plan,
      query,
      currentAccountId,
      includeHiddenTransfers: showHiddenTransfers,
      aliasRules,
    });
    return allowTransfers
      ? built
      : built.filter((o) => o.kind !== "transfer");
  }, [
    plan,
    query,
    currentAccountId,
    showHiddenTransfers,
    aliasRules,
    allowTransfers,
  ]);

  function selectOption(opt: PayeePickerOption) {
    if (opt.kind === "transfer") {
      onChange({
        mode: "transfer",
        payeeName: opt.label,
        transferAccountId: opt.accountId,
      });
      setQuery(opt.label);
    } else if (opt.kind === "create") {
      onChange({
        mode: "payee",
        payeeName: opt.name,
      });
      setQuery(opt.name);
    } else {
      onChange({
        mode: "payee",
        payeeName: opt.name,
        payeeId: opt.payeeId,
        suggestedCategoryId: opt.lastCategoryId,
        suggestedMemo: suggestMemo ? opt.lastMemo : undefined,
      });
      setQuery(opt.name);
    }
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => movePayeeActiveIndex(i, 1, options.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => movePayeeActiveIndex(i, -1, options.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) selectOption(opt);
      else if (query.trim()) {
        onChange({ mode: "payee", payeeName: query.trim() });
        setOpen(false);
      }
    }
  }

  function renderList() {
    return (
      <PayeeOptionsList
        options={options}
        query={query}
        activeIndex={activeIndex}
        allowTransfers={allowTransfers}
        showHiddenTransfers={showHiddenTransfers}
        onShowHiddenChange={setShowHiddenTransfers}
        onHover={setActiveIndex}
        onSelect={selectOption}
      />
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange({ mode: "payee", payeeName: e.target.value });
        }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 hidden max-h-80 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg md:block"
        >
          {renderList()}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          data-testid="payee-mobile-sheet"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close payee picker"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Payee</p>
              <input
                value={query}
                autoFocus
                placeholder="Search payees or transfers"
                className="input mt-2"
                onChange={(e) => {
                  setQuery(e.target.value);
                  onChange({ mode: "payee", payeeName: e.target.value });
                }}
                onKeyDown={onKeyDown}
              />
            </div>
            <div className="flex-1 overflow-y-auto">{renderList()}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PayeeOptionsList({
  options,
  query,
  activeIndex,
  allowTransfers,
  showHiddenTransfers,
  onShowHiddenChange,
  onHover,
  onSelect,
}: {
  options: PayeePickerOption[];
  query: string;
  activeIndex: number;
  allowTransfers: boolean;
  showHiddenTransfers: boolean;
  onShowHiddenChange: (v: boolean) => void;
  onHover: (index: number) => void;
  onSelect: (opt: PayeePickerOption) => void;
}) {
  const sections: Array<{
    key: PayeePickerOption["section"];
    label: string;
  }> = [
    { key: "recent", label: "Recent Payees" },
    { key: "all", label: "All Payees" },
    { key: "transfers", label: "Transfers" },
    { key: "create", label: "Create New Payee" },
  ];

  let flatIndex = -1;

  return (
    <>
      {allowTransfers && (
        <label className="flex min-h-11 items-center gap-2 border-b border-border px-3 py-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={showHiddenTransfers}
            onChange={(e) => onShowHiddenChange(e.target.checked)}
          />
          Show hidden accounts
        </label>
      )}
      {options.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted">No matches</p>
      )}
      {sections.map((section) => {
        const items = options.filter((o) => o.section === section.key);
        if (!items.length) return null;
        return (
          <div key={section.key}>
            <p className="sticky top-0 bg-canvas px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {section.label}
            </p>
            <ul>
              {items.map((opt) => {
                flatIndex += 1;
                const index = flatIndex;
                const active = index === activeIndex;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "flex w-full min-h-11 flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-black/5",
                        active && "bg-accent-muted/50",
                      )}
                      onMouseEnter={() => onHover(index)}
                      onClick={() => onSelect(opt)}
                    >
                      <OptionLabel opt={opt} query={query} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function OptionLabel({
  opt,
  query,
}: {
  opt: PayeePickerOption;
  query: string;
}) {
  if (opt.kind === "transfer") {
    return (
      <span className="font-medium">
        <Highlight text={opt.label} query={query} />
      </span>
    );
  }
  if (opt.kind === "create") {
    return (
      <>
        <span className="font-medium">
          Create payee: <Highlight text={opt.name} query={query} />
        </span>
        {opt.nearMatchName ? (
          <span className="text-xs text-muted">
            Near match: {opt.nearMatchName} — select it from All Payees, or
            create this name.
          </span>
        ) : null}
      </>
    );
  }
  return (
    <>
      <span className="font-medium">
        <Highlight text={opt.name} query={query} />
      </span>
      <span className="text-xs text-muted">
        {opt.lastCategoryName ?? "No category"}
        {opt.lastUsedDate ? ` · ${formatDisplayDate(opt.lastUsedDate)}` : ""}
        {opt.transactionCount
          ? ` · ${opt.transactionCount} txn${opt.transactionCount === 1 ? "" : "s"}`
          : ""}
      </span>
    </>
  );
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const parts = highlightPayeeMatch(text, query);
  if (!parts) return text;
  return (
    <>
      {parts.before}
      <mark className="rounded bg-accent-muted px-0.5 text-ink">
        {parts.match}
      </mark>
      {parts.after}
    </>
  );
}
