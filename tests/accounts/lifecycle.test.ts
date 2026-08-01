import { describe, expect, it } from "vitest";
import { dollarsToCents } from "@/lib/money";
import type { BudgetPlan, Transaction } from "@/lib/types/budget";
import {
  buildClosePreview,
  canPermanentlyDelete,
  getActiveAccounts,
  getDeleteBlockers,
  isAccountClosed,
  isAccountHidden,
  pauseScheduledForAccount,
} from "@/lib/accounts/lifecycle";
import {
  assertCanAddTransaction,
  bulkSetHidden,
  closeAccount,
  deleteAccountSafe,
  hideAccount,
  reopenAccount,
  unhideAccount,
} from "@/lib/accounts/operations";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import { buildReportDataset } from "@/lib/calculations/reports";

function txn(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "accountId" | "amountCents">,
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

function planFixture(): BudgetPlan {
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
        startingBalanceCents: dollarsToCents(100),
        currency: "USD",
        closed: false,
        isHidden: false,
        sortOrder: 0,
      },
      {
        id: "savings",
        name: "Savings",
        type: "savings",
        kind: "on_budget",
        startingBalanceCents: dollarsToCents(50),
        currency: "USD",
        closed: false,
        isHidden: false,
        sortOrder: 1,
      },
      {
        id: "old-ynab",
        name: "Old YNAB",
        type: "checking",
        kind: "on_budget",
        startingBalanceCents: 0,
        currency: "USD",
        closed: false,
        isHidden: false,
        importedSource: "ynab",
        sortOrder: 2,
      },
    ],
    categoryGroups: [],
    categories: [],
    monthlyBudgets: [],
    targets: [],
    payees: [],
    transactions: [
      txn({
        id: "t1",
        accountId: "checking",
        amountCents: dollarsToCents(-20),
        payeeName: "Coffee",
      }),
    ],
    scheduledTransactions: [
      {
        id: "sch1",
        accountId: "checking",
        date: "2026-08-10",
        payeeName: "Rent",
        categoryId: null,
        amountCents: dollarsToCents(-500),
        status: "pending",
      },
    ],
  };
}

describe("hide / unhide", () => {
  it("hides an active account without changing balances", () => {
    const plan = planFixture();
    const before = getAccountBalance(
      plan.accounts[0]!,
      plan.transactions,
    ).balanceCents;
    const next = hideAccount(plan, "checking");
    const account = next.accounts.find((a) => a.id === "checking")!;
    expect(isAccountHidden(account)).toBe(true);
    expect(isAccountClosed(account)).toBe(false);
    expect(
      getAccountBalance(account, next.transactions).balanceCents,
    ).toBe(before);
    expect(getActiveAccounts(next.accounts).some((a) => a.id === "checking")).toBe(
      false,
    );
  });

  it("unhides an account back into active lists", () => {
    let plan = hideAccount(planFixture(), "checking");
    plan = unhideAccount(plan, "checking");
    const account = plan.accounts.find((a) => a.id === "checking")!;
    expect(isAccountHidden(account)).toBe(false);
    expect(getActiveAccounts(plan.accounts).some((a) => a.id === "checking")).toBe(
      true,
    );
  });
});

describe("close account", () => {
  it("closes a zero-balance account", () => {
    const plan = planFixture();
    const result = closeAccount(plan, {
      accountId: "old-ynab",
      strategy: "zero",
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const account = result.plan.accounts.find((a) => a.id === "old-ynab")!;
    expect(isAccountClosed(account)).toBe(true);
    expect(account.closedAt).toBeTruthy();
    expect(account.isHidden).toBe(true);
    expect(
      getActiveAccounts(result.plan.accounts).some((a) => a.id === "old-ynab"),
    ).toBe(false);
  });

  it("rejects silent close with non-zero balance", () => {
    const plan = planFixture();
    const result = closeAccount(plan, {
      accountId: "checking",
      strategy: "zero",
      confirmed: true,
    });
    expect(result.ok).toBe(false);
  });

  it("closes non-zero account using transfer", () => {
    const plan = planFixture();
    const checkingBefore = getAccountBalance(
      plan.accounts[0]!,
      plan.transactions,
    ).balanceCents;
    const savingsBefore = getAccountBalance(
      plan.accounts[1]!,
      plan.transactions,
    ).balanceCents;

    const result = closeAccount(plan, {
      accountId: "checking",
      strategy: "transfer",
      transferToAccountId: "savings",
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const checking = result.plan.accounts.find((a) => a.id === "checking")!;
    const savings = result.plan.accounts.find((a) => a.id === "savings")!;
    expect(isAccountClosed(checking)).toBe(true);
    expect(
      getAccountBalance(checking, result.plan.transactions).balanceCents,
    ).toBe(0);
    expect(
      getAccountBalance(savings, result.plan.transactions).balanceCents,
    ).toBe(savingsBefore + checkingBefore);
    expect(
      result.plan.transactions.some((t) =>
        t.payeeName.includes("Closing transfer"),
      ),
    ).toBe(true);
  });

  it("closes non-zero account using adjustment", () => {
    const plan = planFixture();
    const result = closeAccount(plan, {
      accountId: "checking",
      strategy: "adjustment",
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const checking = result.plan.accounts.find((a) => a.id === "checking")!;
    expect(isAccountClosed(checking)).toBe(true);
    expect(
      getAccountBalance(checking, result.plan.transactions).balanceCents,
    ).toBe(0);
    expect(
      result.plan.transactions.some((t) => t.payeeName === "Closing adjustment"),
    ).toBe(true);
  });

  it("cancel close flow when not confirmed", () => {
    const plan = planFixture();
    const result = closeAccount(plan, {
      accountId: "old-ynab",
      strategy: "zero",
      confirmed: false,
    });
    expect(result.ok).toBe(false);
    expect(isAccountClosed(plan.accounts.find((a) => a.id === "old-ynab")!)).toBe(
      false,
    );
  });

  it("pauses scheduled transactions on close", () => {
    const plan = planFixture();
    const result = closeAccount(plan, {
      accountId: "checking",
      strategy: "adjustment",
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const scheduled = result.plan.scheduledTransactions?.find(
      (s) => s.id === "sch1",
    );
    expect(scheduled?.status).toBe("skipped");
    expect(scheduled?.pausedByAccountClose).toBe(true);
  });

  it("pauseScheduledForAccount marks pending as skipped", () => {
    const plan = planFixture();
    const paused = pauseScheduledForAccount(plan.scheduledTransactions, "checking");
    expect(paused[0]?.pausedByAccountClose).toBe(true);
  });
});

describe("reopen account", () => {
  it("reopens a closed account and restores sidebar visibility", () => {
    let plan = planFixture();
    const closed = closeAccount(plan, {
      accountId: "old-ynab",
      strategy: "zero",
      confirmed: true,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    plan = closed.plan;

    const reopened = reopenAccount(plan, { accountId: "old-ynab" });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    const account = reopened.plan.accounts.find((a) => a.id === "old-ynab")!;
    expect(isAccountClosed(account)).toBe(false);
    expect(account.closedAt).toBeUndefined();
    expect(account.isHidden).toBe(false);
    expect(
      getActiveAccounts(reopened.plan.accounts).some((a) => a.id === "old-ynab"),
    ).toBe(true);
  });
});

describe("closed account guards", () => {
  it("prevents new transactions on closed account", () => {
    const plan = planFixture();
    const closed = closeAccount(plan, {
      accountId: "old-ynab",
      strategy: "zero",
      confirmed: true,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const account = closed.plan.accounts.find((a) => a.id === "old-ynab");
    expect(assertCanAddTransaction(account)).toMatch(/closed/i);
  });

  it("excludes closed accounts from active sidebar lists", () => {
    const plan = planFixture();
    const closed = closeAccount(plan, {
      accountId: "old-ynab",
      strategy: "zero",
      confirmed: true,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    const activeIds = getActiveAccounts(closed.plan.accounts).map((a) => a.id);
    expect(activeIds).not.toContain("old-ynab");
  });

  it("keeps closed history in reports by default", () => {
    const plan = planFixture();
    const closed = closeAccount(plan, {
      accountId: "checking",
      strategy: "adjustment",
      confirmed: true,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    const report = buildReportDataset(
      closed.plan,
      {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        accountIds: [],
        categoryIds: [],
      },
      "2026-08",
    );
    expect(
      report.filteredTransactions.some((t) => t.accountId === "checking"),
    ).toBe(true);
  });

  it("preserves net worth history after transfer close (no double count)", () => {
    const plan = planFixture();
    const filters = {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      accountIds: [] as string[],
      categoryIds: [] as string[],
    };
    const before = buildReportDataset(plan, filters, "2026-08").netWorthCents;

    const closed = closeAccount(plan, {
      accountId: "checking",
      strategy: "transfer",
      transferToAccountId: "savings",
      confirmed: true,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;

    const after = buildReportDataset(closed.plan, filters, "2026-08")
      .netWorthCents;

    expect(after).toBe(before);
  });
});

describe("delete safety", () => {
  it("prevents deleting account with transactions", () => {
    const plan = planFixture();
    expect(canPermanentlyDelete(plan, "checking")).toBe(false);
    expect(getDeleteBlockers(plan, "checking").some((b) => b.code === "has_transactions")).toBe(
      true,
    );
    const result = deleteAccountSafe(plan, "checking");
    expect(result.ok).toBe(false);
  });

  it("allows deleting empty account without history", () => {
    const plan = planFixture();
    // old-ynab has importedSource which blocks delete
    const emptyId = "empty";
    plan.accounts.push({
      id: emptyId,
      name: "Empty",
      type: "cash",
      kind: "on_budget",
      startingBalanceCents: 0,
      currency: "USD",
      closed: false,
      isHidden: false,
      sortOrder: 9,
    });
    expect(canPermanentlyDelete(plan, emptyId)).toBe(true);
    const result = deleteAccountSafe(plan, emptyId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.accounts.some((a) => a.id === emptyId)).toBe(false);
  });
});

describe("bulk hide imported accounts", () => {
  it("bulk hides selected imported accounts", () => {
    const plan = planFixture();
    const next = bulkSetHidden(plan, ["old-ynab"], true);
    expect(next.accounts.find((a) => a.id === "old-ynab")?.isHidden).toBe(true);
    expect(next.accounts.find((a) => a.id === "checking")?.isHidden).toBe(false);
  });
});

describe("close preview", () => {
  it("summarizes balances and scheduled counts", () => {
    const plan = planFixture();
    const preview = buildClosePreview(plan, "checking");
    expect(preview).not.toBeNull();
    expect(preview!.scheduledCount).toBe(1);
    expect(preview!.canCloseSilently).toBe(false);
  });
});
