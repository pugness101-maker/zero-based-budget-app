import { beforeEach, describe, expect, it } from "vitest";
import { useBudgetStore } from "@/lib/store/budget-store";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import { dollarsToCents } from "@/lib/money";

describe("account audit history via store", () => {
  beforeEach(() => {
    const plan = createDemoPlan();
    useBudgetStore.setState({
      plan,
      auditEvents: [],
      selectedMonthKey: plan.workingMonthKey,
    });
  });

  it("records hide and unhide audit events", () => {
    const checking = useBudgetStore.getState().plan.accounts[0]!;
    useBudgetStore.getState().hideAccount(checking.id);
    expect(
      useBudgetStore.getState().auditEvents.some((e) => e.action === "account_hide"),
    ).toBe(true);

    useBudgetStore.getState().unhideAccount(checking.id);
    expect(
      useBudgetStore
        .getState()
        .auditEvents.some((e) => e.action === "account_unhide"),
    ).toBe(true);
  });

  it("records close and reopen audit events", () => {
    const plan = useBudgetStore.getState().plan;
    // Create a zero-balance throwaway by adjusting brokerage or use empty starting + no txns
    const empty = {
      id: "acct-empty-test",
      name: "Empty Test",
      type: "cash" as const,
      kind: "on_budget" as const,
      startingBalanceCents: 0 as const,
      currency: "USD",
      closed: false,
      isHidden: false,
      sortOrder: 99,
    };
    useBudgetStore.setState({
      plan: { ...plan, accounts: [...plan.accounts, empty] },
    });

    const close = useBudgetStore.getState().closeAccount({
      accountId: empty.id,
      strategy: "zero",
      confirmed: true,
    });
    expect(close.ok).toBe(true);
    expect(
      useBudgetStore.getState().auditEvents.some((e) => e.action === "account_close"),
    ).toBe(true);

    const reopen = useBudgetStore.getState().reopenAccount(empty.id);
    expect(reopen.ok).toBe(true);
    expect(
      useBudgetStore.getState().auditEvents.some((e) => e.action === "account_reopen"),
    ).toBe(true);
  });

  it("records close with transfer strategy in metadata", () => {
    const plan = useBudgetStore.getState().plan;
    const from = plan.accounts.find((a) => a.id === "acct-checking")!;
    const to = plan.accounts.find((a) => a.id === "acct-hysa")!;
    const bal = getAccountBalance(from, plan.transactions).balanceCents;
    expect(bal).not.toBe(0);

    const result = useBudgetStore.getState().closeAccount({
      accountId: from.id,
      strategy: "transfer",
      transferToAccountId: to.id,
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    const event = useBudgetStore
      .getState()
      .auditEvents.find((e) => e.action === "account_close");
    expect(event?.metadata?.strategy).toBe("transfer");
    expect(event?.metadata?.transferToAccountId).toBe(to.id);
  });

  it("blocks addTransaction on closed accounts", () => {
    const plan = useBudgetStore.getState().plan;
    const empty = {
      id: "acct-closed-block",
      name: "Closed Block",
      type: "cash" as const,
      kind: "on_budget" as const,
      startingBalanceCents: dollarsToCents(0),
      currency: "USD",
      closed: false,
      isHidden: false,
      sortOrder: 100,
    };
    useBudgetStore.setState({
      plan: { ...plan, accounts: [...plan.accounts, empty] },
    });
    useBudgetStore.getState().closeAccount({
      accountId: empty.id,
      strategy: "zero",
      confirmed: true,
    });

    expect(() =>
      useBudgetStore.getState().addTransaction({
        accountId: empty.id,
        date: "2026-08-01",
        payeeName: "Nope",
        categoryId: null,
        amountCents: -100,
        cleared: "uncleared",
        isTransfer: false,
      }),
    ).toThrow(/closed/i);
  });
});
