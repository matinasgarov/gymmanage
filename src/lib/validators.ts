import { z } from "zod";
import type { PlanType } from "@/generated/prisma/enums";
import { PLAN_TYPES } from "@/config/gym-plans";

const planTypeEnum = z.enum(PLAN_TYPES as unknown as [PlanType, ...PlanType[]]);

export const signupSchema = z.object({
  gymName: z.string().min(2, "Gym adı ən az 2 simvol olmalıdır").trim(),
  ownerName: z.string().min(2, "Ad ən az 2 simvol olmalıdır").trim(),
  phone: z
    .string()
    .regex(/^\+994\d{9}$/, "Telefon nömrəsi +994XXXXXXXXX formatında olmalıdır"),
  email: z.email("Düzgün email daxil edin").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Şifrə ən az 8 simvol olmalıdır")
    .regex(/[a-zA-Z]/, "Şifrədə hərf olmalıdır")
    .regex(/[0-9]/, "Şifrədə rəqəm olmalıdır"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email("Düzgün email daxil edin").trim().toLowerCase(),
  password: z.string().min(1, "Şifrə tələb olunur"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const memberSchema = z.object({
  name: z.string().min(2, "Ad ən az 2 simvol olmalıdır").trim(),
  phone: z
    .string()
    .regex(/^\+994\d{9}$/, "Telefon +994XXXXXXXXX formatında olmalıdır"),
  email: z
    .union([z.literal(""), z.email("Düzgün email daxil edin")])
    .transform((v) => (v === "" ? null : v.toLowerCase().trim())),
  planType: planTypeEnum,
  planPrice: z.coerce
    .number()
    .positive("Qiymət 0-dan böyük olmalıdır")
    .max(99999, "Qiymət çox böyükdür"),
  startDate: z.coerce.date(),
  notes: z
    .union([z.literal(""), z.string().max(500)])
    .transform((v) => (v === "" ? null : v)),
});

export type MemberInput = z.infer<typeof memberSchema>;

