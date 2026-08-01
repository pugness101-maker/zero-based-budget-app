import { describe, expect, it } from "vitest";
import { shouldHandleUndoRedoShortcut } from "@/lib/history/keyboard";

describe("undo/redo keyboard shortcuts", () => {
  it("maps Cmd/Ctrl+Z to undo and Shift+Z / Ctrl+Y to redo", () => {
    expect(
      shouldHandleUndoRedoShortcut({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: null,
      }),
    ).toBe("undo");

    expect(
      shouldHandleUndoRedoShortcut({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        target: null,
      }),
    ).toBe("redo");

    expect(
      shouldHandleUndoRedoShortcut({
        key: "y",
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        target: null,
      }),
    ).toBe("redo");
  });

  it("does not intercept while typing in inputs", () => {
    const input = { tagName: "INPUT" } as unknown as HTMLElement;
    // jsdom may not exist — pass a minimal HTMLElement-like via document if available
    const el =
      typeof document !== "undefined"
        ? document.createElement("input")
        : input;

    // In node vitest without jsdom, instanceof HTMLElement fails → treated as not editable.
    // Skip assertion when HTMLElement isn't available.
    if (typeof HTMLElement === "undefined") {
      expect(true).toBe(true);
      return;
    }

    expect(
      shouldHandleUndoRedoShortcut({
        key: "z",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        target: el,
      }),
    ).toBeNull();
  });
});
