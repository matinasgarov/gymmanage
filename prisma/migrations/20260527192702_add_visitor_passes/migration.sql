-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "visitorPassId" TEXT,
ALTER COLUMN "memberId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VisitorPass" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "token" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorPass_token_key" ON "VisitorPass"("token");

-- CreateIndex
CREATE INDEX "VisitorPass_gymId_createdAt_idx" ON "VisitorPass"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckIn_visitorPassId_idx" ON "CheckIn"("visitorPassId");

-- AddForeignKey
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_visitorPassId_fkey" FOREIGN KEY ("visitorPassId") REFERENCES "VisitorPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
