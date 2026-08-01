import type {
  Account,
  AccountType,
  CategoryGroup,
} from "@/lib/types/budget";

/** Approved default category groups for new budgets / demo reset. */
export const DEFAULT_CATEGORY_GROUP_DEFS: ReadonlyArray<{
  id: string;
  name: string;
  sortOrder: number;
  collapsed: boolean;
}> = [
  { id: "grp-income", name: "Income", sortOrder: 0, collapsed: false },
  { id: "grp-bills", name: "Bills", sortOrder: 1, collapsed: false },
  {
    id: "grp-transport",
    name: "Transportation/Travel",
    sortOrder: 2,
    collapsed: false,
  },
  { id: "grp-food", name: "Food", sortOrder: 3, collapsed: false },
  { id: "grp-personal", name: "Personal", sortOrder: 4, collapsed: false },
  {
    id: "grp-health",
    name: "Health/Fitness",
    sortOrder: 5,
    collapsed: false,
  },
  { id: "grp-education", name: "Education", sortOrder: 6, collapsed: false },
  {
    id: "grp-entertainment",
    name: "Entertainment",
    sortOrder: 7,
    collapsed: false,
  },
  { id: "grp-shopping", name: "Shopping", sortOrder: 8, collapsed: false },
  { id: "grp-savings", name: "Savings", sortOrder: 9, collapsed: false },
  {
    id: "grp-investments",
    name: "Investments",
    sortOrder: 10,
    collapsed: false,
  },
  { id: "grp-gifts", name: "Gifts", sortOrder: 11, collapsed: false },
  {
    id: "grp-annual",
    name: "Annual Expenses",
    sortOrder: 12,
    collapsed: false,
  },
  {
    id: "grp-misc",
    name: "Miscellaneous",
    sortOrder: 13,
    collapsed: false,
  },
  { id: "grp-hidden", name: "Hidden", sortOrder: 14, collapsed: true },
];

export const DEFAULT_CATEGORY_GROUP_IDS = DEFAULT_CATEGORY_GROUP_DEFS.map(
  (g) => g.id,
);

export function buildDefaultCategoryGroups(): CategoryGroup[] {
  return DEFAULT_CATEGORY_GROUP_DEFS.map((g) => ({
    id: g.id,
    name: g.name,
    sortOrder: g.sortOrder,
    hidden: false,
    collapsed: g.collapsed,
  }));
}

/** Default tracking asset accounts created for new budgets / demo. */
export const DEFAULT_TRACKING_ASSET_DEFS: ReadonlyArray<{
  id: string;
  name: string;
  type: AccountType;
  institution?: string;
}> = [
  {
    id: "acct-brokerage",
    name: "Brokerage",
    type: "investment_tracking",
    institution: "Fidelity",
  },
  {
    id: "acct-retirement",
    name: "Retirement",
    type: "investment_tracking",
    institution: "Vanguard",
  },
  {
    id: "acct-hsa",
    name: "HSA",
    type: "investment_tracking",
    institution: "HealthEquity",
  },
];

/**
 * Extra tracking asset types available via Settings → Add custom tracking account.
 * Not created in the default seed.
 */
export const CUSTOM_TRACKING_ASSET_OPTIONS: ReadonlyArray<{
  label: string;
  type: AccountType;
  defaultName: string;
}> = [
  { label: "529", type: "asset_tracking", defaultName: "529" },
  { label: "Real Estate", type: "asset_tracking", defaultName: "Real Estate" },
  { label: "Vehicles", type: "asset_tracking", defaultName: "Vehicles" },
  { label: "Other Assets", type: "asset_tracking", defaultName: "Other Assets" },
  {
    label: "Custom tracking asset",
    type: "asset_tracking",
    defaultName: "Custom Asset",
  },
];

export const TRACKING_LIABILITY_OPTIONS: ReadonlyArray<{
  label: string;
  type: AccountType;
  defaultName: string;
}> = [
  { label: "Student Loan", type: "student_loan", defaultName: "Student Loan" },
  { label: "Auto Loan", type: "auto_loan", defaultName: "Auto Loan" },
  { label: "Mortgage", type: "mortgage", defaultName: "Mortgage" },
  {
    label: "Personal Loan",
    type: "personal_loan",
    defaultName: "Personal Loan",
  },
  {
    label: "Other Liability",
    type: "liability_tracking",
    defaultName: "Other Liability",
  },
  {
    label: "Custom Liability",
    type: "liability_tracking",
    defaultName: "Custom Liability",
  },
];

/** Types that must never appear as default seed liabilities. */
export const REMOVED_DEFAULT_LIABILITY_NAMES = [
  "Student Loans",
  "Auto Loans",
  "Mortgage",
  "Personal Loans",
  "Other Debt",
] as const;

export const REMOVED_DEFAULT_ASSET_NAMES = [
  "529",
  "Real Estate",
  "Vehicles",
  "Other Assets",
] as const;

export function isTrackingLiabilityType(type: AccountType): boolean {
  return (
    type === "auto_loan" ||
    type === "student_loan" ||
    type === "personal_loan" ||
    type === "mortgage" ||
    type === "liability_tracking"
  );
}

export function isTrackingLiabilityAccount(account: Account): boolean {
  return account.kind === "tracking" && isTrackingLiabilityType(account.type);
}

export function isTrackingAssetAccount(account: Account): boolean {
  return account.kind === "tracking" && !isTrackingLiabilityType(account.type);
}
