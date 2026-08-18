import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import * as calendarController from '../controllers/calendar.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'CUSTOMER'),
  calendarController.getCalendar
);

export { router as calendarRoutes };
