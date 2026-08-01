export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Minimal RFC4180-ish CSV parser with quoted fields. */
export function parseCsv(content: string): ParsedCsv {
  const records = splitCsvRecords(content);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0]!.map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const cells = records[i]!;
    if (cells.every((c) => c.trim() === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function splitCsvRecords(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      records.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

export function csvRowsToErrorCsv(
  rows: Array<{ rowIndex: number; errors: string[]; raw: Record<string, string> }>,
): string {
  if (rows.length === 0) return "rowIndex,errors\n";
  const headers = ["rowIndex", "errors", ...Object.keys(rows[0]!.raw)];
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    const values = [
      String(row.rowIndex),
      row.errors.join("; "),
      ...headers.slice(2).map((h) => row.raw[h] ?? ""),
    ];
    lines.push(values.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
