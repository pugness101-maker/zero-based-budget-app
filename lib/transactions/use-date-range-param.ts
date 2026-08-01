"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  applyDateRangeToSearchParams,
  parseDateRangeFromSearchParams,
  type DateRangeSelection,
} from "@/lib/transactions/date-range";

/** Sync date range filter with `range` / `start` / `end` URL query params. */
export function useDateRangeParam(weekStartsOn: 0 | 1 = 0): {
  dateRange: DateRangeSelection;
  setDateRange: (next: DateRangeSelection) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dateRange = useMemo(
    () =>
      parseDateRangeFromSearchParams(searchParams, {
        weekStartsOn,
      }),
    [searchParams, weekStartsOn],
  );

  const setDateRange = useCallback(
    (next: DateRangeSelection) => {
      const params = applyDateRangeToSearchParams(
        new URLSearchParams(searchParams.toString()),
        next,
      );
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { dateRange, setDateRange };
}
