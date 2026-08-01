"use client";

import { brand } from "@/lib/brand";
import { useBudgetStore } from "@/lib/store/budget-store";

export default function SettingsPage() {
  const plan = useBudgetStore((s) => s.plan);
  const hideBalances = plan.preferences.hideBalances;
  const toggleHideBalances = useBudgetStore((s) => s.toggleHideBalances);
  const resetDemoData = useBudgetStore((s) => s.resetDemoData);

  return (
    <div className="px-4 py-4 md:px-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Local demo preferences for {brand.name}.
        </p>
      </div>

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
          <li>Import / export & backups</li>
          <li>Reports, goals, debt tools</li>
        </ul>
      </section>
    </div>
  );
}
