import type { Request, Response, NextFunction } from 'express';
import * as maintenanceService from '../services/maintenance.service.js';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export const listMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicleId = req.params.vehicleId as string;
    
    try {
      maintenanceService.uuidSchema.parse(vehicleId);
    } catch (e) {
      throw new AppError('Invalid ID format', 400);
    }

    const data = await maintenanceService.getMaintenanceRecords(vehicleId);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicleId = req.params.vehicleId as string;
    const id = req.params.id as string;
    
    try {
      maintenanceService.uuidSchema.parse(vehicleId);
      maintenanceService.uuidSchema.parse(id);
    } catch (e) {
      throw new AppError('Invalid ID format', 400);
    }

    const data = await maintenanceService.getMaintenanceRecordById(vehicleId, id);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const createMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicleId = req.params.vehicleId as string;
    
    try {
      maintenanceService.uuidSchema.parse(vehicleId);
    } catch (e) {
      throw new AppError('Invalid ID format', 400);
    }

    const validatedData = maintenanceService.createMaintenanceSchema.parse(req.body);
    const data = await maintenanceService.createMaintenanceRecord(vehicleId, validatedData);

    res.status(201).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicleId = req.params.vehicleId as string;
    const id = req.params.id as string;

    try {
      maintenanceService.uuidSchema.parse(vehicleId);
      maintenanceService.uuidSchema.parse(id);
    } catch (e) {
      throw new AppError('Invalid ID format', 400);
    }

    const validatedData = maintenanceService.updateMaintenanceSchema.parse(req.body);
    const data = await maintenanceService.updateMaintenanceRecord(vehicleId, id, validatedData);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteMaintenance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const vehicleId = req.params.vehicleId as string;
    const id = req.params.id as string;

    try {
      maintenanceService.uuidSchema.parse(vehicleId);
      maintenanceService.uuidSchema.parse(id);
    } catch (e) {
      throw new AppError('Invalid ID format', 400);
    }

    await maintenanceService.deleteMaintenanceRecord(vehicleId, id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
