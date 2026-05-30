"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma, type Tx } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { signupSchema, loginSchema } from "@/lib/validators";

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
} | undefined;

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    gymName: formData.get("gymName"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { gymName, ownerName, phone, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["Bu email artıq qeydiyyatdan keçib"] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx: Tx) => {
    const gym = await tx.gym.create({
      data: { name: gymName, ownerName, phone },
    });

    const owner = await tx.user.create({
      data: {
        gymId: gym.id,
        email,
        passwordHash,
        name: ownerName,
        role: "OWNER",
      },
    });

    await tx.auditLog.create({
      data: {
        gymId: gym.id,
        actorId: owner.id,
        action: "gym.create",
        entityType: "Gym",
        entityId: gym.id,
        payload: { gymName, ownerEmail: email },
      },
    });

    return owner;
  });

  await createSession({ userId: user.id, gymId: user.gymId, role: "OWNER" });
  redirect("/dashboard");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  await createSession({
    userId: user.id,
    gymId: user.gymId,
    role: user.role,
  });
  redirect(user.role === "STAFF" ? "/scan" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
