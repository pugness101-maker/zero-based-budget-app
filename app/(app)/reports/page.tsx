import Link from "next/link";

export default function ReportsPage() {
  return (
    <div className="px-4 py-10 md:px-6 max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-2 text-sm text-muted">
        Spending, income vs expense, net worth, and Cash Buffer Age reports ship
        in the next Phase 1 increment.
      </p>
      <Link
        href="/plan"
        className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
      >
        Back to Plan
      </Link>
    </div>
  );
}
