-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "scannerDeviceId" TEXT;

-- CreateTable
CREATE TABLE "ScannerDevice" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT,
    "pairingCode" TEXT,
    "pairingExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScannerDevice_tokenHash_key" ON "ScannerDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerDevice_pairingCode_key" ON "ScannerDevice"("pairingCode");

-- CreateIndex
CREATE INDEX "ScannerDevice_gymId_revokedAt_idx" ON "ScannerDevice"("gymId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ScannerDevice" ADD CONSTRAINT "ScannerDevice_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_scannerDeviceId_fkey" FOREIGN KEY ("scannerDeviceId") REFERENCES "ScannerDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
