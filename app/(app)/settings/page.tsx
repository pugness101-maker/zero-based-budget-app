"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Target,
  BarChart3,
  ArrowLeftRight,
  LayoutGrid,
  Upload,
} from "lucide-react";
import { brand } from "@/lib/brand";
import { useBudgetStore } from "@/lib/store/budget-store";
import { ImportWizard } from "@/components/imports/import-wizard";
import { AccountsSettings } from "@/components/settings/accounts-settings";
import { CategoriesSettings } from "@/components/settings/categories-settings";
import { PayeesSettings } from "@/components/settings/payees-settings";
import { serializePlanBackup } from "@/lib/imports/parse-json-backup";
import { formatDisplayDate } from "@/lib/dates";

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
  const importBatches = useBudgetStore((s) => s.importBatches);
  const backups = useBudgetStore((s) => s.backups);
  const reverseImport = useBudgetStore((s) => s.reverseImport);
  const createBackup = useBudgetStore((s) => s.createBackup);
  const [wizardOpen, setWizardOpen] = useState(false);

  function downloadBackup() {
    createBackup("Manual export", "manual");
    const blob = new Blob([serializePlanBackup(plan)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `everydollarflow-backup-${plan.workingMonthKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-4 md:px-6 max-w-2xl space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Local demo preferences for {brand.name}.
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

      <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">Import / Export</h2>
        </div>
        <p className="text-sm text-muted">
          Import CSV statements, YNAB-style exports, balance/budget files, or a
          JSON backup. Every import creates a restore point and can be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Import past data
          </button>
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Export JSON backup
          </button>
        </div>

        {importBatches.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Recent imports
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {importBatches.slice(0, 5).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.fileName}</p>
                    <p className="text-xs text-muted">
                      {b.status} · {b.importedRows} imported
                    </p>
                  </div>
                  {b.status === "committed" && (
                    <button
                      type="button"
                      onClick={() => reverseImport(b.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {backups.length > 0 && (
          <p className="text-xs text-muted">
            {backups.length} local backup
            {backups.length === 1 ? "" : "s"} stored · latest{" "}
            {formatDisplayDate(backups[0]!.createdAt.slice(0, 10))}
          </p>
        )}
      </section>

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
          Plan: {plan.name}. Data persists in this browser via local storage.
        </p>
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Reset all local changes and restore the college-student demo plan?",
              )
            ) {
              resetDemoData();
            }
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Reset demo data
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
