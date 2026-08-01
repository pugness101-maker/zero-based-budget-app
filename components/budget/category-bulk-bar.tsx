"use client";

export function CategoryBulkBar({
  selectedCount,
  onHide,
  onArchive,
  onMove,
  onMerge,
  onDelete,
  onClear,
  onSelectAll,
  onExit,
  showSelectAll,
  extraActions,
}: {
  selectedCount: number;
  onHide?: () => void;
  onArchive?: () => void;
  onMove?: () => void;
  onMerge?: () => void;
  onDelete?: () => void;
  onClear: () => void;
  onSelectAll?: () => void;
  onExit?: () => void;
  showSelectAll?: boolean;
  extraActions?: React.ReactNode;
}) {
  if (selectedCount === 0 && !onExit) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:sticky md:bottom-auto md:top-0 md:rounded-xl md:border md:shadow-sm"
      role="toolbar"
      aria-label="Category bulk actions"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {selectedCount} selected
        </span>
        {showSelectAll && onSelectAll && (
          <button
            type="button"
            onClick={onSelectAll}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Select All
          </button>
        )}
        {selectedCount > 0 && (
          <>
            {onHide && (
              <ActionButton onClick={onHide}>Hide</ActionButton>
            )}
            {onArchive && (
              <ActionButton onClick={onArchive}>Archive</ActionButton>
            )}
            {onMove && (
              <ActionButton onClick={onMove}>Move</ActionButton>
            )}
            {onMerge && (
              <ActionButton onClick={onMerge}>Merge</ActionButton>
            )}
            {onDelete && (
              <ActionButton onClick={onDelete} danger>
                Delete
              </ActionButton>
            )}
            {extraActions}
            <ActionButton onClick={onClear}>Clear Selection</ActionButton>
          </>
        )}
        {onExit && (
          <ActionButton onClick={onExit}>Exit Select Mode</ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        danger
          ? "min-h-11 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5"
          : "min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
      }
    >
      {children}
    </button>
  );
}
