import type { BudgetPlan } from "@/lib/types/budget";
import type { ImportBatch } from "@/lib/types/import";
import {
  historyLabel,
  MAX_HISTORY_STACK,
  type HistoryActionType,
  type HistoryEntry,
  type HistorySnapshot,
} from "@/lib/history/types";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function cloneSnapshot(
  plan: BudgetPlan,
  importBatches?: ImportBatch[],
): HistorySnapshot {
  return {
    plan: structuredClone(plan),
    importBatches: importBatches
      ? structuredClone(importBatches)
      : undefined,
  };
}

export function createHistoryEntry(input: {
  actionType: HistoryActionType;
  label?: string;
  entityType: string;
  entityId?: string;
  batchId?: string;
  before: HistorySnapshot;
  after: HistorySnapshot;
}): HistoryEntry {
  return {
    id: newId("hist"),
    actionType: input.actionType,
    label: input.label ?? historyLabel(input.actionType),
    entityType: input.entityType,
    entityId: input.entityId,
    batchId: input.batchId,
    householdId: "local",
    userId: "demo",
    before: input.before,
    after: input.after,
    createdAt: new Date().toISOString(),
  };
}

export function pushUndoStack(
  undoStack: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  return [...undoStack, entry].slice(-MAX_HISTORY_STACK);
}

export function applyUndo(input: {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}):
  | {
      ok: true;
      snapshot: HistorySnapshot;
      undoStack: HistoryEntry[];
      redoStack: HistoryEntry[];
      entry: HistoryEntry;
    }
  | { ok: false; error: string } {
  if (input.undoStack.length === 0) {
    return { ok: false, error: "Nothing to undo." };
  }
  const entry = input.undoStack[input.undoStack.length - 1]!;
  const undone: HistoryEntry = {
    ...entry,
    undoneAt: new Date().toISOString(),
  };
  return {
    ok: true,
    snapshot: entry.before,
    undoStack: input.undoStack.slice(0, -1),
    redoStack: [...input.redoStack, undone].slice(-MAX_HISTORY_STACK),
    entry: undone,
  };
}

export function applyRedo(input: {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}):
  | {
      ok: true;
      snapshot: HistorySnapshot;
      undoStack: HistoryEntry[];
      redoStack: HistoryEntry[];
      entry: HistoryEntry;
    }
  | { ok: false; error: string } {
  if (input.redoStack.length === 0) {
    return { ok: false, error: "Nothing to redo." };
  }
  const entry = input.redoStack[input.redoStack.length - 1]!;
  const redone: HistoryEntry = {
    ...entry,
    redoneAt: new Date().toISOString(),
    undoneAt: undefined,
  };
  return {
    ok: true,
    snapshot: entry.after,
    undoStack: [...input.undoStack, redone].slice(-MAX_HISTORY_STACK),
    redoStack: input.redoStack.slice(0, -1),
    entry: redone,
  };
}

export function peekUndoLabel(undoStack: HistoryEntry[]): string | null {
  const top = undoStack[undoStack.length - 1];
  return top ? top.label : null;
}

export function peekRedoLabel(redoStack: HistoryEntry[]): string | null {
  const top = redoStack[redoStack.length - 1];
  return top ? top.label : null;
}
