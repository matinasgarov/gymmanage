-- Rename existing PlanType values in place — preserves every Member.planType,
-- Lead.interest and PlanPrice.planType row (a "MONTHLY" member becomes
-- "MONTHLY_UNLIMITED", etc.). Then add the new 12-entries tier.
--
-- Hand-written because Prisma cannot detect an enum-value rename; left to the
-- diff engine it would drop+recreate the type and orphan existing data.

ALTER TYPE "PlanType" RENAME VALUE 'MONTHLY' TO 'MONTHLY_UNLIMITED';
ALTER TYPE "PlanType" RENAME VALUE 'QUARTERLY' TO 'THREE_MONTHS';
ALTER TYPE "PlanType" RENAME VALUE 'ANNUAL' TO 'YEARLY';

-- BEFORE keeps the on-disk enum order aligned with the schema declaration order
-- (TWELVE_ENTRIES first), so future `prisma migrate` runs see no drift.
ALTER TYPE "PlanType" ADD VALUE 'TWELVE_ENTRIES' BEFORE 'MONTHLY_UNLIMITED';
