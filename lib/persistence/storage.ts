import type { StateStorage } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";
import { useSaveStatusStore } from "@/lib/persistence/save-status-store";

export const BUDGET_STORAGE_KEY = "edf-budget-demo";

export type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "failed"
  | "offline_pending";

function notify(status: SaveStatus, error?: string) {
  useSaveStatusStore.getState().setSaveStatus(status, error ?? null);
}

/**
 * localStorage adapter that reports save status.
 * Offline: still writes locally and reports offline_pending (demo has no cloud sync).
 */
export function createTrackedLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof window === "undefined") return null;
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return;
      notify("saving");
      try {
        localStorage.setItem(name, value);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          notify("offline_pending");
        } else {
          notify("saved");
        }
      } catch (err) {
        notify(
          "failed",
          err instanceof Error ? err.message : "Failed to save locally",
        );
      }
    },
    removeItem: (name) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

export const trackedJsonStorage = createJSONStorage(createTrackedLocalStorage);

/** Manual rewrite used by retryPersist when the last write failed. */
export function writePersistedState(serialized: string): {
  ok: boolean;
  status: SaveStatus;
  error?: string;
} {
  if (typeof window === "undefined") {
    return { ok: false, status: "failed", error: "No window" };
  }
  notify("saving");
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, serialized);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      notify("offline_pending");
      return { ok: true, status: "offline_pending" };
    }
    notify("saved");
    return { ok: true, status: "saved" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to save locally";
    notify("failed", error);
    return { ok: false, status: "failed", error };
  }
}
