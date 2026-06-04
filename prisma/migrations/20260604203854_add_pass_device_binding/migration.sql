-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "passBoundAt" TIMESTAMP(3),
ADD COLUMN     "passDeviceHash" TEXT;
