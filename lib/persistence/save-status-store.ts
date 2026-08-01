import { create } from "zustand";
import type { SaveStatus } from "@/lib/persistence/storage";

interface SaveStatusState {
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  saveError: string | null;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
}

/** Separate from the budget persist store to avoid write → status → write loops. */
export const useSaveStatusStore = create<SaveStatusState>((set) => ({
  saveStatus: "idle",
  lastSavedAt: null,
  saveError: null,
  setSaveStatus: (status, error = null) =>
    set((s) => ({
      saveStatus: status,
      saveError: error ?? null,
      lastSavedAt:
        status === "saved" || status === "offline_pending"
          ? new Date().toISOString()
          : s.lastSavedAt,
    })),
}));
