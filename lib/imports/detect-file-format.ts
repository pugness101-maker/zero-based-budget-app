import { parseCsv } from "@/lib/imports/parse-csv";
import type { DetectedFileFormat } from "@/lib/types/import";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/types/import";

export function validateFileSize(bytes: number): string | null {
  if (bytes <= 0) return "File is empty.";
  if (bytes > MAX_IMPORT_FILE_BYTES) {
    return `File exceeds the ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB limit.`;
  }
  return null;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, " ");
}

export function detectFileFormat(
  fileName: string,
  content: string,
): DetectedFileFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) {
    return "ynab_zip";
  }
  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed.schemaVersion != null ||
          parsed.accounts != null ||
          parsed.transactions != null ||
          (parsed.plan && typeof parsed.plan === "object"))
      ) {
        return "json_backup";
      }
    } catch {
      return "unknown";
    }
    return "unknown";
  }

  if (!lower.endsWith(".csv") && !content.includes(",")) {
    return "unknown";
  }

  const { headers } = parseCsv(content);
  const normalized = headers.map(normalizeHeader);
  const set = new Set(normalized);

  const has = (...names: string[]) => names.some((n) => set.has(n));

  // YNAB-style
  if (
    has("date") &&
    has("payee") &&
    (has("outflow") || has("inflow")) &&
    (has("category") || has("category group/category") || has("memo"))
  ) {
    return "ynab_csv";
  }

  // Account balance CSV
  if (
    (has("account") || has("account name")) &&
    (has("balance") || has("current balance") || has("amount")) &&
    !has("payee") &&
    !has("outflow")
  ) {
    return "account_balance_csv";
  }

  // Category budget CSV
  if (
    (has("category") || has("category name")) &&
    (has("assigned") || has("budgeted") || has("budget")) &&
    (has("month") || has("year") || has("available"))
  ) {
    return "category_budget_csv";
  }

  // Generic bank
  if (
    has("date") &&
    (has("amount") || has("debit") || has("credit") || has("withdrawal") || has("deposit"))
  ) {
    return "generic_bank_csv";
  }

  if (headers.length > 0) return "unknown_csv";
  return "unknown";
}

export function formatLabel(format: DetectedFileFormat): string {
  switch (format) {
    case "json_backup":
      return "JSON app backup";
    case "ynab_zip":
      return "YNAB ZIP export";
    case "ynab_csv":
      return "YNAB-style CSV";
    case "generic_bank_csv":
      return "Generic bank CSV";
    case "account_balance_csv":
      return "Account balance CSV";
    case "category_budget_csv":
      return "Category budget CSV";
    case "unknown_csv":
      return "CSV (unknown layout)";
    default:
      return "Unknown";
  }
}
