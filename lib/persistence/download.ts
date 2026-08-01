/** Trigger a real browser file download (Chrome + Safari safe). */
export function downloadBlob(input: {
  blob: Blob;
  filename: string;
}): { ok: true; filename: string } | { ok: false; error: string } {
  try {
    const url = URL.createObjectURL(input.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = input.filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    // Delay revoke so Safari can start the download
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
    return { ok: true, filename: input.filename };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Download failed.",
    };
  }
}

export function downloadTextFile(input: {
  content: string;
  filename: string;
  mimeType: string;
}): { ok: true; filename: string } | { ok: false; error: string } {
  const blob = new Blob([input.content], { type: input.mimeType });
  return downloadBlob({ blob, filename: input.filename });
}

export function formatBackupFilename(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `everydollarflow-backup-${y}-${m}-${d}-${hh}${mm}.json`;
}

export function formatCsvFilename(kind: string, now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `everydollarflow-${kind}-${y}-${m}-${d}.csv`;
}
