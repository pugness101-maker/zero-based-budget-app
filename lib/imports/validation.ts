import type { ColumnMapping, DateFormatHint, ImportRow } from "@/lib/types/import";
import { combineOutflowInflow, normalizeMoneyToCents } from "@/lib/imports/normalize-money";
import { normalizeDate } from "@/lib/imports/normalize-date";
import type { ClearedStatus } from "@/lib/types/budget";

export function invertMapping(mapping: ColumnMapping): Partial<Record<string, string>> {
  const inverted: Partial<Record<string, string>> = {};
  for (const [source, field] of Object.entries(mapping)) {
    if (field === "ignore") continue;
    inverted[field] = source;
  }
  return inverted;
}

export function parseCleared(raw: string | undefined): ClearedStatus | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (["c", "cleared", "posted", "reconciled", "r", "x", "yes", "true"].includes(v)) {
    return v === "r" || v === "reconciled" ? "reconciled" : "cleared";
  }
  if (["uncleared", "pending", "u", "no", "false", ""].includes(v)) {
    return "uncleared";
  }
  return undefined;
}

export function mapRawRow(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  dateFormat: DateFormatHint,
  rowIndex: number,
  batchId: string,
): ImportRow {
  const inv = invertMapping(mapping);
  const errors: string[] = [];

  const dateRaw = inv.date ? raw[inv.date] : undefined;
  const parsedDate = normalizeDate(dateRaw, dateFormat);
  if (inv.date && !parsedDate) errors.push("Invalid or missing date.");

  let parsedAmountCents: number | null = null;
  if (inv.outflow || inv.inflow) {
    parsedAmountCents = combineOutflowInflow(
      inv.outflow ? raw[inv.outflow] : undefined,
      inv.inflow ? raw[inv.inflow] : undefined,
    );
  } else if (inv.amount) {
    parsedAmountCents = normalizeMoneyToCents(raw[inv.amount!]);
  }

  if (parsedAmountCents === null) {
    errors.push("Invalid or missing amount.");
  }

  const payeeName = (inv.payee ? raw[inv.payee] : "")?.trim() || "Imported";
  const memo = inv.memo ? raw[inv.memo]?.trim() : undefined;
  const categoryName = inv.category ? raw[inv.category]?.trim() : undefined;
  const accountName = inv.account ? raw[inv.account]?.trim() : undefined;
  const importId = inv.importId ? raw[inv.importId]?.trim() : undefined;
  const flag = inv.flag ? raw[inv.flag]?.trim() : undefined;
  const cleared = parseCleared(inv.cleared ? raw[inv.cleared] : undefined);

  let status: ImportRow["status"] = errors.length ? "invalid" : "ready";
  if (!errors.length && categoryName === undefined) {
    // uncategorized is allowed
    status = "ready";
  }

  return {
    id: `${batchId}-row-${rowIndex}`,
    batchId,
    rowIndex,
    raw,
    parsedDate: parsedDate ?? undefined,
    parsedAmountCents: parsedAmountCents ?? undefined,
    payeeName,
    memo,
    categoryName,
    accountName,
    cleared,
    flag,
    importId,
    status,
    errors,
    include: errors.length === 0,
  };
}

export function validateMapping(mapping: ColumnMapping): string[] {
  const fields = Object.values(mapping);
  const errors: string[] = [];
  if (!fields.includes("date")) errors.push("Map a Date column.");
  const hasAmount =
    fields.includes("amount") ||
    fields.includes("outflow") ||
    fields.includes("inflow");
  if (!hasAmount) errors.push("Map Amount, or Outflow/Inflow columns.");
  return errors;
}
