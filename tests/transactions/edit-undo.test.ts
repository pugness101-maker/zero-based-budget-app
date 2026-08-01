import { beforeEach, describe, expect, it } from "vitest";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import { useBudgetStore } from "@/lib/store/budget-store";
import { dollarsToCents } from "@/lib/money";
import {
  applyTransactionEdit,
  amountFromInflowOutflow,
  validateInflowOutflowExclusive,
} from "@/lib/transactions/edit";
import { getAccountBalance } from "@/lib/calculations/account-balances";
import { buildPlanMonthSummary } from "@/lib/calculations/plan";
import { applyRedo, applyUndo, createHistoryEntry, cloneSnapshot, pushUndoStack } from "@/lib/history/action-history";
import type { BudgetPlan, Transaction } from "@/lib/types/budget";

function resetStore() {
  const plan = createDemoPlan();
  useBudgetStore.setState({
    plan,
    auditEvents: [],
    undoStack: [],
    redoStack: [],
    toastMessage: null,
    selectedMonthKey: plan.workingMonthKey,
    importBatches: [],
  });
}

describe("transaction edit validation", () => {
  it("rejects both inflow and outflow", () => {
    expect(validateInflowOutflowExclusive(100, 50)).toMatch(/both/i);
    expect(validateInflowOutflowExclusive(100, 0)).toBeNull();
    expect(amountFromInflowOutflow(250, 0)).toBe(-250);
    expect(amountFromInflowOutflow(0, 250)).toBe(250);
  });

  it("edits ordinary transaction fields", () => {
    resetStore();
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find((t) => !t.isTransfer)!;
    const result = applyTransactionEdit(plan, txn.id, {
      accountId: txn.accountId,
      date: "2026-07-20",
      payeeName: "Edited Payee",
      categoryId: txn.categoryId,
      amountCents: dollarsToCents(-12.5),
      cleared: "cleared",
      memo: "note",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.payeeName).toBe("Edited Payee");
    expect(result.transaction.amountCents).toBe(-1250);
    expect(result.transaction.cleared).toBe("cleared");
  });

  it("changes account category amount and inflow/outflow", () => {
    resetStore();
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find(
      (t) => !t.isTransfer && t.accountId === "acct-checking",
    )!;
    const hysa = "acct-hysa";
    const cat = plan.categories[0]!.id;
    const result = applyTransactionEdit(plan, txn.id, {
      accountId: hysa,
      date: txn.date,
      payeeName: txn.payeeName,
      categoryId: cat,
      amountCents: dollarsToCents(40), // inflow
      cleared: txn.cleared,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.accountId).toBe(hysa);
    expect(result.transaction.categoryId).toBe(cat);
    expect(result.transaction.amountCents).toBe(4000);
  });

  it("rejects mismatched split totals", () => {
    resetStore();
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find((t) => !t.isTransfer)!;
    const result = applyTransactionEdit(plan, txn.id, {
      accountId: txn.accountId,
      date: txn.date,
      payeeName: txn.payeeName,
      categoryId: null,
      amountCents: -1000,
      cleared: "uncleared",
      splits: [
        { id: "s1", categoryId: plan.categories[0]!.id, amountCents: -400 },
        { id: "s2", categoryId: plan.categories[1]?.id ?? null, amountCents: -400 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("edits split transaction when totals match", () => {
    resetStore();
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find((t) => !t.isTransfer)!;
    const result = applyTransactionEdit(plan, txn.id, {
      accountId: txn.accountId,
      date: txn.date,
      payeeName: txn.payeeName,
      categoryId: null,
      amountCents: -1000,
      cleared: "uncleared",
      splits: [
        { id: "s1", categoryId: plan.categories[0]!.id, amountCents: -600 },
        { id: "s2", categoryId: plan.categories[1]?.id ?? null, amountCents: -400 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.splits).toHaveLength(2);
  });

  it("edits linked transfer on both sides", () => {
    resetStore();
    useBudgetStore.getState().addTransfer({
      fromAccountId: "acct-checking",
      toAccountId: "acct-hysa",
      amountCents: dollarsToCents(25),
      date: "2026-07-22",
    });
    const plan = useBudgetStore.getState().plan;
    const out = plan.transactions.find(
      (t) => t.isTransfer && t.amountCents < 0 && t.payeeName.includes("HYSA"),
    )!;
    const result = applyTransactionEdit(plan, out.id, {
      accountId: out.accountId,
      date: "2026-07-23",
      payeeName: out.payeeName,
      categoryId: null,
      amountCents: dollarsToCents(-50),
      cleared: "cleared",
      transferAccountId: "acct-hysa",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pair = result.plan.transactions.find((t) => t.id === out.transferPairId)!;
    expect(pair.amountCents).toBe(5000);
    expect(pair.date).toBe("2026-07-23");
    expect(pair.cleared).toBe("cleared");
  });

  it("blocks editing onto or on closed accounts", () => {
    resetStore();
    const close = useBudgetStore.getState().closeAccount({
      accountId: "acct-brokerage",
      strategy: "zero",
      confirmed: true,
    });
    // brokerage may have non-zero — use adjustment
    if (!close.ok) {
      useBudgetStore.getState().closeAccount({
        accountId: "acct-brokerage",
        strategy: "adjustment",
        confirmed: true,
      });
    }
    const plan = useBudgetStore.getState().plan;
    const checkingTxn = plan.transactions.find(
      (t) => t.accountId === "acct-checking" && !t.isTransfer,
    )!;
    const result = applyTransactionEdit(plan, checkingTxn.id, {
      accountId: "acct-brokerage",
      date: checkingTxn.date,
      payeeName: checkingTxn.payeeName,
      categoryId: checkingTxn.categoryId,
      amountCents: checkingTxn.amountCents,
      cleared: checkingTxn.cleared,
    });
    expect(result.ok).toBe(false);
  });
});

describe("undo / redo history", () => {
  beforeEach(() => resetStore());

  it("delete then undo restores transaction and balances", () => {
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find((t) => !t.isTransfer)!;
    const account = plan.accounts.find((a) => a.id === txn.accountId)!;
    const beforeBal = getAccountBalance(account, plan.transactions).balanceCents;

    useBudgetStore.getState().deleteTransaction(txn.id);
    expect(
      useBudgetStore.getState().plan.transactions.some((t) => t.id === txn.id),
    ).toBe(false);

    const undo = useBudgetStore.getState().undo();
    expect(undo.ok).toBe(true);
    expect(
      useBudgetStore.getState().plan.transactions.some((t) => t.id === txn.id),
    ).toBe(true);
    const restored = useBudgetStore.getState().plan;
    expect(
      getAccountBalance(account, restored.transactions).balanceCents,
    ).toBe(beforeBal);
  });

  it("edit then undo restores previous values", () => {
    const txn = useBudgetStore
      .getState()
      .plan.transactions.find((t) => !t.isTransfer)!;
    const originalPayee = txn.payeeName;
    useBudgetStore.getState().editTransaction(txn.id, {
      accountId: txn.accountId,
      date: txn.date,
      payeeName: "Temp Payee",
      categoryId: txn.categoryId,
      amountCents: txn.amountCents,
      cleared: txn.cleared,
    });
    expect(
      useBudgetStore.getState().plan.transactions.find((t) => t.id === txn.id)
        ?.payeeName,
    ).toBe("Temp Payee");
    useBudgetStore.getState().undo();
    expect(
      useBudgetStore.getState().plan.transactions.find((t) => t.id === txn.id)
        ?.payeeName,
    ).toBe(originalPayee);
  });

  it("undo then redo reapplies without duplicating", () => {
    const beforeCount = useBudgetStore.getState().plan.transactions.length;
    useBudgetStore.getState().addTransaction({
      accountId: "acct-checking",
      date: "2026-07-25",
      payeeName: "UndoRedo",
      categoryId: null,
      amountCents: -100,
      cleared: "uncleared",
      isTransfer: false,
    });
    expect(useBudgetStore.getState().plan.transactions.length).toBe(
      beforeCount + 1,
    );
    useBudgetStore.getState().undo();
    expect(useBudgetStore.getState().plan.transactions.length).toBe(beforeCount);
    useBudgetStore.getState().redo();
    const after = useBudgetStore.getState().plan.transactions;
    expect(after.length).toBe(beforeCount + 1);
    expect(after.filter((t) => t.payeeName === "UndoRedo")).toHaveLength(1);
  });

  it("new action clears redo stack", () => {
    useBudgetStore.getState().addTransaction({
      accountId: "acct-checking",
      date: "2026-07-25",
      payeeName: "A",
      categoryId: null,
      amountCents: -100,
      cleared: "uncleared",
      isTransfer: false,
    });
    useBudgetStore.getState().undo();
    expect(useBudgetStore.getState().canRedo()).toBe(true);
    useBudgetStore.getState().addTransaction({
      accountId: "acct-checking",
      date: "2026-07-26",
      payeeName: "B",
      categoryId: null,
      amountCents: -50,
      cleared: "uncleared",
      isTransfer: false,
    });
    expect(useBudgetStore.getState().canRedo()).toBe(false);
    expect(useBudgetStore.getState().redoStack).toHaveLength(0);
  });

  it("records audit events for undo and redo", () => {
    useBudgetStore.getState().addTransaction({
      accountId: "acct-checking",
      date: "2026-07-25",
      payeeName: "Audit",
      categoryId: null,
      amountCents: -100,
      cleared: "uncleared",
      isTransfer: false,
    });
    useBudgetStore.getState().undo();
    expect(
      useBudgetStore.getState().auditEvents.some((e) => e.action === "undo"),
    ).toBe(true);
    useBudgetStore.getState().redo();
    expect(
      useBudgetStore.getState().auditEvents.some((e) => e.action === "redo"),
    ).toBe(true);
  });

  it("bulk edit and bulk delete are undoable", () => {
    const ids = useBudgetStore
      .getState()
      .plan.transactions.filter((t) => !t.isTransfer)
      .slice(0, 2)
      .map((t) => t.id);
    const cat = useBudgetStore.getState().plan.categories[0]!.id;
    useBudgetStore.getState().bulkEditTransactions(ids, { categoryId: cat });
    for (const id of ids) {
      expect(
        useBudgetStore.getState().plan.transactions.find((t) => t.id === id)
          ?.categoryId,
      ).toBe(cat);
    }
    useBudgetStore.getState().undo();

    useBudgetStore.getState().bulkDeleteTransactions(ids);
    expect(
      useBudgetStore
        .getState()
        .plan.transactions.filter((t) => ids.includes(t.id)),
    ).toHaveLength(0);
    useBudgetStore.getState().undo();
    expect(
      useBudgetStore
        .getState()
        .plan.transactions.filter((t) => ids.includes(t.id)).length,
    ).toBeGreaterThan(0);
  });

  it("undo after simulated navigation restores from stack", () => {
    useBudgetStore.getState().addTransaction({
      accountId: "acct-checking",
      date: "2026-07-25",
      payeeName: "Nav",
      categoryId: null,
      amountCents: -100,
      cleared: "uncleared",
      isTransfer: false,
    });
    // Simulate leaving/returning — stack still in store
    expect(useBudgetStore.getState().undoStack.length).toBeGreaterThan(0);
    useBudgetStore.getState().undo();
    expect(
      useBudgetStore.getState().plan.transactions.some((t) => t.payeeName === "Nav"),
    ).toBe(false);
  });

  it("recalculates category activity after edit", () => {
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions.find(
      (t) => !t.isTransfer && t.categoryId && t.amountCents < 0,
    );
    if (!txn || !txn.categoryId) return;
    const before = buildPlanMonthSummary(plan, plan.workingMonthKey);
    const beforeActivity =
      before.groups
        .flatMap((g) => g.categories)
        .find((c) => c.categoryId === txn.categoryId)?.activityCents ?? 0;

    const edited = applyTransactionEdit(plan, txn.id, {
      accountId: txn.accountId,
      date: txn.date,
      payeeName: txn.payeeName,
      categoryId: txn.categoryId,
      amountCents: (txn.amountCents - 500) as Transaction["amountCents"],
      cleared: txn.cleared,
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const after = buildPlanMonthSummary(edited.plan, plan.workingMonthKey);
    const afterActivity =
      after.groups
        .flatMap((g) => g.categories)
        .find((c) => c.categoryId === txn.categoryId)?.activityCents ?? 0;
    expect(afterActivity).not.toBe(beforeActivity);
  });

  it("history helper undo/redo preserves snapshots", () => {
    const planA = createDemoPlan();
    const planB: BudgetPlan = {
      ...planA,
      name: "Changed",
    };
    let undoStack = pushUndoStack(
      [],
      createHistoryEntry({
        actionType: "edit_transaction",
        entityType: "transaction",
        before: cloneSnapshot(planA),
        after: cloneSnapshot(planB),
      }),
    );
    let redoStack: typeof undoStack = [];
    const u = applyUndo({ undoStack, redoStack });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.snapshot.plan.name).toBe(planA.name);
    undoStack = u.undoStack;
    redoStack = u.redoStack;
    const r = applyRedo({ undoStack, redoStack });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.plan.name).toBe("Changed");
  });

  it("undo imported transaction edit preserves import metadata", () => {
    const plan = useBudgetStore.getState().plan;
    const txn = plan.transactions[0]!;
    const withImport: Transaction = {
      ...txn,
      importBatchId: "batch-test",
      importId: "imp-1",
      source: "import",
    };
    useBudgetStore.setState({
      plan: {
        ...plan,
        transactions: plan.transactions.map((t) =>
          t.id === txn.id ? withImport : t,
        ),
      },
    });
    useBudgetStore.getState().editTransaction(txn.id, {
      accountId: withImport.accountId,
      date: withImport.date,
      payeeName: "Imported Edit",
      categoryId: withImport.categoryId,
      amountCents: withImport.amountCents,
      cleared: withImport.cleared,
    });
    const edited = useBudgetStore
      .getState()
      .plan.transactions.find((t) => t.id === txn.id)!;
    expect(edited.importBatchId).toBe("batch-test");
    expect(edited.payeeName).toBe("Imported Edit");
    useBudgetStore.getState().undo();
    const restored = useBudgetStore
      .getState()
      .plan.transactions.find((t) => t.id === txn.id)!;
    expect(restored.importBatchId).toBe("batch-test");
    expect(restored.payeeName).toBe(withImport.payeeName);
  });
});
