"use server";

import { prisma } from "@/lib/prisma";
import { signScanToken, verifyPassUrlToken, buildScanUrl } from "@/lib/qr";
import { headers } from "next/headers";

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export type FreshScanToken = {
  scanUrl: string;
  expiresAt: number;
};

// Public action: anyone with the pass URL token can request a fresh rotating scan token.
// We re-verify the URL token on every call.
export async function refreshScanTokenForPass(
  memberId: string,
  urlToken: string
): Promise<FreshScanToken | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, qrSecret: true },
  });
  if (!member) return null;
  if (!verifyPassUrlToken(member.id, member.qrSecret, urlToken)) return null;

  const { token, expiresAt } = signScanToken(member.id, member.qrSecret);
  const origin = await getOrigin();
  return { scanUrl: buildScanUrl(token, origin), expiresAt };
}
