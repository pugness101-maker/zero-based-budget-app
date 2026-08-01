import JSZip from "jszip";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/types/import";

const ALLOWED_EXTENSIONS = new Set([".csv", ".txt", ".json"]);
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".sh",
  ".bat",
  ".cmd",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".php",
  ".py",
  ".rb",
  ".pl",
  ".wasm",
  ".dll",
  ".so",
  ".dylib",
  ".jar",
  ".apk",
  ".dmg",
  ".pkg",
]);

export interface ExtractedZipEntry {
  path: string;
  fileName: string;
  content: string;
  size: number;
}

export interface ZipExtractionResult {
  ok: boolean;
  entries: ExtractedZipEntry[];
  errors: string[];
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/**
 * Safely extract text files from a ZIP in memory.
 * Never executes archive contents; rejects suspicious paths/extensions.
 */
export async function extractZipSafely(
  data: ArrayBuffer | Uint8Array,
  options: { maxTotalBytes?: number; maxFiles?: number } = {},
): Promise<ZipExtractionResult> {
  const maxTotal = options.maxTotalBytes ?? MAX_IMPORT_FILE_BYTES * 5;
  const maxFiles = options.maxFiles ?? 50;
  const errors: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return { ok: false, entries: [], errors: ["Could not read ZIP archive."] };
  }

  const entries: ExtractedZipEntry[] = [];
  let totalBytes = 0;
  let fileCount = 0;

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    fileCount++;
    if (fileCount > maxFiles) {
      errors.push(`Archive contains more than ${maxFiles} files.`);
      break;
    }

    const normalized = path.replace(/\\/g, "/");
    if (
      normalized.includes("..") ||
      normalized.startsWith("/") ||
      /^[a-zA-Z]:/.test(normalized)
    ) {
      errors.push(`Rejected suspicious path: ${path}`);
      continue;
    }

    const fileName = basename(normalized);
    if (fileName.startsWith(".")) {
      // skip macOS metadata / hidden
      if (normalized.includes("__MACOSX") || fileName === ".DS_Store") continue;
    }

    const ext = extensionOf(fileName);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      errors.push(`Rejected executable or unsafe file type: ${fileName}`);
      continue;
    }
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      errors.push(`Unsupported file in archive: ${fileName}`);
      continue;
    }

    let content: string;
    try {
      content = await file.async("string");
    } catch {
      errors.push(`Could not read ${fileName} as text.`);
      continue;
    }

    const size = new TextEncoder().encode(content).length;
    totalBytes += size;
    if (totalBytes > maxTotal) {
      errors.push("Extracted archive exceeds size limit.");
      break;
    }

    entries.push({ path: normalized, fileName, content, size });
  }

  if (entries.length === 0 && errors.length === 0) {
    errors.push("ZIP archive contained no readable text files.");
  }

  const fatal = errors.some(
    (e) =>
      e.startsWith("Could not read ZIP") ||
      e.startsWith("Extracted archive") ||
      e.startsWith("Archive contains"),
  );

  return {
    ok: !fatal && entries.length > 0,
    entries,
    errors,
  };
}

export function findYnabExportFiles(entries: ExtractedZipEntry[]): {
  register?: ExtractedZipEntry;
  plan?: ExtractedZipEntry;
  error?: string;
} {
  const register = entries.find((e) =>
    e.fileName.toLowerCase().endsWith(" - register.csv"),
  );
  const plan = entries.find((e) =>
    e.fileName.toLowerCase().endsWith(" - plan.csv"),
  );

  if (!register && !plan) {
    return {
      error:
        "No YNAB Register.csv or Plan.csv found. Expected filenames ending with “ - Register.csv” or “ - Plan.csv”.",
    };
  }

  return { register, plan };
}
