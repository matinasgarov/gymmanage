-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_memberId_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "memberName" TEXT,
ADD COLUMN     "memberPlanType" "PlanType",
ADD COLUMN     "memberPublicId" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
