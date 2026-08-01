import Link from "next/link";

export default function GoalsPage() {
  return (
    <ComingSoon
      title="Goals"
      detail="Target editing and goal progress ship in the next Phase 1 increment. Seed data already includes sample targets on the Plan page."
    />
  );
}

function ComingSoon({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-10 md:px-6 max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{detail}</p>
      <Link
        href="/plan"
        className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
      >
        Back to Plan
      </Link>
    </div>
  );
}
