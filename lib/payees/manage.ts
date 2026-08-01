import {
  buildPayeeUsage,
  ensurePayeeOnPlan,
  findDuplicatePayee,
  normalizePayeeName,
  payeeNamesEqual,
  type PayeeUsage,
} from "@/lib/payees/catalog";
import type { BudgetPlan, Payee } from "@/lib/types/budget";

export type PayeeManageResult =
  | { ok: true; plan: BudgetPlan }
  | { ok: false; error: string };

function newPayeeId() {
  return `payee-${crypto.randomUUID().slice(0, 8)}`;
}

export function listManagedPayees(
  plan: BudgetPlan,
  aliasRules: Record<string, string> = {},
): Array<PayeeUsage & { payee: Payee | null }> {
  const usage = buildPayeeUsage(plan, aliasRules);
  // Include hidden registered payees for Settings
  const hiddenRegistered = plan.payees.filter((p) => p.hidden);
  const rows: Array<PayeeUsage & { payee: Payee | null }> = usage.map((u) => ({
    ...u,
    payee: plan.payees.find((p) => p.id === u.payeeId) ?? null,
  }));

  for (const p of hiddenRegistered) {
    if (rows.some((r) => payeeNamesEqual(r.name, p.name))) continue;
    rows.push({
      name: p.name,
      payeeId: p.id,
      lastUsedDate: "",
      transactionCount: plan.transactions.filter((t) =>
        payeeNamesEqual(t.payeeName, p.name),
      ).length,
      lastCategoryId: p.defaultCategoryId ?? null,
      aliases: p.aliases ?? [],
      hidden: true,
      defaultCategoryId: p.defaultCategoryId,
      defaultMemo: p.defaultMemo,
      payee: p,
    });
  }

  return rows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function renamePayee(
  plan: BudgetPlan,
  payeeIdOrName: string,
  nextName: string,
): PayeeManageResult {
  const normalized = normalizePayeeName(nextName);
  if (!normalized) return { ok: false, error: "Payee name is required." };

  const payee =
    plan.payees.find((p) => p.id === payeeIdOrName) ??
    plan.payees.find((p) => payeeNamesEqual(p.name, payeeIdOrName));
  const oldName = payee?.name ?? payeeIdOrName;

  const dup = findDuplicatePayee(plan, normalized, payee?.id);
  if (dup) {
    return {
      ok: false,
      error: `A payee named “${dup.name}” already exists.`,
    };
  }

  let payees = plan.payees;
  if (payee) {
    payees = plan.payees.map((p) =>
      p.id === payee.id ? { ...p, name: normalized } : p,
    );
  } else {
    payees = [
      ...plan.payees,
      { id: newPayeeId(), name: normalized },
    ];
  }

  const transactions = plan.transactions.map((t) =>
    !t.isTransfer && payeeNamesEqual(t.payeeName, oldName)
      ? { ...t, payeeName: normalized, payeeId: payee?.id }
      : t,
  );

  return { ok: true, plan: { ...plan, payees, transactions } };
}

export function mergePayees(
  plan: BudgetPlan,
  sourceIdOrName: string,
  targetIdOrName: string,
): PayeeManageResult {
  const source =
    plan.payees.find((p) => p.id === sourceIdOrName) ??
    plan.payees.find((p) => payeeNamesEqual(p.name, sourceIdOrName));
  const target =
    plan.payees.find((p) => p.id === targetIdOrName) ??
    plan.payees.find((p) => payeeNamesEqual(p.name, targetIdOrName));

  const sourceName = source?.name ?? sourceIdOrName;
  const targetName = target?.name ?? targetIdOrName;
  if (payeeNamesEqual(sourceName, targetName)) {
    return { ok: false, error: "Choose two different payees to merge." };
  }

  const transactions = plan.transactions.map((t) =>
    !t.isTransfer && payeeNamesEqual(t.payeeName, sourceName)
      ? {
          ...t,
          payeeName: targetName,
          payeeId: target?.id,
        }
      : t,
  );

  let payees = plan.payees;
  if (source) {
    payees = plan.payees.filter((p) => p.id !== source.id);
  }
  if (target) {
    const mergedAliases = [
      ...(target.aliases ?? []),
      ...(source?.aliases ?? []),
      sourceName,
    ].filter(
      (a, i, arr) =>
        !payeeNamesEqual(a, targetName) &&
        arr.findIndex((x) => payeeNamesEqual(x, a)) === i,
    );
    payees = payees.map((p) =>
      p.id === target.id
        ? {
            ...p,
            aliases: mergedAliases,
            defaultCategoryId:
              p.defaultCategoryId ?? source?.defaultCategoryId,
            defaultMemo: p.defaultMemo ?? source?.defaultMemo,
          }
        : p,
    );
  } else {
    payees = [
      ...payees,
      {
        id: newPayeeId(),
        name: normalizePayeeName(targetName),
        aliases: [sourceName],
        defaultCategoryId: source?.defaultCategoryId,
        defaultMemo: source?.defaultMemo,
      },
    ];
  }

  return { ok: true, plan: { ...plan, payees, transactions } };
}

export function updatePayeeDefaults(
  plan: BudgetPlan,
  payeeId: string,
  patch: {
    defaultCategoryId?: string | null;
    defaultMemo?: string | null;
    aliases?: string[];
    hidden?: boolean;
  },
): PayeeManageResult {
  const payee = plan.payees.find((p) => p.id === payeeId);
  if (!payee) return { ok: false, error: "Payee not found." };

  const payees = plan.payees.map((p) => {
    if (p.id !== payeeId) return p;
    return {
      ...p,
      defaultCategoryId:
        patch.defaultCategoryId === undefined
          ? p.defaultCategoryId
          : patch.defaultCategoryId ?? undefined,
      defaultMemo:
        patch.defaultMemo === undefined
          ? p.defaultMemo
          : patch.defaultMemo?.trim() || undefined,
      aliases:
        patch.aliases === undefined
          ? p.aliases
          : patch.aliases.map(normalizePayeeName).filter(Boolean),
      hidden: patch.hidden === undefined ? p.hidden : patch.hidden,
    };
  });

  return { ok: true, plan: { ...plan, payees } };
}

export function hidePayee(plan: BudgetPlan, payeeId: string): PayeeManageResult {
  return updatePayeeDefaults(plan, payeeId, { hidden: true });
}

export function unhidePayee(
  plan: BudgetPlan,
  payeeId: string,
): PayeeManageResult {
  return updatePayeeDefaults(plan, payeeId, { hidden: false });
}

/** Delete only when no transactions reference the payee. */
export function deletePayeeSafe(
  plan: BudgetPlan,
  payeeId: string,
): PayeeManageResult {
  const payee = plan.payees.find((p) => p.id === payeeId);
  if (!payee) return { ok: false, error: "Payee not found." };
  const linked = plan.transactions.some(
    (t) =>
      t.payeeId === payeeId ||
      (!t.isTransfer && payeeNamesEqual(t.payeeName, payee.name)),
  );
  if (linked) {
    return {
      ok: false,
      error: "Payee is used on transactions. Merge or rename instead.",
    };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      payees: plan.payees.filter((p) => p.id !== payeeId),
    },
  };
}

export function ensureRegisteredPayee(
  plan: BudgetPlan,
  name: string,
  defaults?: { defaultCategoryId?: string | null },
): BudgetPlan {
  return ensurePayeeOnPlan(plan, name, defaults);
}
