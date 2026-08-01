import { getAccountBalance } from "@/lib/calculations/account-balances";
import { isAccountClosed, isAccountHidden } from "@/lib/accounts/lifecycle";
import type {
  Account,
  AccountBudgetKind,
  BudgetPlan,
  Category,
  CategoryGroup,
} from "@/lib/types/budget";

export interface CategoryPickerOption {
  kind: "category";
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  hidden: boolean;
  archived: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface CategoryPickerGroup {
  groupId: string;
  groupName: string;
  sortOrder: number;
  categories: CategoryPickerOption[];
}

export interface AccountPickerOption {
  kind: "account";
  id: string;
  name: string;
  section: AccountPickerSection;
  balanceCents: number;
  hidden: boolean;
  closed: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export type AccountPickerSection =
  | "On Budget"
  | "Credit"
  | "Tracking Assets"
  | "Tracking Liabilities";

export function buildGroupedCategoryOptions(input: {
  plan: BudgetPlan;
  query?: string;
  includeHiddenArchived?: boolean;
  excludeCategoryIds?: Set<string>;
}): CategoryPickerGroup[] {
  const {
    plan,
    query = "",
    includeHiddenArchived = false,
    excludeCategoryIds = new Set(),
  } = input;
  const q = query.trim().toLowerCase();

  const groups = [...plan.categoryGroups]
    .filter((g) => !g.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const result: CategoryPickerGroup[] = [];

  for (const group of groups) {
    const cats = plan.categories
      .filter((c) => c.groupId === group.id && !c.deletedAt)
      .filter((c) => {
        if (includeHiddenArchived) return true;
        return !c.hidden && !c.isArchived;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const matched = cats.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        group.name.toLowerCase().includes(q)
      );
    });

    if (!matched.length) continue;

    result.push({
      groupId: group.id,
      groupName: group.name,
      sortOrder: group.sortOrder,
      categories: matched.map((c) => {
        const taken = excludeCategoryIds.has(c.id);
        return {
          kind: "category" as const,
          id: c.id,
          name: c.name,
          groupId: group.id,
          groupName: group.name,
          hidden: Boolean(c.hidden),
          archived: Boolean(c.isArchived),
          disabled: taken,
          disabledReason: taken
            ? "This category already has an active goal"
            : undefined,
        };
      }),
    });
  }

  return result;
}

export function accountSectionFor(account: Account): AccountPickerSection {
  if (account.kind === "on_budget") return "On Budget";
  if (account.kind === "credit") return "Credit";
  if (
    account.type === "auto_loan" ||
    account.type === "student_loan" ||
    account.type === "personal_loan" ||
    account.type === "mortgage" ||
    account.type === "liability_tracking"
  ) {
    return "Tracking Liabilities";
  }
  return "Tracking Assets";
}

const SECTION_ORDER: AccountPickerSection[] = [
  "On Budget",
  "Credit",
  "Tracking Assets",
  "Tracking Liabilities",
];

export function buildGroupedAccountOptions(input: {
  plan: BudgetPlan;
  query?: string;
  includeHiddenClosed?: boolean;
  excludeAccountIds?: Set<string>;
}): Array<{ section: AccountPickerSection; accounts: AccountPickerOption[] }> {
  const {
    plan,
    query = "",
    includeHiddenClosed = false,
    excludeAccountIds = new Set(),
  } = input;
  const q = query.trim().toLowerCase();

  const accounts = plan.accounts
    .filter((a) => !a.deletedAt)
    .filter((a) => {
      if (includeHiddenClosed) return true;
      if (isAccountClosed(a)) return false;
      if (isAccountHidden(a)) return false;
      return true;
    })
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const bySection = new Map<AccountPickerSection, AccountPickerOption[]>();
  for (const section of SECTION_ORDER) bySection.set(section, []);

  for (const a of accounts) {
    const section = accountSectionFor(a);
    const taken = excludeAccountIds.has(a.id);
    const balance = getAccountBalance(a, plan.transactions).balanceCents;
    bySection.get(section)!.push({
      kind: "account",
      id: a.id,
      name: a.name,
      section,
      balanceCents: balance,
      hidden: isAccountHidden(a),
      closed: isAccountClosed(a),
      disabled: taken,
      disabledReason: taken
        ? "This account already has an active goal"
        : undefined,
    });
  }

  return SECTION_ORDER.map((section) => ({
    section,
    accounts: bySection.get(section) ?? [],
  })).filter((g) => g.accounts.length > 0);
}

export function categoryLabel(
  plan: BudgetPlan,
  categoryId: string | null | undefined,
): { name: string; groupName: string } | null {
  if (!categoryId) return null;
  const category = plan.categories.find((c) => c.id === categoryId);
  if (!category || category.deletedAt) return null;
  const group = plan.categoryGroups.find((g) => g.id === category.groupId);
  return { name: category.name, groupName: group?.name ?? "Other" };
}

export function accountLabel(
  plan: BudgetPlan,
  accountId: string | null | undefined,
): { name: string; section: AccountPickerSection } | null {
  if (!accountId) return null;
  const account = plan.accounts.find((a) => a.id === accountId);
  if (!account || account.deletedAt) return null;
  return { name: account.name, section: accountSectionFor(account) };
}

/** Flatten groups for tests / keyboard lists */
export function flattenCategoryOptions(
  groups: CategoryPickerGroup[],
): CategoryPickerOption[] {
  return groups.flatMap((g) => g.categories);
}

export function flattenAccountOptions(
  groups: Array<{ section: AccountPickerSection; accounts: AccountPickerOption[] }>,
): AccountPickerOption[] {
  return groups.flatMap((g) => g.accounts);
}

export type { Category, CategoryGroup, AccountBudgetKind };
