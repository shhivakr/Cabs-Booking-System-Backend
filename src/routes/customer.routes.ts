import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as customerController from '../controllers/customer.controller.js';

const router = Router();

// Apply authentication to all customer routes
router.use(authenticate);

// ============================================
// Customer Self-Service Endpoints
// ============================================
router.get(
  '/me/profile',
  authorize('CUSTOMER'),
  customerController.getMyProfile
);

router.patch(
  '/me/profile',
  authorize('CUSTOMER'),
  customerController.updateMyProfile
);

// ============================================
// Admin/Back-office Endpoints
// ============================================
router.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'),
  customerController.listCustomers
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'),
  customerController.createCustomer
);

router.get(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'),
  customerController.getCustomer
);

router.patch(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'),
  customerController.updateCustomer
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  customerController.deleteCustomer
);

export { router as customerRoutes };
