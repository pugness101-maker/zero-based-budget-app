import { normalizeCategoryName } from "@/lib/imports/map-categories";
import type { YnabAccountMapping } from "@/lib/imports/ynab/commit-ynab-zip";
import type { YnabAccountTypeChoice } from "@/lib/imports/ynab/suggest-account-type";
import { suggestAccountType } from "@/lib/imports/ynab/suggest-account-type";

/** Accounts explicitly selected in Import Scope (Step 2). */
export function selectedAccountNameSet(selectedAccountNames: string[]): Set<string> {
  return new Set(selectedAccountNames.map((n) => normalizeCategoryName(n)));
}

/**
 * Active account-type mappings for Step 3 / confirmation / import.
 * Only explicitly selected accounts — never transfer-related auto-includes.
 */
export function filterMappingsToSelectedAccounts(
  mappings: YnabAccountMapping[],
  selectedAccountNames: string[],
): YnabAccountMapping[] {
  const selected = selectedAccountNameSet(selectedAccountNames);
  return mappings.filter((m) =>
    selected.has(normalizeCategoryName(m.accountName)),
  );
}

/** Ensure draft mappings exist for every known account; preserve prior type choices. */
export function upsertDraftAccountMappings(
  existing: YnabAccountMapping[],
  accountNames: string[],
  resolveExistingId?: (accountName: string) => string | undefined,
): YnabAccountMapping[] {
  const byNorm = new Map(
    existing.map((m) => [normalizeCategoryName(m.accountName), m]),
  );
  const next = [...existing];
  for (const name of accountNames) {
    const key = normalizeCategoryName(name);
    if (byNorm.has(key)) continue;
    const suggestion = suggestAccountType(name);
    const mapping: YnabAccountMapping = {
      accountName: name,
      type: suggestion.suggestedType,
      existingAccountId: resolveExistingId?.(name),
    };
    byNorm.set(key, mapping);
    next.push(mapping);
  }
  return next;
}

export function isAccountTypeValid(type: YnabAccountTypeChoice | undefined): boolean {
  return Boolean(type);
}

/**
 * Continue is blocked when no accounts are selected, or a selected account
 * is missing a required type. Unselected accounts never block.
 */
export function accountMappingContinueBlocked(
  selectedMappings: YnabAccountMapping[],
  selectedAccountNames: string[],
): { blocked: boolean; reason?: string } {
  if (selectedAccountNames.length === 0) {
    return { blocked: true, reason: "Select at least one account to continue." };
  }
  if (selectedMappings.length !== selectedAccountNames.length) {
    // Missing draft mapping for a selected name
    const mapped = new Set(
      selectedMappings.map((m) => normalizeCategoryName(m.accountName)),
    );
    const missing = selectedAccountNames.filter(
      (n) => !mapped.has(normalizeCategoryName(n)),
    );
    if (missing.length) {
      return {
        blocked: true,
        reason: `Missing account type for: ${missing.join(", ")}`,
      };
    }
  }
  for (const m of selectedMappings) {
    if (!isAccountTypeValid(m.type)) {
      return {
        blocked: true,
        reason: `Choose an account type for ${m.accountName}.`,
      };
    }
  }
  return { blocked: false };
}

/**
 * Mappings passed to commit: selected accounts + any related accounts that
 * became effective only via an explicit transfer "include related" decision.
 * Related accounts reuse draft mappings / suggestions; they do not appear in Step 3.
 */
export function mappingsForCommit(input: {
  draftMappings: YnabAccountMapping[];
  selectedAccountNames: string[];
  effectiveAccountNames: string[];
}): YnabAccountMapping[] {
  const selected = selectedAccountNameSet(input.selectedAccountNames);
  const effective = new Set(
    input.effectiveAccountNames.map((n) => normalizeCategoryName(n)),
  );
  const byNorm = new Map(
    input.draftMappings.map((m) => [
      normalizeCategoryName(m.accountName),
      m,
    ]),
  );

  const out: YnabAccountMapping[] = [];
  for (const name of input.effectiveAccountNames) {
    const key = normalizeCategoryName(name);
    if (!effective.has(key)) continue;
    // Only selected + related that are in effective (transfer include)
    const draft = byNorm.get(key);
    if (draft) {
      out.push(draft);
      continue;
    }
    // Related account without draft — suggest type
    if (!selected.has(key)) {
      const suggestion = suggestAccountType(name);
      out.push({ accountName: name, type: suggestion.suggestedType });
    }
  }
  // Always include every selected mapping even if somehow missing from effective
  for (const name of input.selectedAccountNames) {
    const key = normalizeCategoryName(name);
    if (out.some((m) => normalizeCategoryName(m.accountName) === key)) continue;
    const draft = byNorm.get(key);
    if (draft) out.push(draft);
  }
  return out;
}
