"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/prisma";
import { requireOwner } from "@/lib/dal";
import { put, remove } from "@/lib/storage";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const profileSchema = z.object({
  name: z.string().min(2, "Zalın adı tələb olunur").trim(),
  ownerName: z.string().min(2, "Sahibin adı tələb olunur").trim(),
  phone: z
    .string()
    .regex(/^\+994\d{9}$/, "Telefon +994XXXXXXXXX formatında olmalıdır"),
  address: z
    .union([z.literal(""), z.string().max(200)])
    .transform((v) => (v === "" ? null : v.trim())),
});

export type SettingsState =
  | { ok?: true; errors?: Record<string, string[]>; message?: string }
  | undefined;

export async function updateGymProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireOwner();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  await prisma.$transaction(async (tx: Tx) => {
    await tx.gym.update({
      where: { id: user.gymId },
      data: parsed.data,
    });
    // Keep the current owner's User.name in sync with the gym's owner name —
    // the sidebar shows User.name and this is what the user expects to change.
    await tx.user.update({
      where: { id: user.id },
      data: { name: parsed.data.ownerName },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "gym.profile_update",
        entityType: "Gym",
        entityId: user.gymId,
        payload: parsed.data,
      },
    });
  });

  // Layout-scoped revalidate so the sidebar (rendered in AppShell on every
  // page) picks up the new gym name and owner name.
  revalidatePath("/", "layout");
  return { ok: true, message: "Yadda saxlanıldı" };
}

export async function updateGymTemplates(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireOwner();

  const fields = {
    waReminderTemplate: clean(formData.get("waReminderTemplate")),
    waReceiptTemplate: clean(formData.get("waReceiptTemplate")),
    waExpiringTemplate: clean(formData.get("waExpiringTemplate")),
    waWelcomeTemplate: clean(formData.get("waWelcomeTemplate")),
  };

  await prisma.$transaction(async (tx: Tx) => {
    await tx.gym.update({ where: { id: user.gymId }, data: fields });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "gym.templates_update",
        entityType: "Gym",
        entityId: user.gymId,
      },
    });
  });

  revalidatePath("/settings");
  return { ok: true, message: "Şablonlar yeniləndi" };
}

function clean(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s.slice(0, 1000);
}

// ─── Logo upload ─────────────────────────────────────────────────────

export async function uploadGymLogo(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await requireOwner();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Şəkil seçilməyib" };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { message: "Yalnız JPG, PNG və ya WEBP" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { message: "Şəkil 2MB-dan böyükdür" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const url = await put({
    prefix: "gyms",
    ownerId: user.gymId,
    bytes: buf,
    contentType: file.type,
  });

  const previous = await prisma.gym.findUnique({
    where: { id: user.gymId },
    select: { logoUrl: true },
  });

  await prisma.gym.update({ where: { id: user.gymId }, data: { logoUrl: url } });

  if (previous?.logoUrl && previous.logoUrl !== url) {
    await remove(previous.logoUrl);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Loqo yeniləndi" };
}

export async function removeGymLogo(): Promise<SettingsState> {
  const user = await requireOwner();
  const gym = await prisma.gym.findUnique({
    where: { id: user.gymId },
    select: { logoUrl: true },
  });
  if (!gym?.logoUrl) return { ok: true };
  await remove(gym.logoUrl);
  await prisma.gym.update({ where: { id: user.gymId }, data: { logoUrl: null } });
  revalidatePath("/", "layout");
  return { ok: true };
}
