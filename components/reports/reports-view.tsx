"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  buildReportDataset,
  defaultReportFilters,
  type ReportFilters,
} from "@/lib/calculations/reports";
import { MoneyText } from "@/components/shared/money-text";
import { formatDisplayDate } from "@/lib/dates";
import { centsToDollars, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "#0F766E",
  "#0D9488",
  "#14B8A6",
  "#5EEAD4",
  "#115E59",
  "#334155",
  "#64748B",
  "#94A3B8",
];

export function ReportsView() {
  const plan = useBudgetStore((s) => s.plan);
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const hideBalances = plan.preferences.hideBalances;

  const [filters, setFilters] = useState<ReportFilters>(() =>
    defaultReportFilters(monthKey),
  );

  // Keep range in sync when month changes via top bar
  const effectiveFilters = useMemo(() => {
    const defaults = defaultReportFilters(monthKey);
    // If user hasn't customized away from a full month, follow month selector
    const followsMonth =
      filters.startDate.endsWith("-01") &&
      filters.startDate.slice(0, 7) === filters.endDate.slice(0, 7);
    if (followsMonth && filters.startDate.slice(0, 7) !== monthKey) {
      return {
        ...filters,
        startDate: defaults.startDate,
        endDate: defaults.endDate,
      };
    }
    return filters;
  }, [filters, monthKey]);

  const dataset = useMemo(
    () => buildReportDataset(plan, effectiveFilters, monthKey),
    [plan, effectiveFilters, monthKey],
  );

  const pieData = dataset.spendingByCategory.map((row) => ({
    name: row.categoryName,
    value: centsToDollars(row.amountCents),
    cents: row.amountCents,
  }));

  const barData = dataset.incomeVsSpending.map((row) => ({
    name: row.label,
    Income: centsToDollars(row.incomeCents),
    Spending: centsToDollars(row.spendingCents),
  }));

  const moneyTick = (value: number) =>
    hideBalances ? "••••" : `$${value.toLocaleString()}`;

  return (
    <div className="px-4 py-4 md:px-6 space-y-5 max-w-6xl overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted">
          Charts and totals share one filtered dataset. Transfers between
          on-budget accounts are excluded from spending.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold">Filters</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Start
            </span>
            <input
              type="date"
              value={effectiveFilters.startDate}
              onChange={(e) =>
                setFilters({ ...effectiveFilters, startDate: e.target.value })
              }
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              End
            </span>
            <input
              type="date"
              value={effectiveFilters.endDate}
              onChange={(e) =>
                setFilters({ ...effectiveFilters, endDate: e.target.value })
              }
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Accounts
            </span>
            <select
              multiple
              value={effectiveFilters.accountIds}
              onChange={(e) =>
                setFilters({
                  ...effectiveFilters,
                  accountIds: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
              className="input min-h-[6.5rem]"
              aria-label="Filter accounts"
            >
              {plan.accounts
                .filter(
                  (a) =>
                    !a.deletedAt ||
                    Boolean(effectiveFilters.includeDeletedAccounts),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.isHidden ? " (hidden)" : ""}
                    {a.closed || a.closedAt ? " (closed)" : ""}
                    {a.deletedAt ? " (deleted)" : ""}
                  </option>
                ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={Boolean(effectiveFilters.includeDeletedAccounts)}
                onChange={(e) =>
                  setFilters({
                    ...effectiveFilters,
                    includeDeletedAccounts: e.target.checked,
                  })
                }
              />
              Include deleted accounts
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Hold Cmd/Ctrl to multi-select. None selected = all accounts
              (including closed history; soft-deleted stay in totals).
            </p>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              Categories
            </span>
            <select
              multiple
              value={effectiveFilters.categoryIds}
              onChange={(e) =>
                setFilters({
                  ...effectiveFilters,
                  categoryIds: Array.from(e.target.selectedOptions).map(
                    (o) => o.value,
                  ),
                })
              }
              className="input min-h-[6.5rem]"
              aria-label="Filter categories"
            >
              {plan.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => setFilters(defaultReportFilters(monthKey))}
          className="text-sm font-medium text-accent hover:underline"
        >
          Reset to current month
        </button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income" cents={dataset.incomeCents} />
        <StatCard label="Spending" cents={dataset.spendingCents} />
        <StatCard
          label="Net cash flow"
          cents={dataset.netCashFlowCents}
          signed
        />
        <StatCard label="Net worth" cents={dataset.netWorthCents} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spending by Category">
          {pieData.length === 0 ? (
            <EmptyChart message="No spending in this range." />
          ) : (
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      hideBalances
                        ? "••••"
                        : formatMoney(Math.round(Number(value) * 100))
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => (
                      <span className="text-muted">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Income vs Spending">
          {barData.every((d) => d.Income === 0 && d.Spending === 0) ? (
            <EmptyChart message="No income or spending in this range." />
          ) : (
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyTick} width={56} />
                  <Tooltip
                    formatter={(value) =>
                      hideBalances
                        ? "••••"
                        : formatMoney(Math.round(Number(value) * 100))
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Income" fill="#0F766E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spending" fill="#64748B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Net Worth">
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight">
              <MoneyText cents={dataset.netWorthCents} />
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-xs text-muted">Assets</p>
                <p className="font-semibold">
                  <MoneyText cents={dataset.assetCents} />
                </p>
              </div>
              <div className="rounded-lg bg-canvas px-3 py-2">
                <p className="text-xs text-muted">Liabilities</p>
                <p className="font-semibold">
                  <MoneyText cents={dataset.liabilityCents} />
                </p>
              </div>
            </div>
            <p className="text-xs text-muted">
              As of {formatDisplayDate(effectiveFilters.endDate)}, using
              selected accounts.
            </p>
          </div>
        </ChartCard>

        <ChartCard title="Target Progress">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted">Needed</p>
                <p className="font-semibold">
                  <MoneyText cents={dataset.targetProgress.totalTargetCents} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Funded</p>
                <p className="font-semibold">
                  <MoneyText cents={dataset.targetProgress.fundedCents} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Remaining</p>
                <p className="font-semibold">
                  <MoneyText cents={dataset.targetProgress.remainingCents} />
                </p>
              </div>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-black/5"
              role="progressbar"
              aria-valuenow={
                dataset.targetProgress.totalTargetCents === 0
                  ? 0
                  : Math.round(
                      (dataset.targetProgress.fundedCents /
                        dataset.targetProgress.totalTargetCents) *
                        100,
                    )
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${
                    dataset.targetProgress.totalTargetCents === 0
                      ? 0
                      : Math.min(
                          100,
                          Math.round(
                            (dataset.targetProgress.fundedCents /
                              dataset.targetProgress.totalTargetCents) *
                              100,
                          ),
                        )
                  }%`,
                }}
              />
            </div>
            <p className="text-sm text-muted">
              {dataset.targetProgress.completedCount} completed ·{" "}
              {dataset.targetProgress.onTrackCount} on track ·{" "}
              {dataset.targetProgress.underfundedCount} underfunded
            </p>
          </div>
        </ChartCard>
      </div>

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold tracking-tight">Transaction details</h2>
          <p className="text-xs text-muted">
            {dataset.filteredTransactions.length} transactions in range
          </p>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Account</th>
                <th className="px-3 py-2.5">Payee</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {dataset.filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : (
                dataset.filteredTransactions.map((t) => {
                  const account = plan.accounts.find((a) => a.id === t.accountId);
                  const category = t.isTransfer
                    ? "Transfer"
                    : plan.categories.find((c) => c.id === t.categoryId)?.name ??
                      (t.amountCents > 0 ? "Ready to Assign" : "—");
                  return (
                    <tr key={t.id} className="border-t border-border/70">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDisplayDate(t.date)}
                      </td>
                      <td className="px-3 py-2">{account?.name}</td>
                      <td className="px-3 py-2 font-medium">{t.payeeName}</td>
                      <td className="px-3 py-2 text-muted">{category}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        <MoneyText cents={t.amountCents} signed />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden divide-y divide-border">
          {dataset.filteredTransactions.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted">
              No transactions match these filters.
            </li>
          ) : (
            dataset.filteredTransactions.map((t) => {
              const account = plan.accounts.find((a) => a.id === t.accountId);
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{t.payeeName}</p>
                      <p className="text-xs text-muted">
                        {formatDisplayDate(t.date)} · {account?.name}
                        {t.isTransfer ? " · Transfer" : ""}
                      </p>
                    </div>
                    <MoneyText
                      cents={t.amountCents}
                      signed
                      className="font-semibold"
                    />
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  label,
  cents,
  signed,
}: {
  label: string;
  cents: number;
  signed?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tracking-tight sm:text-xl truncate",
          signed && cents < 0 && "text-danger",
          signed && cents > 0 && "text-success",
        )}
      >
        <MoneyText cents={cents} signed={signed} />
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 min-w-0">
      <h2 className="mb-3 font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-muted">
      {message}
    </div>
  );
}
