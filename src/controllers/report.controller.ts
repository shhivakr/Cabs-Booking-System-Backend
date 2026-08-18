import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as reportService from '../services/report.service.js';
import { dateRangeQuerySchema } from '../utils/date.js';

export const getRevenueReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await reportService.getRevenueReport(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getRoutesReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '10', 10)));
    const result = await reportService.getRoutesReport(query, page, limit);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getDriversReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '10', 10)));
    const result = await reportService.getDriversReport(query, page, limit);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getVehiclesReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '10', 10)));
    const result = await reportService.getVehiclesReport(query, page, limit);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getCancellationsReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await reportService.getCancellationsReport(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const getPaymentsReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = dateRangeQuerySchema.parse(req.query);
    const data = await reportService.getPaymentsReport(query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

export const exportReportCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type as string;
    const query = dateRangeQuerySchema.parse(req.query);
    await reportService.streamExportCsv(type, query, res);
  } catch (error) {
    next(error);
  }
};
