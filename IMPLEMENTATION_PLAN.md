# EveryDollarFlow — Implementation Plan

Working name: **EveryDollarFlow**. Brand, accent, and terminology live in `lib/brand.ts` so they can be swapped later.

This plan maps the build brief to delivery phases. Phase 1 focuses on a usable local MVP with seeded demo data—no bank sync, no Supabase yet.

---

## Principles

1. **Integer cents only** — never floating-point currency math.
2. **Normalized calculation layer** — `lib/calculations/*` is the single source of truth for ready-to-assign, available, overspending, transfers, and credit-card effects.
3. **UTC storage, local display** — dates via `lib/dates`.
4. **Demo-first** — Phase 1 runs fully offline from seed data; Phase 2 swaps persistence for Supabase/Postgres.
5. **No fake controls** — unfinished actions are disabled with explanatory tooltips.
6. **Original UI** — calm finance aesthetic; do not copy YNAB trademarks or layout.

---

## Current repository baseline

- Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind CSS 4
- Fresh `create-next-app` scaffold only
- No ORM, auth, tests, or domain code yet

---

## Target folder layout

```text
app/
  (app)/                 # authenticated app shell
    plan/
    accounts/
    accounts/[id]/
    transactions/
    goals/
    reports/
    debt/
    settings/
  page.tsx               # redirect → /plan
components/
  shell/                 # sidebar, top bar, mobile nav
  budget/                # plan grid, inspector, assign controls
  accounts/              # account list + register
  transactions/          # all-transactions table + form
  shared/                # money display, empty states, tooltips
lib/
  brand.ts
  money/
  dates/
  calculations/
  validation/
  types/
  seed/
  store/                 # Phase 1 local store (Zustand + seed)
db/                      # Phase 2 schema/migrations
tests/
  calculations/
```

---

## Phase 1 — Functional local MVP (this delivery)

### Step 1 — Scaffold & brand ✅ (this sprint)

- [x] `IMPLEMENTATION_PLAN.md`
- [x] Brand tokens, fonts, CSS variables
- [x] Shared money/date helpers
- [x] Domain types (accounts, categories, transactions, budgets)
- [x] Vitest + scripts: `lint`, `typecheck`, `test`, `build`
- [x] `.env.example` + README updates

### Step 2 — Responsive app shell ✅ (this sprint)

- [x] Desktop left sidebar (nav + account balances + collapse)
- [x] Top bar (month, search stub, hide balances, undo/redo stubs)
- [x] Mobile bottom nav (Plan / Accounts / Add / Reports / More)
- [x] Demo user menu (local demo mode badge)

### Step 3 — Seed demo data ✅ (this sprint)

College-student plan:

| Account | Balance |
|---------|---------|
| Checking | $1,300 |
| HYSA | $2,500 |
| Credit Card | −$240 |
| Brokerage Tracking | $1,000 |

Category groups: Giving, Bills, College, Transportation, Food, Personal, Fitness, Savings, Fun, Debt — with sample categories, targets, transactions, one overspent category, and scheduled bill placeholders in seed for later phases.

- [x] Seed factory (`lib/seed/demo-plan.ts`)

### Step 4 — Monthly Plan ✅ (this sprint)

- [x] Month selector (prev/next)
- [x] Ready to Assign / assigned / activity / available summaries
- [x] Expandable category groups with row metrics
- [x] Inline assigned amount editing
- [x] Category inspector (desktop drawer / mobile sheet)
- [x] Overspending warnings (cash vs credit)
- [x] Auto-Assign / Move Money: disabled with explanatory tooltips

### Step 5 — Accounts ✅ (this sprint)

- [x] Account list grouped (on-budget / credit / tracking)
- [x] Account detail register with running balance
- [x] Add transaction (basic form)
- [x] Cleared toggle
- [x] Reconcile: disabled tooltip (later increment)

### Step 6 — Transactions ✅ (this sprint)

- [x] All Transactions view across accounts
- [x] Filters: account, category, text search
- [x] Add / delete transaction
- [x] Transfers between accounts (linked pair, excluded from spending)
- [ ] Split entry UI (validator tested; UI deferred)

### Step 7 — Calculation tests (core set) ✅ (this sprint)

Must pass before finish:

1. Ready-to-assign after income ✅
2. Assigning money ✅
3. Category rollover ✅
4. Cash overspending ✅
5. Credit overspending ✅
6. Transfer exclusion from spending ✅
7. Split equality ✅

Remaining brief tests (CC payment, targets, reconcile, import, reports, undo, backup, household) land in later Phase 1 increments.

### Step 8 — Deferred within Phase 1 (next increments)

Ship after the shell / plan / accounts / transactions slice is green:

- Full credit-card payment reservation UI
- Targets & Goals page (types exist in seed)
- Reports (Spending, Income vs Expense, Net Worth, Cash Buffer Age)
- CSV import/export + JSON backup
- Undo/redo stack for reversible edits
- Command palette / global search
- Playwright critical flows

---

## Phase 2 — Supabase production data

- Supabase Auth + PostgreSQL
- Drizzle or Prisma schema matching brief models
- Row-level security + household isolation
- Migrate local store → cloud repository interface
- Audit history + cloud backups
- Migration commands documented in README

---

## Phase 3 — Advanced features

- Scheduled transactions (cadences + auto-pending)
- Payee rules + bulk preview
- Debt tools (snowball / avalanche)
- Data Health repair flows
- Customizable dashboard
- Notifications
- Attachments placeholder
- Bank-sync **adapter interface** with mock providers only (never store bank credentials)

---

## Design system (Phase 1)

| Token | Value |
|-------|--------|
| Accent | Teal `#0F766E` |
| Background | Cool neutral `#F4F6F8` |
| Surface | `#FFFFFF` |
| Text | Slate `#0F172A` |
| Danger | `#B91C1C` |
| Warning | `#B45309` |
| Success | `#047857` |
| Font | Plus Jakarta Sans (UI) + tabular nums for money |

Dense desktop tables; mobile card lists. Status always pairs color with text/icon.

---

## Verification gates

After each major step, and before declaring Phase 1 slice complete:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## Deployment (Phase 1)

1. Push repo to GitHub
2. Import project on Vercel
3. Set env vars from `.env.example` (demo mode needs none required)
4. Deploy — local seed loads in the browser; no DB required until Phase 2

---

## Success criteria for this sprint

User can open the app, navigate desktop and mobile shells, review a seeded monthly plan, assign money to categories, browse accounts with balances, and manage transactions—with calculation tests and a clean production build.
