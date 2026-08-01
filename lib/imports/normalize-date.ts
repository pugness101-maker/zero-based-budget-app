import type { DateFormatHint } from "@/lib/types/import";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const DASH_RE = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Excel serial date (days since 1899-12-30, Excel's quirky epoch). */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function normalizeDate(
  raw: string | null | undefined,
  hint: DateFormatHint = "auto",
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Excel serial as plain number
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const excel = fromExcelSerial(n);
      if (excel) return excel;
    }
  }

  const iso = s.match(ISO_RE);
  if (iso) {
    return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = s.match(SLASH_RE) || s.match(DASH_RE);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const y = expandYear(Number(slash[3]));

    if (hint === "YYYY-MM-DD") {
      // already handled above
    }

    if (hint === "DD/MM/YYYY") {
      return toIso(y, b, a);
    }
    if (hint === "MM/DD/YYYY") {
      return toIso(y, a, b);
    }

    // auto: if first > 12 → DD/MM; if second > 12 → MM/DD; else prefer MM/DD
    if (a > 12 && b <= 12) return toIso(y, b, a);
    if (b > 12 && a <= 12) return toIso(y, a, b);
    return toIso(y, a, b);
  }

  // Fallback: Date.parse for strings like "Aug 1, 2026"
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return null;
}
