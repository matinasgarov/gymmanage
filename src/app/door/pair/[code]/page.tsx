import { AutoRedeem } from "@/components/auto-redeem";

export const dynamic = "force-dynamic";

export default async function DoorPairCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AutoRedeem code={code} />;
}
