"use client";

import { useState } from "react";

/** Desktop inline editor: Enter saves, Escape cancels, Tab blurs to next. */
export function InlineTextCell({
  value,
  displayValue,
  onSave,
  className,
  type = "text",
}: {
  value: string;
  displayValue?: string;
  onSave: (next: string) => boolean | void;
  className?: string;
  type?: "text" | "date";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className={`text-left w-full hover:bg-black/5 rounded px-1 -mx-1 ${className ?? ""}`}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Double-click to edit"
      >
        {(displayValue ?? value) || "—"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      className="input py-1 text-sm"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const ok = onSave(draft);
          if (ok !== false) setEditing(false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          setEditing(false);
        }
      }}
      onBlur={() => {
        const ok = onSave(draft);
        if (ok !== false) setEditing(false);
        else setDraft(value);
      }}
    />
  );
}
