import { Suspense } from "react";
import { AccountRegister } from "@/components/accounts/account-register";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="p-6 animate-pulse space-y-3">
          <div className="h-8 w-48 rounded bg-black/5" />
          <div className="h-64 rounded-xl bg-black/5" />
        </div>
      }
    >
      <AccountRegister accountId={id} />
    </Suspense>
  );
}
