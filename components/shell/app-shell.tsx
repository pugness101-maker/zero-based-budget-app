"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { ToastHost } from "@/components/shared/toast";
import { useBudgetStore } from "@/lib/store/budget-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useBudgetStore((s) => s.hydrated);
  const setHydrated = useBudgetStore((s) => s.setHydrated);

  useEffect(() => {
    // Ensure UI renders even if persist rehydration is instant/skipped
    if (!hydrated) setHydrated(true);
  }, [hydrated, setHydrated]);

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-x-hidden pb-20 md:pb-6">
          {!hydrated ? (
            <div className="p-6 animate-pulse space-y-3">
              <div className="h-8 w-48 rounded bg-black/5" />
              <div className="h-24 rounded-xl bg-black/5" />
              <div className="h-64 rounded-xl bg-black/5" />
            </div>
          ) : (
            children
          )}
        </main>
        <MobileNav />
        <ToastHost />
      </div>
    </div>
  );
}
