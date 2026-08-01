"use client";

import { useState } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";
import {
  CUSTOM_TRACKING_ASSET_OPTIONS,
  TRACKING_LIABILITY_OPTIONS,
  isTrackingLiabilityAccount,
} from "@/lib/seed/default-templates";
import { ApplyTemplateDialog } from "@/components/settings/apply-template-dialog";
import type { AccountType } from "@/lib/types/budget";
import { parseMoneyInput } from "@/lib/money";

export function TrackingAccountsSettings() {
  const plan = useBudgetStore((s) => s.plan);
  const enabled = Boolean(plan.preferences.enableTrackingLiabilities);
  const setEnable = useBudgetStore((s) => s.setEnableTrackingLiabilities);
  const addTrackingAccount = useBudgetStore((s) => s.addTrackingAccount);

  const [assetTypeIdx, setAssetTypeIdx] = useState(0);
  const [assetName, setAssetName] = useState(
    CUSTOM_TRACKING_ASSET_OPTIONS[0]!.defaultName,
  );
  const [liabilityTypeIdx, setLiabilityTypeIdx] = useState(0);
  const [liabilityName, setLiabilityName] = useState(
    TRACKING_LIABILITY_OPTIONS[0]!.defaultName,
  );
  const [balance, setBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const liabilityCount = plan.accounts.filter(
    (a) => !a.deletedAt && isTrackingLiabilityAccount(a),
  ).length;

  function addAsset() {
    setError(null);
    const opt = CUSTOM_TRACKING_ASSET_OPTIONS[assetTypeIdx]!;
    const cents = parseMoneyInput(balance) ?? 0;
    const result = addTrackingAccount({
      name: assetName || opt.defaultName,
      type: opt.type,
      startingBalanceCents: cents,
      isLiability: false,
    });
    if (!result.ok) setError(result.error ?? "Could not add account.");
  }

  function addLiability() {
    setError(null);
    const opt = TRACKING_LIABILITY_OPTIONS[liabilityTypeIdx]!;
    const cents = parseMoneyInput(balance) ?? 0;
    const result = addTrackingAccount({
      name: liabilityName || opt.defaultName,
      type: opt.type as AccountType,
      startingBalanceCents: cents,
      isLiability: true,
    });
    if (!result.ok) setError(result.error ?? "Could not add account.");
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Tracking accounts</h2>
        <p className="mt-1 text-sm text-muted">
          Defaults include Brokerage, Retirement, and HSA. 529, Real Estate,
          Vehicles, and Other Assets are available as custom tracking types
          below. Tracking Liabilities stay off until you enable them.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Add custom tracking asset
        </p>
        <select
          className="input"
          value={assetTypeIdx}
          onChange={(e) => {
            const idx = Number(e.target.value);
            setAssetTypeIdx(idx);
            setAssetName(CUSTOM_TRACKING_ASSET_OPTIONS[idx]!.defaultName);
          }}
        >
          {CUSTOM_TRACKING_ASSET_OPTIONS.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          placeholder="Account name"
        />
        <button
          type="button"
          onClick={addAsset}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Add tracking asset
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Enable Tracking Liabilities
          <span className="block text-xs text-muted font-normal">
            Sidebar section appears only after you add a liability account
            {liabilityCount > 0 ? ` · ${liabilityCount} active` : ""}.
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnable(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>

      {enabled && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Add tracking liability
          </p>
          <select
            className="input"
            value={liabilityTypeIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setLiabilityTypeIdx(idx);
              setLiabilityName(TRACKING_LIABILITY_OPTIONS[idx]!.defaultName);
            }}
          >
            {TRACKING_LIABILITY_OPTIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={liabilityName}
            onChange={(e) => setLiabilityName(e.target.value)}
            placeholder="Account name"
          />
          <input
            className="input"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="Starting balance"
          />
          <button
            type="button"
            onClick={addLiability}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Add liability account
          </button>
        </div>
      )}

      <div className="pt-1 border-t border-border space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Category groups template
        </p>
        <p className="text-sm text-muted">
          Existing customized groups are never overwritten on refresh. Optionally
          apply the simplified 15-group template with a mapping preview.
        </p>
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          Apply simplified default template
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <ApplyTemplateDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
      />
    </section>
  );
}
