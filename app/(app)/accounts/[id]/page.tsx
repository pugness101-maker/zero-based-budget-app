import { AccountRegister } from "@/components/accounts/account-register";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountRegister accountId={id} />;
}
