"use client";

import { formatMoney, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBudgetStore } from "@/lib/store/budget-store";

export function MoneyText({
  cents,
  className,
  signed = false,
  emphasizeNegative = true,
}: {
  cents: Cents;
  className?: string;
  signed?: boolean;
  emphasizeNegative?: boolean;
}) {
  const hideBalances = useBudgetStore(
    (s) => s.plan.preferences.hideBalances,
  );

  return (
    <span
      className={cn(
        "tabular-nums tracking-tight",
        emphasizeNegative && cents < 0 && "text-danger",
        className,
      )}
    >
      {formatMoney(cents, { hideBalances, signed, showPlus: signed })}
    </span>
  );
}
