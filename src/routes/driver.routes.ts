import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as driverController from '../controllers/driver.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), driverController.listDrivers);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), driverController.createDriver);
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), driverController.getDriver);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), driverController.updateDriver);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), driverController.deleteDriver);

export { router as driverRoutes };
