import Link from "next/link";

export default function DebtPage() {
  return (
    <div className="px-4 py-10 md:px-6 max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Debt</h1>
      <p className="mt-2 text-sm text-muted">
        Snowball, avalanche, and payoff tools are planned for Phase 3. Credit
        card balances are available under Accounts today.
      </p>
      <Link
        href="/accounts"
        className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
      >
        View accounts
      </Link>
    </div>
  );
}
