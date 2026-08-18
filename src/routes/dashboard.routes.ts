import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate);

// All dashboard routes are restricted to operational roles
const operationalRoles = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'] as const;

router.get('/stats', authorize(...operationalRoles), dashboardController.getStats);
router.get('/revenue', authorize(...operationalRoles), dashboardController.getRevenue);
router.get('/status-breakdown', authorize(...operationalRoles), dashboardController.getStatusBreakdown);
router.get('/unassigned', authorize(...operationalRoles), dashboardController.getUnassignedBookings);
router.get('/upcoming-trips', authorize(...operationalRoles), dashboardController.getUpcomingTrips);
router.get('/fleet-summary', authorize(...operationalRoles), dashboardController.getFleetSummary);
router.get('/driver-summary', authorize(...operationalRoles), dashboardController.getDriverSummary);

export { router as dashboardRoutes };
