"use client";

import { useState } from "react";
import { getActiveAccounts, isAccountClosed } from "@/lib/accounts/lifecycle";
import type { Account } from "@/lib/types/budget";

export function AccountSelect({
  accounts,
  value,
  onChange,
  className,
  includeHiddenClosedLabel = "Include hidden and closed",
  allowClosed = false,
  filter,
}: {
  accounts: Account[];
  value: string;
  onChange: (accountId: string) => void;
  className?: string;
  includeHiddenClosedLabel?: string;
  /** When false (default), closed accounts cannot be selected even if shown */
  allowClosed?: boolean;
  filter?: (account: Account) => boolean;
}) {
  const [includeHiddenClosed, setIncludeHiddenClosed] = useState(false);

  const list = getActiveAccounts(accounts, {
    includeHidden: includeHiddenClosed,
    includeClosed: includeHiddenClosed,
  }).filter((a) => (filter ? filter(a) : true));

  const options = allowClosed
    ? list
    : list.filter((a) => !isAccountClosed(a));

  return (
    <div className="space-y-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? "input"}
      >
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.isHidden ? " (hidden)" : ""}
            {isAccountClosed(a) ? " (closed)" : ""}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={includeHiddenClosed}
          onChange={(e) => setIncludeHiddenClosed(e.target.checked)}
        />
        {includeHiddenClosedLabel}
      </label>
    </div>
  );
}
