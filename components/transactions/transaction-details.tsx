"use client";

import { useBudgetStore } from "@/lib/store/budget-store";
import { inferTransactionSource } from "@/lib/transactions/edit";
import { formatDisplayDate } from "@/lib/dates";
import { MoneyText } from "@/components/shared/money-text";

export function TransactionDetailsPanel({
  transactionId,
}: {
  transactionId: string;
}) {
  const plan = useBudgetStore((s) => s.plan);
  const importBatches = useBudgetStore((s) => s.importBatches);
  const auditEvents = useBudgetStore((s) => s.auditEvents);
  const undo = useBudgetStore((s) => s.undo);
  const canUndo = useBudgetStore((s) => s.canUndo);
  const undoLabel = useBudgetStore((s) => s.undoLabel);
  const undoStack = useBudgetStore((s) => s.undoStack);

  const txn = plan.transactions.find((t) => t.id === transactionId);
  if (!txn) return null;

  const pair = txn.transferPairId
    ? plan.transactions.find((t) => t.id === txn.transferPairId)
    : undefined;
  const pairAccount = pair
    ? plan.accounts.find((a) => a.id === pair.accountId)
    : undefined;
  const batch = txn.importBatchId
    ? importBatches.find((b) => b.id === txn.importBatchId)
    : undefined;

  const relatedAudit = auditEvents.filter(
    (e) => e.entityType === "transaction" && e.entityId === transactionId,
  );
  const topUndo = undoStack[undoStack.length - 1];
  const canUndoThis =
    canUndo() &&
    topUndo?.entityType === "transaction" &&
    topUndo.entityId === transactionId;

  return (
    <div className="rounded-lg border border-border bg-canvas p-3 space-y-2 text-xs">
      <p className="font-semibold uppercase tracking-wider text-muted">
        Transaction details
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <div>
          <dt className="text-muted">Created</dt>
          <dd>
            {txn.createdAt
              ? formatDisplayDate(txn.createdAt.slice(0, 10))
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Last edited</dt>
          <dd>
            {txn.updatedAt
              ? formatDisplayDate(txn.updatedAt.slice(0, 10))
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Source</dt>
          <dd className="capitalize">{inferTransactionSource(txn)}</dd>
        </div>
        <div>
          <dt className="text-muted">Import batch</dt>
          <dd>{batch?.fileName ?? (txn.importBatchId ? txn.importBatchId : "—")}</dd>
        </div>
        {pair && (
          <div className="col-span-2">
            <dt className="text-muted">Linked transfer</dt>
            <dd>
              {pairAccount?.name ?? "Account"} ·{" "}
              <MoneyText cents={pair.amountCents} signed />
            </dd>
          </div>
        )}
      </dl>

      {txn.splits && txn.splits.length > 0 && (
        <div>
          <p className="text-muted mb-1">Splits</p>
          <ul className="space-y-1">
            {txn.splits.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {plan.categories.find((c) => c.id === s.categoryId)?.name ??
                    "Uncategorized"}
                </span>
                <MoneyText cents={s.amountCents} signed />
              </li>
            ))}
          </ul>
        </div>
      )}

      {relatedAudit.length > 0 && (
        <div>
          <p className="text-muted mb-1">Audit history</p>
          <ul className="space-y-1 max-h-24 overflow-y-auto">
            {relatedAudit.slice(0, 8).map((e) => (
              <li key={e.id}>
                {e.summary}
                <span className="text-muted">
                  {" "}
                  · {formatDisplayDate(e.createdAt.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canUndoThis && (
        <button
          type="button"
          onClick={() => undo()}
          className="text-accent hover:underline"
        >
          Undo last change ({undoLabel()})
        </button>
      )}
    </div>
  );
}
