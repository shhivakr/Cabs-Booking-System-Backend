import type { Request, Response, NextFunction } from 'express';
import * as driverService from '../services/driver.service.js';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export const listDrivers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = driverService.driverQuerySchema.parse(req.query);
    const result = await driverService.getDrivers(query);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

export const getDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      driverService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new AppError('Invalid driver ID format', 400);
      }
      throw e;
    }
    
    const driver = await driverService.getDriverById(req.params.id as string);
    res.status(200).json({ status: 'success', data: driver });
  } catch (error) {
    next(error);
  }
};

export const createDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = driverService.createDriverSchema.parse(req.body);
    const driver = await driverService.createDriver(data);
    res.status(201).json({ status: 'success', data: driver });
  } catch (error) {
    next(error);
  }
};

export const updateDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      driverService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new AppError('Invalid driver ID format', 400);
      }
      throw e;
    }

    const data = driverService.updateDriverSchema.parse(req.body);
    const driver = await driverService.updateDriver(req.params.id as string, data);
    res.status(200).json({ status: 'success', data: driver });
  } catch (error) {
    next(error);
  }
};

export const deleteDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      driverService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new AppError('Invalid driver ID format', 400);
      }
      throw e;
    }

    await driverService.softDeleteDriver(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
