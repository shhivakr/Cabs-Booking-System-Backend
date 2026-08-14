import { prisma } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const createMaintenanceSchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  type: z.string().min(1),
  cost: z.number().min(0),
  description: z.string().min(1),
  provider: z.string().min(1),
});

export const updateMaintenanceSchema = createMaintenanceSchema.partial();

export const getMaintenanceRecords = async (vehicleId: string) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }

  return await prisma.maintenanceRecord.findMany({
    where: { vehicleId },
    orderBy: { date: 'desc' },
  });
};

export const getMaintenanceRecordById = async (vehicleId: string, id: string) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }

  const record = await prisma.maintenanceRecord.findFirst({
    where: { id, vehicleId },
  });

  if (!record) {
    throw new AppError('Maintenance record not found', 404);
  }

  return record;
};

export const createMaintenanceRecord = async (vehicleId: string, data: z.infer<typeof createMaintenanceSchema>) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }

  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

  return await prisma.maintenanceRecord.create({
    data: {
      ...cleanData,
      date: new Date(cleanData.date as string),
      vehicleId,
    } as any,
  });
};

export const updateMaintenanceRecord = async (vehicleId: string, id: string, data: z.infer<typeof updateMaintenanceSchema>) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }

  const record = await prisma.maintenanceRecord.findFirst({
    where: { id, vehicleId },
  });

  if (!record) {
    throw new AppError('Maintenance record not found', 404);
  }

  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
  if (cleanData.date) {
    cleanData.date = new Date(cleanData.date as string) as any;
  }

  return await prisma.maintenanceRecord.update({
    where: { id },
    data: cleanData as any,
  });
};

export const deleteMaintenanceRecord = async (vehicleId: string, id: string) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }

  const record = await prisma.maintenanceRecord.findFirst({
    where: { id, vehicleId },
  });

  if (!record) {
    throw new AppError('Maintenance record not found', 404);
  }

  await prisma.maintenanceRecord.delete({
    where: { id },
  });
};
