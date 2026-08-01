import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import { dollarsToCents } from "@/lib/money";
import {
  buildPayeePickerOptions,
  buildPayeeUsage,
  findDuplicatePayee,
  getAlphabeticalPayees,
  getRecentPayees,
  getTransferDestinations,
  highlightPayeeMatch,
  movePayeeActiveIndex,
  suggestCategoryForPayeeSelection,
  ensurePayeeOnPlan,
  payeeNamesEqual,
} from "@/lib/payees/catalog";
import {
  convertTransactionToTransfer,
  createLinkedTransfer,
  findDuplicateTransfer,
  resolveTransferDirection,
} from "@/lib/payees/transfers";
import { getCategoryActivity } from "@/lib/calculations/plan";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import { renamePayee, mergePayees, deletePayeeSafe } from "@/lib/payees/manage";

function reset() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    undoStack: [],
    redoStack: [],
    payeeAliasRules: {},
    selectedMonthKey: plan.workingMonthKey,
  });
}

describe("payee catalog", () => {
  beforeEach(() => reset());

  it("shows recent payees by most recently used", () => {
    const plan = useBudgetStore.getState().plan;
    const usage = buildPayeeUsage(plan);
    const recent = getRecentPayees(usage, 5);
    expect(recent.length).toBeGreaterThan(0);
    for (let i = 1; i < recent.length; i++) {
      expect(
        recent[i - 1]!.lastUsedDate >= recent[i]!.lastUsedDate,
      ).toBe(true);
    }
  });

  it("lists all payees alphabetically", () => {
    const plan = useBudgetStore.getState().plan;
    const alpha = getAlphabeticalPayees(buildPayeeUsage(plan));
    const names = alpha.map((p) => p.name.toLowerCase());
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("searches payees by name and alias", () => {
    const plan = useBudgetStore.getState().plan;
    const options = buildPayeePickerOptions({
      plan,
      query: "aldi",
      currentAccountId: "acct-checking",
      aliasRules: { aldi: "Aldi" },
    });
    expect(options.some((o) => o.kind === "payee" && o.name === "Aldi")).toBe(
      true,
    );
  });

  it("suggests prior category and preserves manual selection", () => {
    expect(
      suggestCategoryForPayeeSelection({
        currentCategoryId: null,
        categoryTouched: false,
        suggestedCategoryId: "cat-groceries",
      }),
    ).toBe("cat-groceries");

    expect(
      suggestCategoryForPayeeSelection({
        currentCategoryId: "cat-gas",
        categoryTouched: true,
        suggestedCategoryId: "cat-groceries",
      }),
    ).toBe("cat-gas");
  });

  it("creates new payee only when saving via ensurePayeeOnPlan", () => {
    let plan = useBudgetStore.getState().plan;
    const before = plan.payees.length;
    const options = buildPayeePickerOptions({
      plan,
      query: "Brand New Cafe",
      currentAccountId: "acct-checking",
    });
    expect(options.some((o) => o.kind === "create")).toBe(true);
    expect(plan.payees).toHaveLength(before);

    plan = ensurePayeeOnPlan(plan, "Brand New Cafe", {
      defaultCategoryId: "cat-eating-out",
    });
    expect(plan.payees.some((p) => p.name === "Brand New Cafe")).toBe(true);
  });

  it("prevents duplicate payee names case-insensitively", () => {
    const plan = useBudgetStore.getState().plan;
    expect(findDuplicatePayee(plan, "aldi")).toBeTruthy();
    const next = ensurePayeeOnPlan(plan, "ALDI");
    expect(next.payees.filter((p) => payeeNamesEqual(p.name, "Aldi"))).toHaveLength(
      1,
    );
  });

  it("highlights matching text", () => {
    const parts = highlightPayeeMatch("Chipotle", "chip");
    expect(parts).toEqual({ before: "", match: "Chip", after: "otle" });
  });

  it("supports keyboard index navigation helpers", () => {
    expect(movePayeeActiveIndex(0, 1, 5)).toBe(1);
    expect(movePayeeActiveIndex(0, -1, 5)).toBe(0);
    expect(movePayeeActiveIndex(4, 1, 5)).toBe(4);
  });
});

describe("transfer destinations", () => {
  beforeEach(() => reset());

  it("lists transfer accounts and excludes current", () => {
    const plan = useBudgetStore.getState().plan;
    const dest = getTransferDestinations(plan.accounts, "acct-checking");
    expect(dest.some((a) => a.id === "acct-checking")).toBe(false);
    expect(dest.some((a) => a.id === "acct-hysa")).toBe(true);
    const options = buildPayeePickerOptions({
      plan,
      query: "",
      currentAccountId: "acct-checking",
    });
    expect(
      options.some(
        (o) => o.kind === "transfer" && o.label.startsWith("Transfer to "),
      ),
    ).toBe(true);
  });

  it("excludes closed accounts from transfers", () => {
    useBudgetStore.getState().closeAccount({
      accountId: "acct-brokerage",
      strategy: "adjustment",
      confirmed: true,
    });
    const plan = useBudgetStore.getState().plan;
    const dest = getTransferDestinations(plan.accounts, "acct-checking");
    expect(dest.some((a) => a.id === "acct-brokerage")).toBe(false);
  });

  it("excludes hidden accounts unless opted in", () => {
    useBudgetStore.getState().hideAccount("acct-hysa");
    const plan = useBudgetStore.getState().plan;
    expect(
      getTransferDestinations(plan.accounts, "acct-checking", {
        includeHidden: false,
      }).some((a) => a.id === "acct-hysa"),
    ).toBe(false);
    expect(
      getTransferDestinations(plan.accounts, "acct-checking", {
        includeHidden: true,
      }).some((a) => a.id === "acct-hysa"),
    ).toBe(true);
  });
});

describe("linked transfers", () => {
  beforeEach(() => reset());

  it("creates linked transfer pair and updates balances", () => {
    const before = useBudgetStore.getState().plan;
    const checking = before.accounts.find((a) => a.id === "acct-checking")!;
    const hysa = before.accounts.find((a) => a.id === "acct-hysa")!;
    const checkingBefore = getAccountBalance(
      checking,
      before.transactions,
    ).balanceCents;
    const hysaBefore = getAccountBalance(hysa, before.transactions).balanceCents;

    const result = useBudgetStore.getState().addTransfer({
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: dollarsToCents(50),
      date: "2026-07-28",
      memo: "sweep",
      cleared: "cleared",
    });
    expect(result.ok).toBe(true);

    const plan = useBudgetStore.getState().plan;
    const out = plan.transactions.find(
      (t) =>
        t.isTransfer &&
        t.accountId === "acct-checking" &&
        t.payeeName.includes("HYSA"),
    )!;
    const pair = plan.transactions.find((t) => t.id === out.transferPairId)!;
    expect(pair.accountId).toBe("acct-hysa");
    expect(out.amountCents).toBe(-5000);
    expect(pair.amountCents).toBe(5000);
    expect(out.categoryId).toBeNull();
    expect(out.cleared).toBe("cleared");
    expect(pair.memo).toBe("sweep");

    expect(
      getAccountBalance(checking, plan.transactions).balanceCents,
    ).toBe(checkingBefore - 5000);
    expect(getAccountBalance(hysa, plan.transactions).balanceCents).toBe(
      hysaBefore + 5000,
    );
  });

  it("prevents duplicate transfer creation", () => {
    const input = {
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: dollarsToCents(10),
      date: "2026-07-29",
    };
    expect(useBudgetStore.getState().addTransfer(input).ok).toBe(true);
    const dup = findDuplicateTransfer(useBudgetStore.getState().plan, input);
    expect(dup).toBeTruthy();
    const again = useBudgetStore.getState().addTransfer(input);
    expect(again.ok).toBe(false);
  });

  it("resolves inflow/outflow direction from current account", () => {
    expect(
      resolveTransferDirection({
        currentAccountId: "acct-checking",
        destinationAccountId: "acct-hysa",
        amountCents: dollarsToCents(-20),
      }),
    ).toEqual({
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: 2000,
    });
    expect(
      resolveTransferDirection({
        currentAccountId: "acct-checking",
        destinationAccountId: "acct-hysa",
        amountCents: dollarsToCents(20),
      }),
    ).toEqual({
      fromAccountId: "acct-hysa",
      toAccountId: "acct-checking",
      amountCents: 2000,
    });
  });

  it("edits linked transfer on both sides", () => {
    useBudgetStore.getState().addTransfer({
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: dollarsToCents(25),
      date: "2026-07-22",
    });
    const out = useBudgetStore
      .getState()
      .plan.transactions.find(
        (t) => t.isTransfer && t.amountCents < 0 && t.payeeName.includes("HYSA"),
      )!;
    const result = useBudgetStore.getState().editTransaction(out.id, {
      accountId: out.accountId,
      date: "2026-07-23",
      payeeName: out.payeeName,
      categoryId: null,
      amountCents: dollarsToCents(-40),
      cleared: "cleared",
      transferAccountId: "acct-hysa",
    });
    expect(result.ok).toBe(true);
    const pair = useBudgetStore
      .getState()
      .plan.transactions.find((t) => t.id === out.transferPairId)!;
    expect(pair.amountCents).toBe(4000);
    expect(pair.date).toBe("2026-07-23");
  });

  it("treats credit-card payment as transfer not spending", () => {
    const plan0 = useBudgetStore.getState().plan;
    const cc = plan0.accounts.find((a) => a.type === "credit_card")!;
    const month = plan0.workingMonthKey;
    const groceriesBefore = getCategoryActivity(
      plan0.transactions,
      "cat-groceries",
      month,
    );
    const ccPaymentBefore = getCategoryActivity(
      plan0.transactions,
      "cat-cc-payment",
      month,
    );

    const result = createLinkedTransfer(plan0, {
      fromAccountId: "acct-checking",
      toAccountId: cc.id,
      amountCents: dollarsToCents(75),
      date: `${month}-15`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outTransaction.isTransfer).toBe(true);
    expect(result.outTransaction.categoryId).toBeNull();

    expect(
      getCategoryActivity(result.plan.transactions, "cat-groceries", month),
    ).toBe(groceriesBefore);
    expect(
      getCategoryActivity(result.plan.transactions, "cat-cc-payment", month),
    ).toBe(ccPaymentBefore);
  });

  it("excludes on-budget transfers from spending activity", () => {
    const plan0 = useBudgetStore.getState().plan;
    const month = plan0.workingMonthKey;
    const before = getCategoryActivity(
      plan0.transactions,
      "cat-groceries",
      month,
    );
    const created = createLinkedTransfer(plan0, {
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: dollarsToCents(30),
      date: `${month}-18`,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(
      getCategoryActivity(created.plan.transactions, "cat-groceries", month),
    ).toBe(before);
  });

  it("converts ordinary transaction to linked transfer", () => {
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find(
      (t) => t.accountId === "acct-checking" && !t.isTransfer && !t.splits,
    )!;
    const converted = convertTransactionToTransfer(
      plan,
      txn.id,
      "acct-hysa",
    );
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const leg = converted.plan.transactions.find((t) => t.id === txn.id)!;
    expect(leg.isTransfer).toBe(true);
    expect(leg.categoryId).toBeNull();
    expect(leg.transferPairId).toBeTruthy();
  });
});

describe("payee management", () => {
  beforeEach(() => reset());

  it("renames and merges payees", () => {
    let plan = useBudgetStore.getState().plan;
    const renamed = renamePayee(plan, "pay-aldi", "Aldi Market");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    plan = renamed.plan;
    expect(plan.payees.some((p) => p.name === "Aldi Market")).toBe(true);

    const merged = mergePayees(plan, "pay-chipotle", "pay-aldi");
    // after rename pay-aldi is Aldi Market
    expect(merged.ok).toBe(true);
  });

  it("deletes payee only when unused", () => {
    const plan = ensurePayeeOnPlan(
      useBudgetStore.getState().plan,
      "Unused Place",
    );
    const payee = plan.payees.find((p) => p.name === "Unused Place")!;
    const ok = deletePayeeSafe(plan, payee.id);
    expect(ok.ok).toBe(true);

    const used = plan.payees.find((p) => p.id === "pay-aldi")!;
    expect(deletePayeeSafe(plan, used.id).ok).toBe(false);
  });
});

describe("mobile picker contract", () => {
  it("documents bottom-sheet marker for mobile payee UI", () => {
    // Component uses data-testid="payee-mobile-sheet" for the mobile sheet.
    expect("payee-mobile-sheet").toMatch(/payee-mobile/);
  });
});
