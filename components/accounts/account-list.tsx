"use client";

import Link from "next/link";
import { useBudgetStore } from "@/lib/store/budget-store";
import { getAllAccountBalances } from "@/lib/calculations/account-balances";
import { MoneyText } from "@/components/shared/money-text";
import { DisabledAction } from "@/components/shared/disabled-action";
import type { Account } from "@/lib/types/budget";
import { isAccountClosed } from "@/lib/accounts/lifecycle";
import {
  isTrackingAssetAccount,
  isTrackingLiabilityAccount,
} from "@/lib/seed/default-templates";

export function AccountList() {
  const plan = useBudgetStore((s) => s.plan);
  const balances = getAllAccountBalances(plan.accounts, plan.transactions);

  const active = (a: Account) =>
    !a.deletedAt && !isAccountClosed(a) && !a.isHidden;

  const trackingLiabilities = plan.accounts.filter(
    (a) => isTrackingLiabilityAccount(a) && active(a),
  );

  const sections: { title: string; accounts: Account[] }[] = [
    {
      title: "On budget",
      accounts: plan.accounts.filter((a) => a.kind === "on_budget" && active(a)),
    },
    {
      title: "Credit cards",
      accounts: plan.accounts.filter((a) => a.kind === "credit" && active(a)),
    },
    {
      title: "Tracking Assets",
      accounts: plan.accounts.filter((a) => isTrackingAssetAccount(a) && active(a)),
    },
    ...(trackingLiabilities.length > 0
      ? [
          {
            title: "Tracking Liabilities",
            accounts: trackingLiabilities,
          },
        ]
      : []),
  ];

  return (
    <div className="px-4 py-4 md:px-6 space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-sm text-muted">
            Balances update from your register activity.
          </p>
        </div>
        <DisabledAction
          label="Add Account"
          reason="Account creation form ships in the next accounts increment."
        />
      </div>

      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {section.title}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {section.accounts.map((account) => {
              const balance = balances.get(account.id)?.balanceCents ?? 0;
              return (
                <li key={account.id}>
                  <Link
                    href={`/accounts/${account.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted truncate">
                        {[account.institution, account.lastFour && `•••• ${account.lastFour}`]
                          .filter(Boolean)
                          .join(" · ") || account.type.replaceAll("_", " ")}
                      </p>
                    </div>
                    <MoneyText cents={balance} className="font-semibold" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
