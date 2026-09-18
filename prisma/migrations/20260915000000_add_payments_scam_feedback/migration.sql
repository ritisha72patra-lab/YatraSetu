-- YatraSetu: Book Now payments + scam flags + spot feedback (features 1,3,6)
-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Booking: totals + payment state
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "totalAmount" INTEGER;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "orderId" TEXT,
    "paymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Payment_bookingId_idx" ON "Payment"("bookingId");
DO $$
BEGIN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable VerificationLog: overcharge / scam signals
ALTER TABLE "VerificationLog" ADD COLUMN IF NOT EXISTS "chargedAmount" INTEGER;
ALTER TABLE "VerificationLog" ADD COLUMN IF NOT EXISTS "overchargeFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VerificationLog" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- AlterTable Feedback: link reviews to spots
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "spotId" TEXT;
DO $$
BEGIN
    ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "TouristSpot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Feedback_spotId_idx" ON "Feedback"("spotId");
