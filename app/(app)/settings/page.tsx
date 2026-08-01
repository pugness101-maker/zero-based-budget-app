"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Target,
  BarChart3,
  ArrowLeftRight,
  LayoutGrid,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { useBudgetStore } from "@/lib/store/budget-store";
import { ImportWizard } from "@/components/imports/import-wizard";
import { AccountsSettings } from "@/components/settings/accounts-settings";
import { CategoriesSettings } from "@/components/settings/categories-settings";
import { PayeesSettings } from "@/components/settings/payees-settings";
import { ExportPanel } from "@/components/settings/export-panel";

const moreLinks = [
  { href: "/goals", label: "Goals", icon: Target, detail: "Targets and funding progress" },
  { href: "/reports", label: "Reports", icon: BarChart3, detail: "Spending, cash flow, net worth" },
  { href: "/plan", label: "Plan", icon: LayoutGrid, detail: "Monthly budget" },
  { href: "/transactions", label: "All Transactions", icon: ArrowLeftRight, detail: "Search and filter activity" },
];

export default function SettingsPage() {
  const plan = useBudgetStore((s) => s.plan);
  const hideBalances = plan.preferences.hideBalances;
  const toggleHideBalances = useBudgetStore((s) => s.toggleHideBalances);
  const resetDemoData = useBudgetStore((s) => s.resetDemoData);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  return (
    <div className="px-4 py-4 md:px-6 max-w-2xl space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Local demo preferences for {brand.name}. Data persists in this
          browser via local storage.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface overflow-hidden md:hidden">
        <h2 className="px-4 py-3 text-sm font-semibold border-b border-border">
          More
        </h2>
        <ul className="divide-y divide-border">
          {moreLinks.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-sm">{link.label}</span>
                    <span className="block text-xs text-muted">{link.detail}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <ExportPanel onOpenImport={() => setWizardOpen(true)} />

      <AccountsSettings />

      <CategoriesSettings />

      <PayeesSettings />

      <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Hide balances</span>
          <input
            type="checkbox"
            checked={hideBalances}
            onChange={toggleHideBalances}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="text-sm font-semibold">Demo data</h2>
        <p className="text-sm text-muted">
          Plan: {plan.name}. Imported and edited data stays until you reset.
          Refreshing or reopening the browser does not restore seed data.
        </p>
        <label className="block text-xs text-muted space-y-1">
          Type RESET to enable
          <input
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="RESET"
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={resetConfirm !== "RESET"}
          onClick={() => {
            if (
              confirm(
                "This permanently replaces your local plan with the college-student demo. A backup is created first. Continue?",
              )
            ) {
              resetDemoData();
              setResetConfirm("");
            }
          }}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset Demo Data
        </button>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h2 className="text-sm font-semibold">Coming soon</h2>
        <ul className="text-sm text-muted list-disc pl-5 space-y-1">
          <li>Supabase authentication & cloud sync (Phase 2)</li>
          <li>Debt tools</li>
        </ul>
      </section>

      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
