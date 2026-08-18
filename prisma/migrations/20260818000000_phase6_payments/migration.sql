-- Phase 6: Payment Management
-- Creates the payments table with a positive-amount DB CHECK constraint,
-- backfills existing booking advances into payment records,
-- and recalculates Booking.remaining / Booking.paymentStatus from the new ledger.

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paymentCode" TEXT NOT NULL,
    "bookingId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "paymentDate" DATE NOT NULL,
    "collectedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentCode_key" ON "payments"("paymentCode");

-- CreateIndex
CREATE INDEX "payments_bookingId_idx" ON "payments"("bookingId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_collectedById_fkey"
    FOREIGN KEY ("collectedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: Create PAID Payment records for every booking where advance > 0
-- Uses a DO block to generate unique paymentCodes and insert records.
-- The UNIQUE constraint on paymentCode prevents duplicate backfills on re-run.
DO $$
DECLARE
    rec RECORD;
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    FOR rec IN
        SELECT id, advance, "createdAt"
        FROM bookings
        WHERE advance > 0
    LOOP
        -- Check if a backfill payment already exists for this booking to be idempotent
        IF NOT EXISTS (
            SELECT 1 FROM payments WHERE "bookingId" = rec.id
        ) THEN
            -- Generate a unique paymentCode with retry logic
            LOOP
                new_code := 'PAY-' || EXTRACT(YEAR FROM NOW())::TEXT || '-'
                            || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
                SELECT EXISTS(SELECT 1 FROM payments WHERE "paymentCode" = new_code) INTO code_exists;
                EXIT WHEN NOT code_exists;
            END LOOP;

            INSERT INTO payments (
                id, "paymentCode", "bookingId", amount, method, status,
                notes, "paymentDate", "createdAt", "updatedAt"
            )
            VALUES (
                gen_random_uuid(),
                new_code,
                rec.id,
                rec.advance,
                'CASH',
                'PAID',
                'Backfilled from booking advance',
                rec."createdAt"::DATE,
                NOW(),
                NOW()
            );
        END IF;
    END LOOP;
END;
$$;

-- Recalculate Booking.remaining and Booking.paymentStatus from the payment ledger
UPDATE bookings b
SET
    remaining = b.fare - COALESCE((
        SELECT SUM(p.amount)
        FROM payments p
        WHERE p."bookingId" = b.id AND p.status = 'PAID'
    ), 0),
    "paymentStatus" = CASE
        WHEN COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p."bookingId" = b.id AND p.status = 'PAID'
        ), 0) = 0 THEN 'PENDING'::"PaymentStatus"
        WHEN COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p."bookingId" = b.id AND p.status = 'PAID'
        ), 0) >= b.fare THEN 'PAID'::"PaymentStatus"
        ELSE 'PARTIAL'::"PaymentStatus"
    END;
