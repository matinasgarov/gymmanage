-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('MOVED', 'PRICE', 'INJURY', 'LOST_MOTIVATION', 'POOR_SERVICE', 'OTHER');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelReason" "CancelReason",
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
