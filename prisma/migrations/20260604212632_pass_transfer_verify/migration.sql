-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "passTransferFails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passTransferLockedUntil" TIMESTAMP(3);
