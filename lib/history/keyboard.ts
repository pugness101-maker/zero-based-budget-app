/** True when global undo/redo shortcuts should not intercept. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    return Boolean(el.closest("[contenteditable='true']"));
  }
  return false;
}

export function shouldHandleUndoRedoShortcut(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}): "undo" | "redo" | null {
  if (isEditableTarget(e.target)) return null;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return null;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) return "undo";
  if (key === "z" && e.shiftKey) return "redo";
  if (key === "y" && e.ctrlKey && !e.metaKey) return "redo";
  return null;
}
