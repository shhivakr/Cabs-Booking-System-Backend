import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as paymentController from '../controllers/payment.controller.js';

// ---------------------------------------------------------------------------
// Booking-scoped payment routes
// Mounted at: /api/v1/bookings/:bookingId/payments
// ---------------------------------------------------------------------------
const bookingScopedRouter = Router({ mergeParams: true });

bookingScopedRouter.use(authenticate);

bookingScopedRouter.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'),
  paymentController.createPayment
);

bookingScopedRouter.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'DISPATCHER', 'CUSTOMER'),
  paymentController.getPaymentsForBooking
);

// ---------------------------------------------------------------------------
// Global payment routes
// Mounted at: /api/v1/payments
// ---------------------------------------------------------------------------
const globalRouter = Router();

globalRouter.use(authenticate);

globalRouter.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'DISPATCHER', 'CUSTOMER'),
  paymentController.getPayment
);

export { bookingScopedRouter as bookingPaymentRoutes, globalRouter as paymentRoutes };
