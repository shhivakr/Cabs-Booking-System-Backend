import { PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { generatePaymentId } from '../utils/idGenerator.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

export const createPaymentSchema = z.object({
  // Amount validated as positive decimal string to avoid JS float issues;
  // coerced in service before DB write
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a positive decimal value (e.g. "500" or "500.50")'
  }),
  method: z.nativeEnum(PaymentMethod),
  referenceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  // Strict YYYY-MM-DD validation
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'paymentDate must be in YYYY-MM-DD format'
  }).refine(val => {
    const d = new Date(val);
    return !isNaN(d.getTime());
  }, { message: 'paymentDate is not a valid date' }),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  method: z.nativeEnum(PaymentMethod).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives booking-level PaymentStatus from totalPaid and fare.
 * Uses Prisma.Decimal arithmetic — no JS floating point.
 */
const derivePaymentStatus = (
  fare: Prisma.Decimal,
  totalPaid: Prisma.Decimal
): PaymentStatus => {
  if (totalPaid.isZero()) return PaymentStatus.PENDING;
  if (totalPaid.greaterThanOrEqualTo(fare)) return PaymentStatus.PAID;
  return PaymentStatus.PARTIAL;
};

/**
 * Resolves a customer record from a JWT user ID.
 * Throws 403 if no linked customer profile exists.
 */
const getCustomerFromUserId = async (userId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { userId },
    select: { id: true, deletedAt: true }
  });
  if (!customer || customer.deletedAt) {
    throw new AppError('Customer profile not found', 403);
  }
  return customer;
};

// ---------------------------------------------------------------------------
// Service: Create Payment
// ---------------------------------------------------------------------------

export const createPayment = async (
  bookingId: string,
  data: z.infer<typeof createPaymentSchema>,
  user: { id: string; role: Role }
) => {
  // Parse amount as Decimal early — fail fast on invalid values
  const amountDecimal = new Prisma.Decimal(data.amount);
  if (amountDecimal.lessThanOrEqualTo(0)) {
    throw new AppError('Payment amount must be greater than zero', 400);
  }

  return prisma.$transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // 1. Lock the booking row (pessimistic lock prevents concurrent over-payment)
    // -----------------------------------------------------------------------
    const locked = await tx.$queryRaw<Array<{
      id: string;
      fare: string;
      remaining: string;
      status: string;
      paymentStatus: string;
    }>>`
      SELECT id, fare, remaining, status, "paymentStatus"
      FROM bookings
      WHERE id = ${bookingId}::uuid
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new AppError('Booking not found', 404);
    }

    const booking = locked[0]!;

    // -----------------------------------------------------------------------
    // 2. Business rule validations
    // -----------------------------------------------------------------------
    if (booking.status === 'CANCELLED') {
      throw new AppError('Cannot record payment on a cancelled booking', 400);
    }

    // -----------------------------------------------------------------------
    // 3. Calculate current totalPaid from Payment ledger (NOT from booking.advance)
    // -----------------------------------------------------------------------
    const aggregate = await tx.payment.aggregate({
      where: { bookingId, status: PaymentStatus.PAID },
      _sum: { amount: true }
    });

    const totalPaidSoFar = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const fare = new Prisma.Decimal(booking.fare);
    const currentRemaining = fare.minus(totalPaidSoFar);

    // -----------------------------------------------------------------------
    // 4. Overpayment check
    // -----------------------------------------------------------------------
    if (amountDecimal.greaterThan(currentRemaining)) {
      throw new AppError(
        `Payment amount (${amountDecimal}) exceeds remaining balance (${currentRemaining.toFixed(2)})`,
        400
      );
    }

    // -----------------------------------------------------------------------
    // 5. Generate unique payment code with retry
    // -----------------------------------------------------------------------
    let paymentCode: string = '';
    let retries = 3;
    while (retries > 0) {
      paymentCode = generatePaymentId();
      const exists = await tx.payment.findUnique({ where: { paymentCode } });
      if (!exists) break;
      retries--;
      if (retries === 0) throw new AppError('Failed to generate unique payment code', 500);
    }

    // -----------------------------------------------------------------------
    // 6. Create the Payment record
    // -----------------------------------------------------------------------
    const payment = await tx.payment.create({
      data: {
        paymentCode,
        bookingId,
        amount: amountDecimal,
        method: data.method,
        status: PaymentStatus.PAID,
        referenceNumber: data.referenceNumber ?? null,
        notes: data.notes ?? null,
        paymentDate: new Date(data.paymentDate),
        collectedById: user.id,
      }
    });

    // -----------------------------------------------------------------------
    // 7. Recalculate booking balance (Decimal arithmetic only)
    // -----------------------------------------------------------------------
    const newTotalPaid = totalPaidSoFar.plus(amountDecimal);
    const newRemaining = fare.minus(newTotalPaid);
    const newPaymentStatus = derivePaymentStatus(fare, newTotalPaid);

    // -----------------------------------------------------------------------
    // 8. Update booking with recalculated values
    // -----------------------------------------------------------------------
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        remaining: newRemaining,
        paymentStatus: newPaymentStatus,
      },
      select: {
        id: true,
        bookingCode: true,
        fare: true,
        remaining: true,
        paymentStatus: true,
      }
    });

    // -----------------------------------------------------------------------
    // 9. Create TimelineEvent (payment events do NOT change operational status)
    // -----------------------------------------------------------------------
    await tx.timelineEvent.create({
      data: {
        bookingId,
        timestamp: new Date(),
        title: 'Payment Received',
        description: `₹${amountDecimal.toFixed(2)} received via ${data.method}${
          data.referenceNumber ? ` (Ref: ${data.referenceNumber})` : ''
        }`,
        completed: true,
        current: false,
      }
    });

    return {
      ...payment,
      booking: updatedBooking,
    };
  });
};

// ---------------------------------------------------------------------------
// Service: List Payments for a Booking
// ---------------------------------------------------------------------------

export const getPaymentsForBooking = async (
  bookingId: string,
  query: z.infer<typeof paymentQuerySchema>,
  user: { id: string; role: Role }
) => {
  // Confirm booking exists
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, customerId: true }
  });
  if (!booking) throw new AppError('Booking not found', 404);

  // Customer isolation
  if (user.role === Role.CUSTOMER) {
    const customer = await getCustomerFromUserId(user.id);
    if (booking.customerId !== customer.id) {
      throw new AppError('You do not have permission to access payments for this booking', 403);
    }
  }

  const { page, limit, method, status } = query;
  const where: Prisma.PaymentWhereInput = { bookingId };
  if (method) where.method = method;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  };
};

// ---------------------------------------------------------------------------
// Service: Get a single Payment by ID
// ---------------------------------------------------------------------------

export const getPaymentById = async (
  id: string,
  user: { id: string; role: Role }
) => {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true,
          bookingCode: true,
          customerId: true,
          fare: true,
          remaining: true,
          paymentStatus: true,
        }
      }
    }
  });

  if (!payment) throw new AppError('Payment not found', 404);

  // Customer isolation
  if (user.role === Role.CUSTOMER) {
    const customer = await getCustomerFromUserId(user.id);
    if (payment.booking.customerId !== customer.id) {
      throw new AppError('You do not have permission to access this payment', 403);
    }
  }

  return payment;
};
