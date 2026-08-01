import type {
  ColumnMapping,
  DetectedFileFormat,
  ImportMappingPreset,
} from "@/lib/types/import";

function preset(
  id: string,
  name: string,
  fileFormat: DetectedFileFormat,
  mapping: ColumnMapping,
  institution?: string,
): ImportMappingPreset {
  return {
    id,
    name,
    institution,
    fileFormat,
    mapping,
    dateFormat: "auto",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

export const BUILTIN_MAPPING_PRESETS: ImportMappingPreset[] = [
  preset(
    "preset-ynab",
    "YNAB-style export",
    "ynab_csv",
    {
      Date: "date",
      Payee: "payee",
      Memo: "memo",
      Category: "category",
      Outflow: "outflow",
      Inflow: "inflow",
      Cleared: "cleared",
      Flag: "flag",
      Account: "account",
    },
    "YNAB",
  ),
  preset(
    "preset-generic-bank",
    "Generic bank CSV",
    "generic_bank_csv",
    {
      Date: "date",
      Description: "payee",
      Memo: "memo",
      Amount: "amount",
      Debit: "outflow",
      Credit: "inflow",
      "Transaction ID": "importId",
    },
    "Generic bank",
  ),
  preset(
    "preset-chase",
    "Chase-style CSV",
    "generic_bank_csv",
    {
      "Transaction Date": "date",
      Description: "payee",
      Amount: "amount",
      Category: "category",
      Posting: "cleared",
    },
    "Chase",
  ),
  preset(
    "preset-balances",
    "Account balances",
    "account_balance_csv",
    {
      Account: "account",
      Balance: "amount",
      Type: "ignore",
    },
  ),
  preset(
    "preset-budget",
    "Category budget history",
    "category_budget_csv",
    {
      Month: "date",
      Category: "category",
      Assigned: "amount",
      Budgeted: "amount",
    },
  ),
];

/** Infer a column mapping from headers + detected format. */
export function suggestMapping(
  headers: string[],
  format: DetectedFileFormat,
): ColumnMapping {
  const presetMatch = BUILTIN_MAPPING_PRESETS.find((p) => p.fileFormat === format);
  if (presetMatch) {
    const mapping: ColumnMapping = {};
    for (const header of headers) {
      const direct = presetMatch.mapping[header];
      if (direct) {
        mapping[header] = direct;
        continue;
      }
      // Case-insensitive match against preset keys
      const key = Object.keys(presetMatch.mapping).find(
        (k) => k.toLowerCase() === header.toLowerCase(),
      );
      mapping[header] = key ? presetMatch.mapping[key]! : guessField(header);
    }
    return mapping;
  }

  const mapping: ColumnMapping = {};
  for (const header of headers) {
    mapping[header] = guessField(header);
  }
  return mapping;
}

function guessField(header: string): ColumnMapping[string] {
  const h = header.toLowerCase().trim();
  if (h === "date" || h.includes("transaction date") || h === "posted")
    return "date";
  if (h === "payee" || h === "description" || h === "name" || h === "merchant")
    return "payee";
  if (h === "memo" || h === "notes" || h === "reference") return "memo";
  if (h === "category" || h.includes("category")) return "category";
  if (h === "outflow" || h === "debit" || h === "withdrawal" || h === "payment")
    return "outflow";
  if (h === "inflow" || h === "credit" || h === "deposit") return "inflow";
  if (h === "amount" || h === "value" || h === "balance" || h === "assigned" || h === "budgeted")
    return "amount";
  if (h === "account" || h.includes("account name")) return "account";
  if (h === "cleared" || h === "status" || h === "posted status") return "cleared";
  if (h === "flag") return "flag";
  if (
    h === "import id" ||
    h === "fitid" ||
    h === "transaction id" ||
    h === "id" ||
    h === "check number"
  )
    return "importId";
  return "ignore";
}
