import { VehicleStatus, VehicleCategory, DriverStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { generateVehicleId } from '../utils/idGenerator.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

export const createVehicleSchema = z.object({
  plateNumber: z.string(),
  model: z.string(),
  category: z.enum(['SEDAN', 'SUV', 'INNOVA', 'TEMPO_TRAVELLER', 'PREMIUM']),
  year: z.number().min(1990).max(new Date().getFullYear() + 1),
  seats: z.number().min(1),
  luggageCapacity: z.number().min(0),
  hasAc: z.boolean().optional().default(true),
  fuelType: z.string(),
  color: z.string(),
  fitnessExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' }),
  insuranceExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' }),
  permitExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' }),
  pucExpiry: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date' }),
});

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export const vehicleQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().max(100).default(10),
  search: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
  category: z.nativeEnum(VehicleCategory).optional(),
});

export const assignDriverSchema = z.object({
  driverId: z.string().uuid().nullable(),
});

export const uuidSchema = z.string().uuid();

export const getVehicles = async (query: z.infer<typeof vehicleQuerySchema>) => {
  const { page, limit, search, status, category } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.VehicleWhereInput = {
    deletedAt: null,
    ...(status && { status }),
    ...(category && { category }),
    ...(search && {
      OR: [
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { vehicleCode: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [total, data] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      include: { assignedDriver: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getVehicleById = async (id: string) => {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, deletedAt: null },
    include: {
      assignedDriver: true,
      maintenanceRecords: {
        take: 5,
        orderBy: { date: 'desc' },
      },
    },
  });

  if (!vehicle) {
    throw new AppError('Vehicle not found', 404);
  }
  return vehicle;
};

export const createVehicle = async (data: z.infer<typeof createVehicleSchema>) => {
  const existing = await prisma.vehicle.findUnique({
    where: { plateNumber: data.plateNumber },
  });
  if (existing && !existing.deletedAt) {
    throw new AppError('Vehicle with this plate number already exists', 400);
  }

  const vehicleCode = await generateVehicleId();
  const cleanData = Object.fromEntries(Object.entries({
    ...data,
    fitnessExpiry: new Date(data.fitnessExpiry),
    insuranceExpiry: new Date(data.insuranceExpiry),
    permitExpiry: new Date(data.permitExpiry),
    pucExpiry: new Date(data.pucExpiry),
  }).filter(([_, v]) => v !== undefined));

  return prisma.vehicle.create({
    data: {
      ...(cleanData as any),
      vehicleCode,
      status: 'AVAILABLE',
    },
  });
};

export const updateVehicle = async (id: string, data: z.infer<typeof updateVehicleSchema>) => {
  await getVehicleById(id);

  if (data.plateNumber) {
    const existing = await prisma.vehicle.findUnique({
      where: { plateNumber: data.plateNumber },
    });
    if (existing && existing.id !== id && !existing.deletedAt) {
      throw new AppError('Vehicle with this plate number already exists', 400);
    }
  }

  const cleanData = Object.fromEntries(Object.entries({
    ...data,
    fitnessExpiry: data.fitnessExpiry ? new Date(data.fitnessExpiry) : undefined,
    insuranceExpiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : undefined,
    permitExpiry: data.permitExpiry ? new Date(data.permitExpiry) : undefined,
    pucExpiry: data.pucExpiry ? new Date(data.pucExpiry) : undefined,
  }).filter(([_, v]) => v !== undefined));

  return prisma.vehicle.update({
    where: { id },
    data: cleanData as any,
  });
};

export const softDeleteVehicle = async (id: string) => {
  const vehicle = await getVehicleById(id);
  if (vehicle.status === 'ASSIGNED' || vehicle.status === 'ON_TRIP') {
    throw new AppError(`Cannot delete vehicle in ${vehicle.status} status`, 400);
  }

  await prisma.vehicle.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  });
};

export const assignDriver = async (vehicleId: string, data: z.infer<typeof assignDriverSchema>) => {
  const { driverId } = data;
  
  return prisma.$transaction(async (tx) => {
    if (driverId === null) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null },
        include: { assignedDriver: true },
      });
      if (!vehicle) throw new AppError('Vehicle not found', 404);
      if (!vehicle.assignedDriver) throw new AppError('Vehicle does not have an assigned driver', 400);
      
      const driver = vehicle.assignedDriver;
      await tx.driver.update({
        where: { id: driver.id },
        data: { assignedVehicleId: null, status: 'AVAILABLE' },
      });
      
      return tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'AVAILABLE' },
        include: { assignedDriver: true },
      });
    } else {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: vehicleId, deletedAt: null },
      });
      if (!vehicle) throw new AppError('Vehicle not found', 404);
      if (vehicle.status !== 'AVAILABLE') throw new AppError('Vehicle is not available', 400);
      
      const driver = await tx.driver.findFirst({
        where: { id: driverId, deletedAt: null },
      });
      if (!driver) throw new AppError('Driver not found', 404);
      if (driver.status !== 'AVAILABLE') throw new AppError('Driver is not available', 400);
      if (driver.assignedVehicleId !== null) throw new AppError('Driver is already assigned to a vehicle', 400);
      
      await tx.driver.update({
        where: { id: driverId },
        data: { assignedVehicleId: vehicleId, status: 'ASSIGNED' },
      });
      
      return tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'ASSIGNED' },
        include: { assignedDriver: true },
      });
    }
  });
};
