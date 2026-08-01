"use client";

import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Undo2,
  Redo2,
  Bell,
  User,
} from "lucide-react";
import { formatMonthLabel, nextMonth, previousMonth } from "@/lib/dates";
import { useBudgetStore } from "@/lib/store/budget-store";
import { useSaveStatusStore } from "@/lib/persistence/save-status-store";
import { shouldHandleUndoRedoShortcut } from "@/lib/history/keyboard";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/lib/persistence/storage";

export function TopBar() {
  const monthKey = useBudgetStore((s) => s.selectedMonthKey);
  const setMonth = useBudgetStore((s) => s.setMonth);
  const hideBalances = useBudgetStore((s) => s.plan.preferences.hideBalances);
  const toggleHideBalances = useBudgetStore((s) => s.toggleHideBalances);
  const undo = useBudgetStore((s) => s.undo);
  const redo = useBudgetStore((s) => s.redo);
  const undoStack = useBudgetStore((s) => s.undoStack);
  const redoStack = useBudgetStore((s) => s.redoStack);
  const saveStatus = useSaveStatusStore((s) => s.saveStatus);
  const retryPersist = useBudgetStore((s) => s.retryPersist);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const undoTip = undoStack[undoStack.length - 1]?.label;
  const redoTip = redoStack[redoStack.length - 1]?.label;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = shouldHandleUndoRedoShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (action === "undo" && canUndo) undo();
      if (action === "redo" && canRedo) redo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-3 md:px-5 backdrop-blur">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMonth(previousMonth(monthKey))}
          className="rounded-lg p-2 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="min-w-[9.5rem] text-center text-sm font-semibold tracking-tight">
          {formatMonthLabel(monthKey)}
        </p>
        <button
          type="button"
          onClick={() => setMonth(nextMonth(monthKey))}
          className="rounded-lg p-2 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <SaveStatusIndicator status={saveStatus} onRetry={retryPersist} />
        <IconButton
          label="Search"
          disabled
          reason="Global search ships with the command menu."
        >
          <Search className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={undoTip ? `Undo “${undoTip}”` : "Undo"}
          disabled={!canUndo}
          reason="Nothing to undo"
          onClick={() => undo()}
        >
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={redoTip ? `Redo “${redoTip}”` : "Redo"}
          disabled={!canRedo}
          reason="Nothing to redo"
          onClick={() => redo()}
        >
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={toggleHideBalances}
          className="rounded-lg p-2 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={hideBalances ? "Show balances" : "Hide balances"}
          title={hideBalances ? "Show balances" : "Hide balances"}
        >
          {hideBalances ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
        <IconButton
          label="Notifications"
          disabled
          reason="Notifications are planned for Phase 3."
        >
          <Bell className="h-4 w-4" />
        </IconButton>
        <div
          className="ml-1 flex items-center gap-2 rounded-full border border-border px-2 py-1"
          title="Demo user"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-muted text-accent">
            <User className="h-3.5 w-3.5" />
          </span>
          <span className="hidden sm:inline text-xs font-medium">Demo</span>
        </div>
      </div>
    </header>
  );
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "failed":
      return "Save failed";
    case "offline_pending":
      return "Offline changes pending";
    default:
      return "";
  }
}

function SaveStatusIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status === "idle") return null;
  const label = saveStatusLabel(status);
  const isFailed = status === "failed";
  return (
    <button
      type="button"
      onClick={isFailed ? onRetry : undefined}
      title={isFailed ? "Retry save" : label}
      className={cn(
        "mr-1 hidden sm:inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium",
        status === "saving" && "text-muted",
        status === "saved" && "text-accent",
        status === "offline_pending" && "text-amber-700",
        isFailed && "text-red-600 hover:bg-red-50 cursor-pointer",
      )}
    >
      {label}
      {isFailed ? " · Retry" : ""}
    </button>
  );
}

function IconButton({
  children,
  label,
  disabled,
  reason,
  className,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  reason?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? reason : label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        disabled
          ? "text-muted opacity-50 cursor-not-allowed"
          : "hover:bg-black/5",
        className,
      )}
    >
      {children}
    </button>
  );
}
