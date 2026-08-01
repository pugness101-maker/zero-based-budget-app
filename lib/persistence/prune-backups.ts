import {
  MAX_AUTOMATIC_BACKUPS,
  MAX_STORED_BACKUPS,
  type BackupReason,
  type BackupRecord,
} from "@/lib/types/import";

const AUTOMATIC_REASONS = new Set<BackupReason>([
  "pre_import",
  "pre_restore",
  "pre_bulk_delete",
  "pre_account_close",
  "pre_category_merge",
  "pre_destructive_migration",
  "pre_clear",
  "automatic",
]);

export function isAutomaticBackupReason(reason: BackupReason): boolean {
  return AUTOMATIC_REASONS.has(reason);
}

/** Keep latest automatic backups + manuals, capped overall. */
export function pruneBackups(backups: BackupRecord[]): BackupRecord[] {
  const sorted = [...backups].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const manuals: BackupRecord[] = [];
  const autos: BackupRecord[] = [];

  for (const b of sorted) {
    if (isAutomaticBackupReason(b.reason)) {
      if (autos.length < MAX_AUTOMATIC_BACKUPS) autos.push(b);
    } else {
      manuals.push(b);
    }
  }

  return [...manuals, ...autos]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_STORED_BACKUPS);
}
