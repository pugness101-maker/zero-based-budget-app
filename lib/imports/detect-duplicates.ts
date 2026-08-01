import type { Transaction } from "@/lib/types/budget";
import type { ImportRow } from "@/lib/types/import";

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function memoSimilarity(a: string | undefined, b: string | undefined): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  const denom = Math.max(ta.size, tb.size);
  return denom === 0 ? 0 : overlap / denom;
}

export interface DuplicateMatch {
  rowId: string;
  transactionId: string;
  reason: "import_id" | "exact" | "fuzzy";
}

/**
 * Detect duplicates against existing transactions for a destination account.
 * Never auto-imports — caller decides skip / import anyway / review.
 */
export function detectDuplicates(
  rows: ImportRow[],
  existing: Transaction[],
  accountId: string,
): { rows: ImportRow[]; matches: DuplicateMatch[] } {
  const accountTxns = existing.filter((t) => t.accountId === accountId);
  const byImportId = new Map<string, Transaction>();
  for (const t of accountTxns) {
    if (t.importId) byImportId.set(t.importId, t);
  }

  const matches: DuplicateMatch[] = [];
  const next = rows.map((row) => {
    if (row.status === "invalid") return row;

    if (row.importId && byImportId.has(row.importId)) {
      const hit = byImportId.get(row.importId)!;
      matches.push({
        rowId: row.id,
        transactionId: hit.id,
        reason: "import_id",
      });
      return {
        ...row,
        status: "duplicate" as const,
        duplicateOfTransactionId: hit.id,
        include: false,
        errors: [...row.errors, "Duplicate import ID."],
      };
    }

    const exact = accountTxns.find(
      (t) =>
        t.date === row.parsedDate &&
        t.amountCents === row.parsedAmountCents &&
        normalizeText(t.payeeName) === normalizeText(row.payeeName),
    );
    if (exact) {
      matches.push({
        rowId: row.id,
        transactionId: exact.id,
        reason: "exact",
      });
      return {
        ...row,
        status: "duplicate" as const,
        duplicateOfTransactionId: exact.id,
        include: false,
        errors: [...row.errors, "Exact match on date, amount, and payee."],
      };
    }

    const fuzzy = accountTxns.find(
      (t) =>
        t.date === row.parsedDate &&
        t.amountCents === row.parsedAmountCents &&
        memoSimilarity(t.payeeName, row.payeeName) >= 0.7 &&
        memoSimilarity(t.memo, row.memo) >= 0.5,
    );
    if (fuzzy) {
      matches.push({
        rowId: row.id,
        transactionId: fuzzy.id,
        reason: "fuzzy",
      });
      return {
        ...row,
        status: "duplicate" as const,
        duplicateOfTransactionId: fuzzy.id,
        include: false,
        errors: [...row.errors, "Fuzzy duplicate (date, amount, similar payee/memo)."],
      };
    }

    return row;
  });

  // Also detect duplicates within the import file itself
  const seen = new Map<string, string>();
  const withInternal = next.map((row) => {
    if (row.status === "invalid" || !row.parsedDate || row.parsedAmountCents == null)
      return row;
    const key = `${row.parsedDate}|${row.parsedAmountCents}|${normalizeText(row.payeeName)}|${row.importId ?? ""}`;
    const prior = seen.get(key);
    if (prior) {
      matches.push({ rowId: row.id, transactionId: prior, reason: "exact" });
      return {
        ...row,
        status: "duplicate" as const,
        include: false,
        errors: [...row.errors, "Duplicate of another row in this file."],
      };
    }
    seen.set(key, row.id);
    return row;
  });

  return { rows: withInternal, matches };
}
