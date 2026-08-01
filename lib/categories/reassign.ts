import type { BudgetPlan, MonthlyCategoryBudget } from "@/lib/types/budget";
import type { Cents } from "@/lib/money";

/** Move transactions, budgets, scheduled items, targets, and payee defaults. */
export function reassignCategoryId(
  plan: BudgetPlan,
  fromId: string,
  toId: string,
): BudgetPlan {
  const transactions = plan.transactions.map((t) => {
    let next = t;
    if (t.categoryId === fromId) {
      next = { ...next, categoryId: toId };
    }
    if (t.splits?.some((s) => s.categoryId === fromId)) {
      next = {
        ...next,
        splits: t.splits.map((s) =>
          s.categoryId === fromId ? { ...s, categoryId: toId } : s,
        ),
      };
    }
    return next;
  });

  const scheduledTransactions = (plan.scheduledTransactions ?? []).map((s) =>
    s.categoryId === fromId ? { ...s, categoryId: toId } : s,
  );

  const destByMonth = new Map<string, MonthlyCategoryBudget>();
  for (const b of plan.monthlyBudgets) {
    if (b.categoryId === toId) destByMonth.set(b.monthKey, { ...b });
  }
  const mergedBudgets: MonthlyCategoryBudget[] = [];
  for (const b of plan.monthlyBudgets) {
    if (b.categoryId === fromId) {
      const existing = destByMonth.get(b.monthKey);
      if (existing) {
        destByMonth.set(b.monthKey, {
          ...existing,
          assignedCents: (existing.assignedCents + b.assignedCents) as Cents,
          activityCents:
            existing.activityCents != null || b.activityCents != null
              ? (((existing.activityCents ?? 0) + (b.activityCents ?? 0)) as Cents)
              : undefined,
          availableCents:
            existing.availableCents != null || b.availableCents != null
              ? (((existing.availableCents ?? 0) +
                  (b.availableCents ?? 0)) as Cents)
              : undefined,
        });
      } else {
        destByMonth.set(b.monthKey, { ...b, categoryId: toId });
      }
      continue;
    }
    if (b.categoryId === toId) continue;
    mergedBudgets.push(b);
  }
  mergedBudgets.push(...destByMonth.values());

  const destHasTarget = plan.targets.some((t) => t.categoryId === toId);
  const targets = plan.targets
    .filter((t) => t.categoryId !== fromId || !destHasTarget)
    .map((t) =>
      t.categoryId === fromId ? { ...t, categoryId: toId } : t,
    );

  const payees = plan.payees.map((p) =>
    p.defaultCategoryId === fromId
      ? { ...p, defaultCategoryId: toId }
      : p,
  );

  return {
    ...plan,
    transactions,
    scheduledTransactions,
    monthlyBudgets: mergedBudgets,
    targets,
    payees,
  };
}
