"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDemoPlan } from "@/lib/seed/demo-plan";
import type {
  BudgetPlan,
  ClearedStatus,
  Transaction,
} from "@/lib/types/budget";
import type { MonthKey } from "@/lib/dates";
import type { Cents } from "@/lib/money";

interface BudgetState {
  plan: BudgetPlan;
  selectedMonthKey: MonthKey;
  selectedCategoryId: string | null;
  sidebarCollapsed: boolean;
  hydrated: boolean;
  setMonth: (monthKey: MonthKey) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  toggleSidebar: () => void;
  toggleGroupCollapsed: (groupId: string) => void;
  toggleHideBalances: () => void;
  setAssigned: (categoryId: string, assignedCents: Cents) => void;
  addTransaction: (
    input: Omit<Transaction, "id" | "approved"> & { approved?: boolean },
  ) => string;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  setCleared: (id: string, cleared: ClearedStatus) => void;
  addTransfer: (input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: Cents;
    date: string;
    memo?: string;
  }) => void;
  resetDemoData: () => void;
  setHydrated: (value: boolean) => void;
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      plan: createDemoPlan(),
      selectedMonthKey: createDemoPlan().workingMonthKey,
      selectedCategoryId: null,
      sidebarCollapsed: false,
      hydrated: false,

      setMonth: (monthKey) => set({ selectedMonthKey: monthKey }),

      setSelectedCategory: (categoryId) =>
        set({ selectedCategoryId: categoryId }),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      toggleGroupCollapsed: (groupId) =>
        set((s) => ({
          plan: {
            ...s.plan,
            categoryGroups: s.plan.categoryGroups.map((g) =>
              g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
            ),
          },
        })),

      toggleHideBalances: () =>
        set((s) => ({
          plan: {
            ...s.plan,
            preferences: {
              ...s.plan.preferences,
              hideBalances: !s.plan.preferences.hideBalances,
            },
          },
        })),

      setAssigned: (categoryId, assignedCents) =>
        set((s) => {
          const monthKey = s.selectedMonthKey;
          const existing = s.plan.monthlyBudgets.find(
            (b) => b.categoryId === categoryId && b.monthKey === monthKey,
          );
          const monthlyBudgets = existing
            ? s.plan.monthlyBudgets.map((b) =>
                b.categoryId === categoryId && b.monthKey === monthKey
                  ? { ...b, assignedCents }
                  : b,
              )
            : [
                ...s.plan.monthlyBudgets,
                { categoryId, monthKey, assignedCents },
              ];
          return { plan: { ...s.plan, monthlyBudgets } };
        }),

      addTransaction: (input) => {
        const id = newId("txn");
        const txn: Transaction = {
          ...input,
          id,
          approved: input.approved ?? true,
        };
        set((s) => ({
          plan: { ...s.plan, transactions: [txn, ...s.plan.transactions] },
        }));
        return id;
      },

      updateTransaction: (id, patch) =>
        set((s) => ({
          plan: {
            ...s.plan,
            transactions: s.plan.transactions.map((t) =>
              t.id === id ? { ...t, ...patch } : t,
            ),
          },
        })),

      deleteTransaction: (id) =>
        set((s) => {
          const target = s.plan.transactions.find((t) => t.id === id);
          let transactions = s.plan.transactions.filter((t) => t.id !== id);
          if (target?.transferPairId) {
            transactions = transactions.filter(
              (t) => t.id !== target.transferPairId,
            );
          }
          return { plan: { ...s.plan, transactions } };
        }),

      setCleared: (id, cleared) =>
        set((s) => ({
          plan: {
            ...s.plan,
            transactions: s.plan.transactions.map((t) =>
              t.id === id ? { ...t, cleared } : t,
            ),
          },
        })),

      addTransfer: ({ fromAccountId, toAccountId, amountCents, date, memo }) => {
        const transferId = newId("xfer");
        const outId = newId("txn");
        const inId = newId("txn");
        const from = get().plan.accounts.find((a) => a.id === fromAccountId);
        const to = get().plan.accounts.find((a) => a.id === toAccountId);

        const outTxn: Transaction = {
          id: outId,
          accountId: fromAccountId,
          date,
          payeeName: `Transfer to ${to?.name ?? "account"}`,
          categoryId: null,
          memo,
          amountCents: -Math.abs(amountCents),
          cleared: "uncleared",
          approved: true,
          isTransfer: true,
          transferId,
          transferPairId: inId,
        };

        const inTxn: Transaction = {
          id: inId,
          accountId: toAccountId,
          date,
          payeeName: `Transfer from ${from?.name ?? "account"}`,
          categoryId: null,
          memo,
          amountCents: Math.abs(amountCents),
          cleared: "uncleared",
          approved: true,
          isTransfer: true,
          transferId,
          transferPairId: outId,
        };

        set((s) => ({
          plan: {
            ...s.plan,
            transactions: [outTxn, inTxn, ...s.plan.transactions],
          },
        }));
      },

      resetDemoData: () => {
        const plan = createDemoPlan();
        set({
          plan,
          selectedMonthKey: plan.workingMonthKey,
          selectedCategoryId: null,
        });
      },

      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: "edf-budget-demo",
      partialize: (state) => ({
        plan: state.plan,
        selectedMonthKey: state.selectedMonthKey,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
