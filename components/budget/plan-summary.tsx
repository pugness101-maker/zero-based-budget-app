"use client";

import { terminology } from "@/lib/brand";
import type { PlanMonthSummary } from "@/lib/types/budget";
import { MoneyText } from "@/components/shared/money-text";
import { DisabledAction } from "@/components/shared/disabled-action";
import { cn } from "@/lib/utils";

export function PlanSummary({ summary }: { summary: PlanMonthSummary }) {
  const ready = summary.readyToAssignCents;

  return (
    <section className="border-b border-border bg-surface px-4 py-4 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {terminology.readyToAssign}
          </p>
          <p
            className={cn(
              "mt-1 text-3xl font-semibold tracking-tight",
              ready > 0 && "text-accent",
              ready < 0 && "text-danger",
            )}
          >
            <MoneyText cents={ready} emphasizeNegative={false} />
          </p>
          <p className="mt-1 text-sm text-muted">
            {ready === 0
              ? "Every dollar has a job this month."
              : ready > 0
                ? "Assign remaining money to categories."
                : "You’ve assigned more than available — cover overspending."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <Stat label={terminology.assigned} cents={summary.totalAssignedCents} />
          <Stat label={terminology.activity} cents={summary.totalActivityCents} signed />
          <Stat label={terminology.available} cents={summary.totalAvailableCents} />
        </div>

        <div className="flex gap-2">
          <DisabledAction
            label={terminology.autoAssign}
            reason="Auto-Assign rules ship in a later Phase 1 increment."
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  cents,
  signed,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold md:text-base">
        <MoneyText cents={cents} signed={signed} />
      </p>
    </div>
  );
}
