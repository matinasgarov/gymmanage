"use server";

import { revalidatePath } from "next/cache";
import { getOwnerDb } from "@/lib/dal";
import { put, remove } from "@/lib/storage";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — client resizes to ~300×300 webp, well under

export type PhotoResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function uploadMemberPhoto(
  memberId: string,
  _prev: PhotoResult | undefined,
  formData: FormData
): Promise<PhotoResult> {
  const { user, db } = await getOwnerDb();

  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { id: true, photoUrl: true },
  });
  if (!member) return { ok: false, message: "Üzv tapılmadı" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Şəkil seçilməyib" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, message: "Yalnız JPG, PNG və ya WEBP" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Şəkil 2MB-dan böyükdür" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const publicUrl = await put({
    prefix: "members",
    ownerId: member.id,
    bytes: buf,
    contentType: file.type,
  });

  await db.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: { photoUrl: publicUrl },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.photo_set",
        entityType: "Member",
        entityId: member.id,
        payload: { url: publicUrl },
      },
    });
  });

  // Best-effort delete of the previous file (skip if it's the same name)
  if (member.photoUrl && member.photoUrl !== publicUrl) {
    await remove(member.photoUrl);
  }

  revalidatePath(`/members/${member.id}`);
  revalidatePath("/members");
  return { ok: true, url: publicUrl };
}

export async function removeMemberPhoto(memberId: string): Promise<PhotoResult> {
  const { db } = await getOwnerDb();
  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { id: true, photoUrl: true },
  });
  if (!member) return { ok: false, message: "Üzv tapılmadı" };
  if (!member.photoUrl) return { ok: true, url: "" };

  await remove(member.photoUrl);

  await db.member.update({
    where: { id: member.id },
    data: { photoUrl: null },
  });

  revalidatePath(`/members/${member.id}`);
  revalidatePath("/members");
  return { ok: true, url: "" };
}
