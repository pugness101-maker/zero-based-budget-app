# EveryDollarFlow

Zero-based personal budgeting web app (working name). Assign every available dollar to a category, track accounts and transactions, and review progress—starting with a fully usable local demo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Zustand (demo client state)
- date-fns, Zod, Lucide
- Vitest for calculation tests

## Setup

```bash
npm install
cp .env.example .env.local   # optional for Phase 1
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you land on the Monthly Plan with seeded college-student demo data.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run test` | Vitest unit tests |
| `npm run build` | Production build |
| `npm start` | Serve production build |

## Architecture

```text
app/(app)/          # Plan, Accounts, Transactions, Settings (+ stubs)
components/         # Shell, budget, accounts, transactions UI
lib/brand.ts        # Name, accent, terminology
lib/money/          # Integer-cent helpers
lib/dates/          # Month keys & display
lib/calculations/   # Ready-to-assign, available, overspending, spending
lib/seed/           # Demo plan factory
lib/store/          # Zustand + localStorage persistence
tests/              # Calculation unit tests
```

**Money** is always stored as integer cents. **Calculations** live in `lib/calculations` and are reused by every screen—do not recompute balances only in UI components.

Phase 1 persistence is browser `localStorage` via Zustand. Phase 2 replaces this with Supabase Auth + PostgreSQL (see `IMPLEMENTATION_PLAN.md`).

## Demo seed

College-student plan:

- Checking $1,300 · HYSA $2,500 · Credit Card −$240 · Brokerage Tracking $1,000
- Category groups: Giving, Bills, College, Transportation, Food, Personal, Fitness, Savings, Fun, Debt
- Sample income, spending, one transfer, and an overspent Eating Out category

Reset anytime from **Settings → Reset demo data**.

## Schema (Phase 1 in-memory model)

Domain types in `lib/types/budget.ts` mirror the future DB models: accounts, category groups/categories, monthly budgets, targets, payees, transactions (with transfer links and optional splits), and preferences.

Phase 2 will add Drizzle/Prisma migrations under `db/` with household isolation, soft deletes, and indexes listed in the build brief.

## Database migration commands (Phase 2)

Not applicable yet—no SQL database in Phase 1. Planned:

```bash
# After Supabase + ORM are wired
npx drizzle-kit generate
npx drizzle-kit migrate
# or prisma migrate dev
```

## Vercel deployment

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Framework preset: Next.js (auto-detected).
4. Copy vars from `.env.example` if desired (`NEXT_PUBLIC_DEMO_MODE=true`).
5. Deploy — no database required for the demo MVP.

Optional CLI (install globally first):

```bash
npm i -g vercel
vercel
vercel --prod
```

## What’s in this Phase 1 slice

- Responsive app shell (sidebar + mobile bottom nav + top bar)
- Monthly Plan with assign editing and category inspector
- Accounts list + register (add/clear/delete transactions)
- All Transactions with filters + transfers
- Seeded demo data + core calculation tests

## Remaining work

See `IMPLEMENTATION_PLAN.md` — Goals/Reports UI, import/export, undo stack, full credit-card payment flows, Supabase (Phase 2), scheduled transactions & debt tools (Phase 3).
