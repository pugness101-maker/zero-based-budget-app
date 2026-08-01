"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Wallet,
  Plus,
  BarChart3,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/plan", label: "Plan", icon: LayoutGrid },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  {
    href: "/transactions?new=1",
    label: "Add",
    icon: Plus,
    emphasize: true,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    disabled: true,
    reason: "Reports ship in the next Phase 1 increment.",
  },
  { href: "/settings", label: "More", icon: Menu },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5 h-16">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            !("disabled" in item && item.disabled) &&
            pathname.startsWith(item.href.split("?")[0]!);
          const disabled = "disabled" in item && item.disabled;

          if (disabled) {
            return (
              <li key={item.label} className="flex">
                <button
                  type="button"
                  disabled
                  title={item.reason}
                  className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted opacity-50 cursor-not-allowed"
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              </li>
            );
          }

          return (
            <li key={item.label} className="flex">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  "emphasize" in item && item.emphasize
                    ? "text-accent"
                    : active
                      ? "text-accent"
                      : "text-muted",
                )}
              >
                {"emphasize" in item && item.emphasize ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white shadow-sm -mt-1">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
