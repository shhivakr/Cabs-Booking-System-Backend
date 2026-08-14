import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as vehicleController from '../controllers/vehicle.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), vehicleController.listVehicles);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), vehicleController.createVehicle);
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), vehicleController.getVehicle);
router.patch('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), vehicleController.updateVehicle);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), vehicleController.deleteVehicle);
router.patch('/:id/assign', authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER'), vehicleController.assignDriver);

export { router as vehicleRoutes };
