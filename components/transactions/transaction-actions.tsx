"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export function TransactionActions({
  onEdit,
  onDelete,
  onDetails,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onDetails?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative inline-flex items-center gap-2" ref={ref}>
      <button
        type="button"
        onClick={onEdit}
        className="hidden md:inline text-xs text-accent hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="hidden md:inline text-xs text-muted hover:text-danger"
      >
        Delete
      </button>
      <button
        type="button"
        aria-label="Transaction actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-muted hover:bg-black/5 md:hidden"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <MenuItem
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </MenuItem>
          {onDetails && (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onDetails();
              }}
            >
              Details
            </MenuItem>
          )}
          <MenuItem
            danger
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
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
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-sm hover:bg-black/5 ${
        danger ? "text-danger" : ""
      }`}
    >
      {children}
    </button>
  );
}
