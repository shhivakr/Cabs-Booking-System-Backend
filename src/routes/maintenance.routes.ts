import { Router } from 'express';
import {
  listMaintenance,
  getMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance
} from '../controllers/maintenance.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.route('/')
  .get(authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), listMaintenance)
  .post(authorize('SUPER_ADMIN', 'ADMIN'), createMaintenance);

router.route('/:id')
  .get(authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'), getMaintenance)
  .patch(authorize('SUPER_ADMIN', 'ADMIN'), updateMaintenance)
  .delete(authorize('SUPER_ADMIN', 'ADMIN'), deleteMaintenance);

export { router as maintenanceRoutes };
