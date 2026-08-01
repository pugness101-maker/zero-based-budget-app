"use client";

import { useEffect } from "react";
import { useBudgetStore } from "@/lib/store/budget-store";

export function ToastHost() {
  const message = useBudgetStore((s) => s.toastMessage);
  const clearToast = useBudgetStore((s) => s.clearToast);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => clearToast(), 2800);
    return () => window.clearTimeout(t);
  }, [message, clearToast]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-border bg-ink px-4 py-2 text-sm text-white shadow-lg"
    >
      {message}
    </div>
  );
}
