import { Suspense } from "react";
import { TransactionsView } from "@/components/transactions/transactions-view";

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 animate-pulse space-y-3">
          <div className="h-8 w-56 rounded bg-black/5" />
          <div className="h-64 rounded-xl bg-black/5" />
        </div>
      }
    >
      <TransactionsView />
    </Suspense>
  );
}
