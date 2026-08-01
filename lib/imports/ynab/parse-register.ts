import { parseCsv } from "@/lib/imports/parse-csv";
import { combineOutflowInflow } from "@/lib/imports/normalize-money";
import { normalizeDate } from "@/lib/imports/normalize-date";
import type { ClearedStatus } from "@/lib/types/budget";

export interface YnabRegisterRow {
  rowIndex: number;
  raw: Record<string, string>;
  accountName: string;
  flag?: string;
  date: string | null;
  payeeName: string;
  categoryGroupCategory?: string;
  categoryGroup?: string;
  category?: string;
  memo?: string;
  outflowCents: number | null;
  inflowCents: number | null;
  amountCents: number | null;
  cleared: ClearedStatus;
  isTransfer: boolean;
  transferTargetAccount?: string;
  isFuture: boolean;
  isZeroAmount: boolean;
  errors: string[];
}

const REGISTER_HEADERS = [
  "Account",
  "Flag",
  "Date",
  "Payee",
  "Category Group/Category",
  "Category Group",
  "Category",
  "Memo",
  "Outflow",
  "Inflow",
  "Cleared",
] as const;

export function isYnabRegisterCsv(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return (
    set.has("Account") &&
    set.has("Date") &&
    set.has("Payee") &&
    set.has("Outflow") &&
    set.has("Inflow") &&
    set.has("Cleared")
  );
}

export function parseYnabCleared(raw: string | undefined): ClearedStatus {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "reconciled" || v === "r") return "reconciled";
  if (v === "cleared" || v === "c" || v === "cleared ") return "cleared";
  return "uncleared";
}

/** YNAB transfer payees look like "Transfer : Checking" or "Transfer: Savings". */
export function parseTransferPayee(payee: string): {
  isTransfer: boolean;
  targetAccount?: string;
} {
  const m = payee.match(/^transfer\s*:\s*(.+)$/i);
  if (!m) return { isTransfer: false };
  return { isTransfer: true, targetAccount: m[1]!.trim() };
}

export function parseYnabRegisterCsv(
  content: string,
  importDateIso: string,
): {
  headers: string[];
  rows: YnabRegisterRow[];
  headerOk: boolean;
} {
  const parsed = parseCsv(content);
  const headerOk = isYnabRegisterCsv(parsed.headers);
  const rows: YnabRegisterRow[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i]!;
    const errors: string[] = [];
    const accountName = (raw.Account ?? "").trim();
    const payeeName = (raw.Payee ?? "").trim();
    const date = normalizeDate(raw.Date, "auto");
    if (!accountName) errors.push("Missing account.");
    if (!date) errors.push("Invalid date.");

    const amountCents = combineOutflowInflow(raw.Outflow, raw.Inflow);
    const outflowCents =
      raw.Outflow?.trim()
        ? combineOutflowInflow(raw.Outflow, "")
        : null;
    const inflowCents =
      raw.Inflow?.trim()
        ? combineOutflowInflow("", raw.Inflow)
        : null;

    const isZeroAmount = amountCents === 0 || amountCents === null;
    const transfer = parseTransferPayee(payeeName);
    const cleared = parseYnabCleared(raw.Cleared);
    const isFuture = Boolean(date && date > importDateIso);

    // Zero-amount rows: keep only if they look like valid scheduled/future placeholders
    if (isZeroAmount && amountCents === null) {
      errors.push("Invalid amount.");
    }

    const flag = (raw.Flag ?? "").trim() || undefined;
    const categoryGroup = (raw["Category Group"] ?? "").trim() || undefined;
    const category = (raw.Category ?? "").trim() || undefined;
    const categoryGroupCategory =
      (raw["Category Group/Category"] ?? "").trim() || undefined;

    rows.push({
      rowIndex: i + 1,
      raw,
      accountName,
      flag,
      date,
      payeeName: payeeName || "Imported",
      categoryGroupCategory,
      categoryGroup,
      category,
      memo: (raw.Memo ?? "").trim() || undefined,
      outflowCents,
      inflowCents,
      amountCents,
      cleared,
      isTransfer: transfer.isTransfer,
      transferTargetAccount: transfer.targetAccount,
      isFuture,
      isZeroAmount: amountCents === 0,
      errors,
    });
  }

  return { headers: parsed.headers, rows, headerOk };
}

export { REGISTER_HEADERS };
