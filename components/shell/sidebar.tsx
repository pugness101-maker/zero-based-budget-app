"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Wallet,
  ArrowLeftRight,
  Target,
  BarChart3,
  Landmark,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getAllAccountBalances } from "@/lib/calculations/account-balances";
import { MoneyText } from "@/components/shared/money-text";
import { DisabledAction } from "@/components/shared/disabled-action";
import { isAccountClosed } from "@/lib/accounts/lifecycle";
import {
  isTrackingAssetAccount,
  isTrackingLiabilityAccount,
} from "@/lib/seed/default-templates";
import type { Account } from "@/lib/types/budget";

const navItems = [
  { href: "/plan", label: "Plan", icon: LayoutGrid },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/transactions", label: "All Transactions", icon: ArrowLeftRight },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  {
    href: "/debt",
    label: "Debt",
    icon: Landmark,
    disabled: true,
    reason: "Debt tools are planned for Phase 3.",
  },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useBudgetStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useBudgetStore((s) => s.toggleSidebar);
  const plan = useBudgetStore((s) => s.plan);
  const balances = getAllAccountBalances(plan.accounts, plan.transactions);
  const showHiddenPref = Boolean(plan.preferences.showHiddenAccounts);

  const active = (a: Account) =>
    !a.deletedAt && !isAccountClosed(a) && !a.isHidden;

  const onBudget = plan.accounts.filter(
    (a) => a.kind === "on_budget" && active(a),
  );
  const credit = plan.accounts.filter((a) => a.kind === "credit" && active(a));
  const trackingAssets = plan.accounts.filter(
    (a) => isTrackingAssetAccount(a) && active(a),
  );
  const trackingLiabilities = plan.accounts.filter(
    (a) => isTrackingLiabilityAccount(a) && active(a),
  );
  const hidden = plan.accounts.filter(
    (a) => !a.deletedAt && !isAccountClosed(a) && a.isHidden,
  );
  const closed = plan.accounts.filter(
    (a) => !a.deletedAt && isAccountClosed(a),
  );

  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({
    Hidden: true,
    Closed: true,
  });

  function toggleSection(title: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-sidebar text-sidebar-fg h-dvh sticky top-0 transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 h-14 border-b border-border shrink-0",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white text-xs font-bold tracking-tight">
          {brand.shortName}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm tracking-tight">
              {brand.name}
            </p>
            <p className="truncate text-[11px] text-muted">Demo mode</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const disabled = "disabled" in item && item.disabled;
          const activeNav =
            !disabled &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`));

          if (disabled) {
            return (
              <div
                key={item.label}
                title={item.reason}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted opacity-50 cursor-not-allowed",
                  collapsed && "justify-center px-2",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                activeNav
                  ? "bg-accent-muted text-accent"
                  : "text-sidebar-fg/80 hover:bg-black/5",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {!collapsed && (
          <div className="pt-4 space-y-3">
            <AccountSection
              title="On Budget"
              accounts={onBudget}
              balances={balances}
              collapsed={Boolean(collapsedSections["On Budget"])}
              onToggle={() => toggleSection("On Budget")}
            />
            <AccountSection
              title="Credit"
              accounts={credit}
              balances={balances}
              collapsed={Boolean(collapsedSections.Credit)}
              onToggle={() => toggleSection("Credit")}
            />
            <AccountSection
              title="Tracking Assets"
              accounts={trackingAssets}
              balances={balances}
              collapsed={Boolean(collapsedSections["Tracking Assets"])}
              onToggle={() => toggleSection("Tracking Assets")}
            />
            {/* Hidden until at least one liability account exists */}
            <AccountSection
              title="Tracking Liabilities"
              accounts={trackingLiabilities}
              balances={balances}
              collapsed={Boolean(collapsedSections["Tracking Liabilities"])}
              onToggle={() => toggleSection("Tracking Liabilities")}
            />
            {(showHiddenPref || hidden.length > 0) && (
              <AccountSection
                title="Hidden"
                accounts={hidden}
                balances={balances}
                collapsed={collapsedSections.Hidden !== false}
                onToggle={() => toggleSection("Hidden")}
              />
            )}
            <AccountSection
              title="Closed"
              accounts={closed}
              balances={balances}
              collapsed={collapsedSections.Closed !== false}
              onToggle={() => toggleSection("Closed")}
            />
            <DisabledAction
              label="Add Account"
              reason="Account creation form ships with the next accounts increment."
              className="w-full gap-2"
            />
          </div>
        )}

        {collapsed && (
          <div className="pt-3 flex justify-center">
            <button
              type="button"
              title="Add Account — coming soon"
              disabled
              className="rounded-lg p-2 text-muted opacity-50 cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </nav>

      <button
        type="button"
        onClick={toggleSidebar}
        className="flex items-center justify-center gap-2 h-11 border-t border-border text-sm text-muted hover:bg-black/5"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <>
            <ChevronLeft className="h-4 w-4" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

function AccountSection({
  title,
  accounts,
  balances,
  collapsed,
  onToggle,
}: {
  title: string;
  accounts: Account[];
  balances: Map<string, { balanceCents: number }>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (accounts.length === 0 && (title === "Hidden" || title === "Closed")) {
    return null;
  }
  if (accounts.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink"
      >
        <span>
          {title}
          <span className="ml-1 font-normal normal-case tracking-normal">
            ({accounts.length})
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {!collapsed && (
        <ul className="space-y-0.5">
          {accounts.map((account) => (
            <li key={account.id}>
              <Link
                href={`/accounts/${account.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-black/5"
              >
                <span className="truncate">{account.name}</span>
                <MoneyText
                  cents={balances.get(account.id)?.balanceCents ?? 0}
                  className="text-xs text-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
