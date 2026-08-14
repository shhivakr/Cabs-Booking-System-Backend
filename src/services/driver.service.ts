import { DriverStatus, LicenseType, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { generateDriverId } from '../utils/idGenerator.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const createDriverSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  address: z.string(),
  dob: z.string().refine((date) => new Date(date) < new Date(), { message: 'DOB must be in the past' }),
  licenseNumber: z.string(),
  licenseType: z.enum([LicenseType.COMMERCIAL_LMV, LicenseType.COMMERCIAL_HMV, LicenseType.COMMERCIAL_PSV]),
  licenseExpiry: z.string().refine((date) => new Date(date) > new Date(), { message: 'License expiry must be in the future' }),
  joiningDate: z.string(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  experience: z.string().optional(),
});

export const updateDriverSchema = createDriverSchema.partial().extend({
  status: z.enum([DriverStatus.AVAILABLE, DriverStatus.ASSIGNED, DriverStatus.ON_TRIP, DriverStatus.OFF_DUTY, DriverStatus.INACTIVE]).optional(),
});

export const driverQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.nativeEnum(DriverStatus).optional(),
  licenseType: z.nativeEnum(LicenseType).optional(),
});

export const getDrivers = async (query: z.infer<typeof driverQuerySchema>) => {
  const { page, limit, search, status, licenseType } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.DriverWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { driverCode: { contains: search, mode: 'insensitive' } },
      { licenseNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    where.status = status;
  }

  if (licenseType) {
    where.licenseType = licenseType;
  }

  const [total, drivers] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    data: drivers,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getDriverById = async (id: string) => {
  const driver = await prisma.driver.findFirst({
    where: { id, deletedAt: null },
    include: { assignedVehicle: true },
  });

  if (!driver) {
    throw new AppError('Driver not found', 404);
  }

  return driver;
};

export const createDriver = async (data: z.infer<typeof createDriverSchema>) => {
  const existingPhone = await prisma.driver.findFirst({ where: { phone: data.phone, deletedAt: null } });
  if (existingPhone) {
    throw new AppError('Driver with this phone number already exists', 400);
  }

  const existingLicense = await prisma.driver.findFirst({ where: { licenseNumber: data.licenseNumber, deletedAt: null } });
  if (existingLicense) {
    throw new AppError('Driver with this license number already exists', 400);
  }

  const driverCode = await generateDriverId();

  const createData = Object.fromEntries(
    Object.entries({
      ...data,
      dob: new Date(data.dob),
      licenseExpiry: new Date(data.licenseExpiry),
      joiningDate: new Date(data.joiningDate),
      driverCode,
      status: DriverStatus.AVAILABLE,
    }).filter(([_, v]) => v !== undefined)
  ) as any;

  return prisma.driver.create({
    data: createData,
  });
};

export const updateDriver = async (id: string, data: z.infer<typeof updateDriverSchema>) => {
  await getDriverById(id); // verify exists

  if (data.phone) {
    const existingPhone = await prisma.driver.findFirst({ where: { phone: data.phone, deletedAt: null, id: { not: id } } });
    if (existingPhone) {
      throw new AppError('Driver with this phone number already exists', 400);
    }
  }

  if (data.licenseNumber) {
    const existingLicense = await prisma.driver.findFirst({ where: { licenseNumber: data.licenseNumber, deletedAt: null, id: { not: id } } });
    if (existingLicense) {
      throw new AppError('Driver with this license number already exists', 400);
    }
  }

  const updateData = Object.fromEntries(
    Object.entries({
      ...data,
      dob: data.dob ? new Date(data.dob) : undefined,
      licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
      joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
    }).filter(([_, v]) => v !== undefined)
  ) as any;

  return prisma.driver.update({
    where: { id },
    data: updateData,
  });
};

export const softDeleteDriver = async (id: string) => {
  const driver = await getDriverById(id);

  if (driver.status === DriverStatus.ASSIGNED || driver.status === DriverStatus.ON_TRIP) {
    throw new AppError('Cannot delete driver while assigned or on trip', 400);
  }

  return prisma.driver.update({
    where: { id },
    data: { deletedAt: new Date(), status: DriverStatus.INACTIVE },
  });
};
