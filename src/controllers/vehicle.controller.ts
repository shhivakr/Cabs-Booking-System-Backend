import type { Request, Response, NextFunction } from 'express';
import * as vehicleService from '../services/vehicle.service.js';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export const listVehicles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = vehicleService.vehicleQuerySchema.parse(req.query);
    const result = await vehicleService.getVehicles(query);
    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return next(new AppError(error.issues[0]?.message ?? 'Validation failed', 400));
    }
    next(error);
  }
};

export const getVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      vehicleService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      throw new AppError('Invalid vehicle ID format', 400);
    }
    const vehicle = await vehicleService.getVehicleById(req.params.id as string);
    res.status(200).json({
      status: 'success',
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
};

export const createVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = vehicleService.createVehicleSchema.parse(req.body);
    const vehicle = await vehicleService.createVehicle(data);
    res.status(201).json({
      status: 'success',
      data: vehicle,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return next(new AppError(error.issues[0]?.message ?? 'Validation failed', 400));
    }
    next(error);
  }
};

export const updateVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      vehicleService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      throw new AppError('Invalid vehicle ID format', 400);
    }
    const data = vehicleService.updateVehicleSchema.parse(req.body);
    const vehicle = await vehicleService.updateVehicle(req.params.id as string, data);
    res.status(200).json({
      status: 'success',
      data: vehicle,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return next(new AppError(error.issues[0]?.message ?? 'Validation failed', 400));
    }
    next(error);
  }
};

export const deleteVehicle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      vehicleService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      throw new AppError('Invalid vehicle ID format', 400);
    }
    await vehicleService.softDeleteVehicle(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const assignDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      vehicleService.uuidSchema.parse(req.params.id as string);
    } catch (e) {
      throw new AppError('Invalid vehicle ID format', 400);
    }
    const data = vehicleService.assignDriverSchema.parse(req.body);
    const vehicle = await vehicleService.assignDriver(req.params.id as string, data);
    res.status(200).json({
      status: 'success',
      data: vehicle,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return next(new AppError(error.issues[0]?.message ?? 'Validation failed', 400));
    }
    next(error);
  }
};
