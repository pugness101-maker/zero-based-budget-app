# Cursor Build Brief — Zero-Based Budgeting App

Build a production-ready personal budgeting web app inspired by the core workflow of zero-based budgeting apps such as YNAB, but with completely original branding, copy, icons, colors, layouts, and source code. Do not use YNAB trademarks, logos, proprietary illustrations, copied text, or pixel-for-pixel UI replication.

## Working app name

Use **EveryDollarFlow** as a temporary working name. Keep the app name, logo, colors, and terminology centralized so they can be changed later.

## Primary goal

Create a responsive budgeting app where the user:

1. Adds cash, checking, savings, credit-card, loan, and tracking accounts.
2. Imports or manually enters transactions.
3. Assigns every available dollar to a category.
4. Creates spending and savings targets.
5. Moves money between categories.
6. Reconciles account balances.
7. Reviews spending, income, net worth, debt, and budget progress.
8. Exports, imports, backs up, and restores their data.

The first version must be fully usable with local demo data even before bank syncing is added.

---

## Technical stack

Use:

- Next.js 15+ with App Router
- TypeScript with strict mode
- React
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Supabase for authentication and PostgreSQL
- Prisma or Drizzle ORM
- React Hook Form
- Zod validation
- TanStack Table
- Recharts
- date-fns
- Zustand only for temporary client UI state
- Vitest and React Testing Library
- Playwright for critical flows
- Vercel deployment

Use server actions or route handlers for writes. Do not place financial calculations only in UI components.

## Architecture rules

Create a normalized calculation layer used by every screen.

Suggested folders:

```text
app/
  (auth)/
  dashboard/
  plan/
  accounts/
  transactions/
  reports/
  goals/
  settings/
components/
  budget/
  accounts/
  transactions/
  reports/
  shared/
lib/
  calculations/
  money/
  dates/
  validation/
  imports/
  exports/
  audit/
db/
  schema/
  migrations/
tests/
```

All money values must be stored as integer cents. Never use floating-point numbers for currency calculations.

All dates must be stored as UTC and displayed in the user's selected timezone.

Use database transactions for multi-record operations.

---

# Navigation

## Desktop

Left sidebar:

- Plan
- Accounts
- All Transactions
- Goals
- Reports
- Debt
- Settings

Sidebar also shows:

- Each on-budget account and current balance
- Credit-card balances
- Tracking accounts
- Add Account button
- Collapse/expand control

Top bar:

- Current budget month
- Previous/next month
- Search
- Undo
- Redo
- Hide balances
- Notifications
- User menu

## Mobile

Bottom navigation:

- Plan
- Accounts
- Add
- Reports
- More

Use large tap targets and avoid desktop tables squeezed into the viewport.

---

# Core page 1 — Monthly Plan

This is the main budgeting screen.

## Header

Show:

- Month selector
- Money Available to Assign
- Total assigned this month
- Total activity this month
- Total available across categories
- Auto-Assign button
- Undo/redo controls

Use original terminology. Internally, use `readyToAssign`.

## Category groups

Support:

- Pinned
- Bills
- Frequent Spending
- Savings
- Debt Payments
- Quality of Life
- Custom groups

Each group can:

- Expand/collapse
- Rename
- Reorder
- Add category
- Hide
- Delete when empty
- Show group totals

Each category row shows:

- Category name
- Target status
- Assigned
- Activity
- Available
- Progress bar
- Overspending or underfunded warning
- Notes indicator
- Quick actions menu

Clicking a category opens a right-side inspector on desktop and a bottom sheet on mobile.

## Category inspector

Include:

- Category name and group
- Current available amount
- Assigned this month
- Activity this month
- Target details
- Progress
- Upcoming scheduled transactions
- Recent transactions
- Average spent
- Average assigned
- Notes
- Move Money
- Edit Target
- Hide/Delete Category

## Assigning money

Allow:

- Direct entry in Assigned
- Move money between categories
- Assign all available money
- Underfunded categories
- Scheduled transaction amounts
- Average assigned
- Average spent
- Last month's assigned
- Custom percentage or fixed amount
- Reset assigned amount
- Reset available amount

Validation:

```text
readyToAssign = total cash inflows
              - total assigned to categories
              - applicable cash overspending adjustments
```

A category's available amount rolls forward unless a user changes the rollover setting.

## Overspending

Differentiate:

- Cash overspending
- Credit-card overspending

Show the effect clearly and do not silently hide negative category balances.

---

# Core page 2 — Accounts and Registers

## Account types

Support:

- Checking
- Savings
- Cash
- Credit card
- Line of credit
- Mortgage
- Auto loan
- Student loan
- Personal loan
- Investment tracking
- Asset tracking
- Liability tracking

Fields:

- Name
- Type
- Starting balance
- Currency
- On-budget or tracking
- Institution
- Last four digits
- Note
- Closed status

## Account register

Columns:

- Select
- Date
- Payee
- Category
- Memo
- Outflow
- Inflow
- Cleared status
- Running balance
- Actions

Features:

- Inline editing
- Add transaction
- Split transaction
- Transfer
- Duplicate
- Delete
- Approve imported transaction
- Match imported transaction
- Mark cleared/uncleared
- Flag colors
- Search
- Filters
- Bulk actions
- Reconcile
- Sticky header
- Keyboard shortcuts

## Reconciliation

Workflow:

1. Ask for current cleared bank balance.
2. Compare it with cleared app balance.
3. If equal, mark cleared transactions reconciled.
4. If unequal, show the difference.
5. Let the user locate missing/duplicate transactions.
6. Permit a clearly labeled reconciliation adjustment as a last resort.
7. Add an audit-history entry.

---

# Core page 3 — Transactions

## All Transactions

Show transactions across all accounts.

Filters:

- Date range
- Account
- Payee
- Category
- Amount
- Inflow/outflow
- Cleared status
- Approved/imported status
- Flag
- Memo text
- Transfer
- Duplicate suspicion

Support saved filters.

## Transaction form

Fields:

- Account
- Date
- Payee
- Category
- Memo
- Outflow or inflow
- Cleared
- Flag
- Repeat/schedule
- Attachment placeholder

Split transactions must support multiple categories whose amounts total the parent amount.

Transfers must create linked entries and must not count as spending when moving money between on-budget accounts.

---

# Core page 4 — Targets and Goals

Support original target types equivalent to:

1. Set aside a fixed amount each week.
2. Set aside a fixed amount each month.
3. Refill a category up to a fixed amount.
4. Save a total amount by a date.
5. Maintain a custom balance.
6. Pay a fixed debt amount monthly.
7. Custom repeating schedule.

Target fields:

- Target type
- Amount
- Due date
- Repeat cadence
- Day of week/month
- Rollover handling
- Include existing balance
- Notes

Show:

- Funded
- Underfunded
- Due soon
- Completed
- Paused
- Overspent

Calculations must be unit-tested for month changes, leap years, weekly cadence, and partial funding.

---

# Core page 5 — Credit Cards

When a credit-card purchase is funded by a category:

- Reduce the category's available amount.
- Increase the amount reserved for the card payment.
- Increase the card account balance owed.

When the purchase is unfunded:

- Show credit overspending.
- Do not falsely increase reserved payment money.

Credit-card payment:

- Create a transfer from a cash account to the card account.
- Reduce cash.
- Reduce the card balance.
- Reduce the reserved payment category.

Show:

- Current card balance
- Available for payment
- Statement balance
- Due date
- Minimum payment
- Utilization
- Interest rate
- Payment progress
- Overspending warning

Do not claim a payment is affordable unless the reserved payment amount covers it.

---

# Core page 6 — Scheduled Transactions

Allow one-time and repeating transactions.

Cadences:

- Daily
- Weekly
- Every two weeks
- Twice monthly
- Monthly
- Every N months
- Quarterly
- Annually
- Custom

Show upcoming transactions in:

- Account register
- Category inspector
- Calendar
- Cash-flow forecast

Scheduled transactions should become pending entries on their due date and require approval unless auto-entry is enabled.

---

# Core page 7 — Reports

Create original report layouts.

## Spending by Category

- Donut or bar chart
- Date range
- Account filters
- Category filters
- Drill down to transactions

## Spending Over Time

- Monthly stacked bars or lines
- Income
- Spending
- Net flow

## Income vs. Expense

- Table grouped by category group
- Monthly columns
- Totals
- Expand/collapse
- CSV export

## Net Worth

- Asset line
- Liability line
- Net-worth line
- Account filters
- Date range

## Account Balance History

- One or several accounts
- Daily, weekly, or monthly resolution

## Age of Money / Cash Buffer

Create an original metric named **Cash Buffer Age**.

Explain that it estimates how long money remains available before being spent. Clearly label it as an estimate.

## Target Progress

- On track
- At risk
- Behind
- Completed
- Total needed this month

## Debt Report

- Current balances
- Principal paid
- Interest paid
- Estimated payoff
- Snowball and avalanche comparisons

All reports must use the same normalized transaction and date-filtering engine.

---

# Dashboard

Create a separate optional dashboard with:

- Available to assign
- Spending this month
- Income this month
- Net cash flow
- Upcoming bills
- Target progress
- Credit-card payments reserved
- Account balances
- Net worth
- Recent transactions
- Unapproved transactions
- Reconciliation warnings

Each card can be hidden, reordered, or resized.

---

# Search and command menu

Global search should find:

- Transactions
- Payees
- Categories
- Accounts
- Notes

Command menu shortcuts:

- Add transaction
- Add account
- Add category
- Move money
- Reconcile
- Import
- Export
- Go to current month
- Toggle hidden balances

---

# Payees and rules

Create a payee manager.

Each payee supports:

- Display name
- Aliases
- Default category
- Default memo
- Transfer relation
- Rename rule
- Auto-categorization rule
- Location placeholder
- Merge payees

Rules should be previewable before being applied in bulk.

---

# Import and export

## CSV import

Create:

- File upload
- Column mapping
- Date-format selection
- Debit/credit mapping
- Account selection
- Preview
- Duplicate detection
- Error list
- Commit step

Duplicate detection should consider:

- Account
- Date
- Amount
- Payee
- Import ID

Never delete existing data during import without explicit confirmation.

## Export

Support:

- Entire plan
- Selected account
- Selected transactions
- Date range
- Categories
- Reports

Formats:

- CSV
- JSON backup

Include a schema version in JSON backups.

## Backup and restore

- Automatic local backup before imports
- Manual backup
- Restore preview
- Merge or replace
- Migration report
- Rollback if restore fails

---

# Data Health and Audit History

Settings → Data Health:

- Duplicate transactions
- Orphaned transfers
- Broken category references
- Negative balances
- Invalid split totals
- Missing currencies
- Unreconciled old transactions
- Legacy schema records

Provide preview-before-repair.

Audit History must record:

- Create
- Edit
- Delete
- Bulk action
- Import
- Reconcile
- Move money
- Target change
- Restore

Include undo for recent reversible actions.

---

# Privacy and accessibility

- Hide balances toggle
- Optional app PIN placeholder
- No sensitive data in client logs
- Mask account numbers
- WCAG 2.2 AA target
- Keyboard navigation
- Screen-reader labels
- Visible focus states
- Reduced-motion support
- High-contrast support

---

# Settings

Sections:

- Profile
- Plan
- Accounts
- Categories
- Payees
- Notifications
- Appearance
- Import/Export
- Data Health
- Audit History
- Security
- Developer

Appearance:

- Light
- Dark
- System
- Compact or comfortable density
- Currency format
- First day of week
- Date format
- Internal zoom: 75%–200%
- Desktop/mobile/auto layout preference

Persist settings across sessions and include them in backup exports.

---

# Database model

Create tables or equivalent models for:

- users
- households
- household_members
- plans
- accounts
- account_balance_snapshots
- category_groups
- categories
- monthly_category_budgets
- targets
- payees
- payee_aliases
- payee_rules
- transactions
- transaction_splits
- transfer_links
- scheduled_transactions
- reconciliations
- import_batches
- import_rows
- flags
- attachments
- user_preferences
- audit_events
- data_health_issues
- backups

Important constraints:

- Household-level tenant isolation
- Foreign keys
- Soft delete where recovery is useful
- Unique import IDs per account
- Split totals must equal parent transaction total
- Transfers require two linked transaction sides
- Currency stored per account and plan
- Integer cents for monetary fields

Add indexes for:

- transaction date
- account ID
- category ID
- payee ID
- household ID
- cleared status
- import ID

---

# Seed data

Create a realistic demo plan for a college student:

Accounts:

- Checking: $1,300
- HYSA: $2,500
- Credit Card: -$240
- Brokerage Tracking: $1,000

Category groups:

- Giving
- Bills
- College
- Transportation
- Food
- Personal
- Fitness
- Savings
- Fun
- Debt

Include categories such as:

- Tithe
- Car Insurance
- Phone
- Tuition
- Books
- Gas
- Groceries
- Eating Out
- MMA
- Emergency Fund
- Investing
- Travel
- Fun Money

Include sample transactions, targets, scheduled bills, and one overspent category.

---

# Design direction

Create a calm, modern personal-finance design.

Do not copy YNAB's exact interface.

Use:

- Neutral background
- One original accent color
- Clear financial hierarchy
- Rounded but not overly playful surfaces
- Dense desktop mode
- Simple mobile cards
- Status colors with text/icons, not color alone
- Skeleton loading states
- Empty states with clear actions
- Toasts for successful writes
- Confirmation dialogs only for destructive actions

Avoid:

- Fake charts
- Hardcoded totals
- Excessive gradients
- Excessive animation
- Tiny text
- Horizontal overflow on mobile
- Combining unrelated financial units
- Calculating balances independently on different pages

---

# Required calculation tests

Add tests for:

1. Ready-to-assign after income.
2. Assigning and moving money.
3. Category rollover.
4. Cash overspending.
5. Credit overspending.
6. Funded credit-card purchase.
7. Unfunded credit-card purchase.
8. Credit-card payment transfer.
9. Split transaction equality.
10. Transfer exclusion from spending.
11. Target calculations.
12. Month rollover.
13. Reconciliation.
14. Import duplicate detection.
15. Scheduled transaction generation.
16. Net-worth report.
17. Income-versus-expense report.
18. Undo of an edit/delete.
19. Backup migration.
20. Household isolation.

---

# Delivery phases

## Phase 1 — Functional local MVP

Build first:

- Responsive shell
- Demo authentication
- Plan page
- Categories
- Accounts
- Transactions
- Transfers
- Credit-card logic
- Targets
- Reports
- Local seeded database
- Import/export
- Tests

Do not wait for bank sync.

## Phase 2 — Supabase production data

- Supabase authentication
- PostgreSQL schema
- Row-level security
- Household sharing
- Cloud persistence
- Audit history
- Backups

## Phase 3 — Advanced features

- Scheduled transactions
- Rules
- Debt tools
- Data Health
- Custom dashboard
- Notifications
- Attachments
- Bank-sync adapter interface

Bank connection must be implemented as an adapter with mock providers first. Do not store bank credentials.

---

# Cursor execution instructions

1. Inspect the current repository before editing.
2. Preserve working configuration unless it conflicts with this specification.
3. Create a written implementation plan in `IMPLEMENTATION_PLAN.md`.
4. Build Phase 1 in small, testable steps.
5. After each major step, run:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
6. Fix all errors before proceeding.
7. Do not leave placeholder buttons that appear functional.
8. Mark unfinished features as disabled with explanatory tooltips.
9. Use realistic seed data.
10. Add a `README.md` with setup, architecture, schema, test, and Vercel deployment instructions.
11. Add `.env.example`.
12. Never commit secrets.
13. At completion, provide:
    - Files changed
    - Features completed
    - Remaining work
    - Test results
    - Build result
    - Database migration commands
    - Vercel deployment steps

Start by inspecting the repository and generating `IMPLEMENTATION_PLAN.md`. Then implement Phase 1.
