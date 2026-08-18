import type { Request, Response, NextFunction } from 'express';
import * as calendarService from '../services/calendar.service.js';
import { Role } from '@prisma/client';

export const getCalendar = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = calendarService.calendarQuerySchema.parse(req.query);
    const user = { id: req.user!.id, role: req.user!.role as Role };
    const result = await calendarService.getCalendar(query, user);
    
    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};
