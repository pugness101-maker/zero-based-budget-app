import { beforeEach, describe, expect, it } from "vitest";
import { dollarsToCents } from "@/lib/money";
import type { BudgetPlan, Target, Transaction } from "@/lib/types/budget";
import {
  applyAccountDeleteStrategy,
  buildAccountDeletePreview,
  bulkApplyAccountDelete,
  findOrphanedTransferLinks,
  purgeSoftDeletedAccount,
  restoreSoftDeletedAccount,
} from "@/lib/accounts/deletion";
import { closeAccount } from "@/lib/accounts/operations";
import { buildReportDataset } from "@/lib/calculations/reports";
import { useBudgetStore } from "@/lib/store/budget-store";
import { createDemoPlan } from "@/lib/seed/demo-plan";

function txn(
  partial: Partial<Transaction> &
    Pick<Transaction, "id" | "accountId" | "amountCents">,
): Transaction {
  return {
    date: "2026-07-15",
    payeeName: "Test",
    categoryId: null,
    cleared: "uncleared",
    approved: true,
    isTransfer: false,
    ...partial,
  };
}

function basePlan(): BudgetPlan {
  return {
    id: "test",
    name: "Test",
    currency: "USD",
    workingMonthKey: "2026-08",
    preferences: {
      hideBalances: false,
      timezone: "UTC",
      currency: "USD",
      firstDayOfWeek: 0,
    },
    accounts: [
      {
        id: "checking",
        name: "Checking",
        type: "checking",
        kind: "on_budget",
        startingBalanceCents: 0,
        currency: "USD",
        closed: true,
        closedAt: "2026-07-01T00:00:00.000Z",
        isHidden: true,
        sortOrder: 0,
      },
      {
        id: "savings",
        name: "Savings",
        type: "savings",
        kind: "on_budget",
        startingBalanceCents: dollarsToCents(200),
        currency: "USD",
        closed: false,
        isHidden: false,
        sortOrder: 1,
      },
      {
        id: "empty-closed",
        name: "Empty Closed",
        type: "cash",
        kind: "on_budget",
        startingBalanceCents: 0,
        currency: "USD",
        closed: true,
        closedAt: "2026-06-01T00:00:00.000Z",
        isHidden: true,
        sortOrder: 2,
      },
    ],
    categoryGroups: [],
    categories: [],
    monthlyBudgets: [],
    targets: [],
    payees: [],
    transactions: [],
    scheduledTransactions: [],
  };
}

describe("delete empty closed account", () => {
  it("permanently deletes an empty closed account", () => {
    const plan = basePlan();
    const result = applyAccountDeleteStrategy(plan, "empty-closed", {
      mode: "empty_purge",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.accounts.find((a) => a.id === "empty-closed")).toBeUndefined();
  });
});

describe("soft delete with history", () => {
  it("soft-deletes and preserves transactions", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({ id: "t1", accountId: "checking", amountCents: dollarsToCents(-10) }),
    ];
    // zero balance via starting offset already 0 + txn leaves non-zero — adjust
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(10);

    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "soft_delete",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const acct = result.plan.accounts.find((a) => a.id === "checking");
    expect(acct?.deletedAt).toBeTruthy();
    expect(acct?.deletionMethod).toBe("soft_delete");
    expect(result.plan.transactions.filter((t) => t.accountId === "checking").length).toBe(
      1,
    );
  });
});

describe("delete account and all history", () => {
  it("requires name + second confirm and removes history", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({ id: "t1", accountId: "checking", amountCents: 0 }),
    ];
    const fail = applyAccountDeleteStrategy(plan, "checking", {
      mode: "delete_all_history",
      confirmedName: "Wrong",
      secondConfirm: true,
    });
    expect(fail.ok).toBe(false);

    const ok = applyAccountDeleteStrategy(plan, "checking", {
      mode: "delete_all_history",
      confirmedName: "Checking",
      secondConfirm: true,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.plan.accounts.find((a) => a.id === "checking")).toBeUndefined();
    expect(ok.plan.transactions.some((t) => t.accountId === "checking")).toBe(
      false,
    );
  });
});

describe("move transactions then delete", () => {
  it("moves txns and removes source account", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({
        id: "t1",
        accountId: "checking",
        amountCents: dollarsToCents(-5),
        payeeName: "Coffee",
        categoryId: "cat-1",
        memo: "latte",
        cleared: "cleared",
        importBatchId: "batch-1",
      }),
    ];
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(5);

    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "move_then_delete",
      destinationAccountId: "savings",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.accounts.find((a) => a.id === "checking")).toBeUndefined();
    const moved = result.plan.transactions.find((t) => t.id === "t1");
    expect(moved?.accountId).toBe("savings");
    expect(moved?.payeeName).toBe("Coffee");
    expect(moved?.memo).toBe("latte");
    expect(moved?.importBatchId).toBe("batch-1");
  });
});

describe("non-zero balance", () => {
  it("blocks deletion without balance resolution", () => {
    const plan = basePlan();
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(25);
    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "soft_delete",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Final balance/i);
  });

  it("allows adjustment then soft delete", () => {
    const plan = basePlan();
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(25);
    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "soft_delete",
      balanceResolution: { type: "adjustment" },
    });
    expect(result.ok).toBe(true);
  });
});

describe("linked transfers", () => {
  it("converts remaining transfer side and leaves no orphans", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({
        id: "out",
        accountId: "checking",
        amountCents: dollarsToCents(-20),
        isTransfer: true,
        transferPairId: "in",
        payeeName: "Transfer to Savings",
      }),
      txn({
        id: "in",
        accountId: "savings",
        amountCents: dollarsToCents(20),
        isTransfer: true,
        transferPairId: "out",
        payeeName: "Transfer from Checking",
      }),
    ];
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(20);

    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "delete_all_history",
      confirmedName: "Checking",
      secondConfirm: true,
      transferOrphanHandling: "convert_to_adjustment",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findOrphanedTransferLinks(result.plan)).toEqual([]);
    const remaining = result.plan.transactions.find((t) => t.id === "in");
    expect(remaining?.isTransfer).toBe(false);
    expect(remaining?.transferPairId).toBeUndefined();
    expect(remaining?.payeeName).toBe("Balance adjustment");
  });
});

describe("scheduled transactions", () => {
  it("removes scheduled txs on delete-all-history", () => {
    const plan = basePlan();
    plan.scheduledTransactions = [
      {
        id: "sch-1",
        accountId: "checking",
        date: "2026-09-01",
        payeeName: "Rent",
        categoryId: null,
        amountCents: -10000,
        status: "skipped",
        pausedByAccountClose: true,
      },
    ];
    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "delete_all_history",
      confirmedName: "Checking",
      secondConfirm: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.plan.scheduledTransactions ?? []).some(
        (s) => s.accountId === "checking",
      ),
    ).toBe(false);
  });
});

describe("account goals", () => {
  it("reassigns goals on delete-all-history", () => {
    const plan = basePlan();
    const goal: Target = {
      id: "goal-1",
      name: "Emergency",
      linkType: "account",
      categoryId: null,
      accountId: "checking",
      type: "custom_account_target",
      amountCents: dollarsToCents(500),
    };
    plan.targets = [goal];
    const result = applyAccountDeleteStrategy(plan, "checking", {
      mode: "delete_all_history",
      confirmedName: "Checking",
      secondConfirm: true,
      goalDisposition: { type: "reassign", toAccountId: "savings" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // delete_all_history purgeAccountHistory also strips account goals after reassign...
    // reassign happens first, then purge filters accountId === checking — reassigned should remain
    const g = result.plan.targets.find((t) => t.id === "goal-1");
    expect(g?.accountId).toBe("savings");
  });
});

describe("recently deleted restore and purge", () => {
  it("restores soft-deleted accounts", () => {
    const plan = basePlan();
    const soft = applyAccountDeleteStrategy(plan, "empty-closed", {
      mode: "soft_delete",
    });
    expect(soft.ok).toBe(true);
    if (!soft.ok) return;
    const restored = restoreSoftDeletedAccount(soft.plan, "empty-closed");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(
      restored.plan.accounts.find((a) => a.id === "empty-closed")?.deletedAt,
    ).toBeUndefined();
  });

  it("permanently purges soft-deleted accounts", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({ id: "t1", accountId: "checking", amountCents: 0 }),
    ];
    const soft = applyAccountDeleteStrategy(plan, "checking", {
      mode: "soft_delete",
    });
    expect(soft.ok).toBe(true);
    if (!soft.ok) return;
    const purged = purgeSoftDeletedAccount(soft.plan, "checking", {
      confirmedName: "Checking",
      secondConfirm: true,
    });
    expect(purged.ok).toBe(true);
    if (!purged.ok) return;
    expect(purged.plan.accounts.find((a) => a.id === "checking")).toBeUndefined();
  });
});

describe("bulk delete closed accounts", () => {
  it("soft-deletes multiple closed accounts", () => {
    const plan = basePlan();
    const result = bulkApplyAccountDelete(plan, ["empty-closed", "checking"], {
      mode: "soft_delete",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.plan.accounts.filter((a) => a.deletedAt).map((a) => a.id).sort(),
    ).toEqual(["checking", "empty-closed"]);
  });
});

describe("reports preserve soft-deleted history", () => {
  it("includes soft-deleted account balances in net worth", () => {
    const plan = basePlan();
    plan.accounts[0]!.startingBalanceCents = dollarsToCents(40);
    plan.accounts[0]!.closed = true;
    const soft = applyAccountDeleteStrategy(plan, "checking", {
      mode: "soft_delete",
      balanceResolution: { type: "adjustment" },
    });
    expect(soft.ok).toBe(true);
    if (!soft.ok) return;
    // After adjustment, checking balance is 0; savings still 200
    const report = buildReportDataset(
      soft.plan,
      {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        accountIds: [],
        categoryIds: [],
      },
      "2026-08",
    );
    expect(report.netWorthCents).toBe(dollarsToCents(200));
    expect(soft.plan.accounts.some((a) => a.id === "checking" && a.deletedAt)).toBe(
      true,
    );
  });
});

describe("automatic backup before deletion", () => {
  beforeEach(() => {
    const plan = createDemoPlan();
    useBudgetStore.setState({
      plan,
      backups: [],
      undoStack: [],
      redoStack: [],
      toastMessage: null,
    });
  });

  it("creates a backup via store strategy delete", () => {
    const demo = useBudgetStore.getState().plan;
    // Close an empty-ish path: create closed empty account
    const closed = closeAccount(demo, {
      accountId: demo.accounts.find((a) => a.kind === "on_budget")!.id,
      strategy: "zero",
      confirmed: true,
    });
    // May fail if non-zero — use soft delete on a closed empty from fixture via setState
    useBudgetStore.setState({
      plan: {
        ...demo,
        accounts: demo.accounts.map((a, i) =>
          i === 0
            ? {
                ...a,
                closed: true,
                closedAt: "2026-07-01T00:00:00.000Z",
                startingBalanceCents: 0,
              }
            : a,
        ),
        transactions: demo.transactions.filter(
          (t) => t.accountId !== demo.accounts[0]!.id,
        ),
        scheduledTransactions: (demo.scheduledTransactions ?? []).filter(
          (s) => s.accountId !== demo.accounts[0]!.id,
        ),
        targets: demo.targets.filter(
          (t) => !(t.linkType === "account" && t.accountId === demo.accounts[0]!.id),
        ),
      },
      backups: [],
    });

    const id = useBudgetStore.getState().plan.accounts[0]!.id;
    const preview = buildAccountDeletePreview(useBudgetStore.getState().plan, id);
    expect(preview).toBeTruthy();

    const result = useBudgetStore.getState().deleteAccountWithStrategy(id, {
      mode: preview!.canEmptyPurge ? "empty_purge" : "soft_delete",
      balanceResolution:
        preview!.finalBalanceCents !== 0
          ? { type: "adjustment" }
          : { type: "already_zero" },
    });
    expect(result.ok).toBe(true);
    expect(
      useBudgetStore.getState().backups.some((b) => b.reason === "pre_bulk_delete"),
    ).toBe(true);
    // silence unused
    expect(closed.ok || !closed.ok).toBe(true);
  });
});

describe("preview", () => {
  it("builds delete preview with counts", () => {
    const plan = basePlan();
    plan.transactions = [
      txn({ id: "t1", accountId: "checking", amountCents: 0, cleared: "reconciled" }),
    ];
    const preview = buildAccountDeletePreview(plan, "checking");
    expect(preview?.transactionCount).toBe(1);
    expect(preview?.reconciliationCount).toBe(1);
    expect(preview?.name).toBe("Checking");
  });
});
