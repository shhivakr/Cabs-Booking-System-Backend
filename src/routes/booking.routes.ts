import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as bookingController from '../controllers/booking.controller.js';

const router = Router();

// Apply authentication to all booking routes
router.use(authenticate);

// ============================================
// Core Endpoints
// ============================================

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'CUSTOMER'),
  bookingController.createBooking
);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'CUSTOMER'),
  bookingController.getBookings
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'CUSTOMER'),
  bookingController.getBooking
);

router.patch(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'),
  bookingController.updateBooking
);

// ============================================
// Specialized Action Endpoints
// ============================================

router.post(
  '/:id/assign',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'),
  bookingController.assignBooking
);

router.post(
  '/:id/status',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'),
  bookingController.transitionBookingStatus
);

router.post(
  '/:id/cancel',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'CUSTOMER'),
  bookingController.cancelBooking
);

export { router as bookingRoutes };
