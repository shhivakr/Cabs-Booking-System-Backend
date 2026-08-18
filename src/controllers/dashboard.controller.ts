import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as dashboardService from '../services/dashboard.service.js';
import { dateRangeQuerySchema } from '../utils/date.js';
import { AppError } from '../utils/errors.js';

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await dashboardService.getDashboardStats(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getRevenue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await dashboardService.getDashboardRevenue(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getStatusBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await dashboardService.getStatusBreakdown(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getUnassignedBookings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '10', 10)));
    const result = await dashboardService.getUnassignedBookings(page, limit);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getUpcomingTrips = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '10', 10)));
    const result = await dashboardService.getUpcomingTrips(page, limit);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getFleetSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await dashboardService.getFleetSummary();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getDriverSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await dashboardService.getDriverSummary();
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};
