import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as reportController from '../controllers/report.controller.js';

const router = Router();

router.use(authenticate);

// RBAC per report type based on specification
router.get('/revenue', authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), reportController.getRevenueReport);
router.get('/routes', authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), reportController.getRoutesReport);
router.get('/drivers', authorize('SUPER_ADMIN', 'ADMIN'), reportController.getDriversReport);
router.get('/vehicles', authorize('SUPER_ADMIN', 'ADMIN'), reportController.getVehiclesReport);
router.get('/cancellations', authorize('SUPER_ADMIN', 'ADMIN'), reportController.getCancellationsReport);
router.get('/payments', authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), reportController.getPaymentsReport);
router.get('/export', authorize('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'), reportController.exportReportCsv);

export { router as reportRoutes };
