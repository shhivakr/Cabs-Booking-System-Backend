import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/errors.js';

const BLOCKING_STATUSES: BookingStatus[] = [
  BookingStatus.NEW,
  BookingStatus.CONFIRMED,
  BookingStatus.DRIVER_ASSIGNED,
  BookingStatus.DRIVER_ARRIVED,
  BookingStatus.ON_TRIP
];

export const checkDriverAvailability = async (
  driverId: string,
  pickupDate: Date,
  pickupTime: string,
  excludeBookingId?: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> => {
  const where: Prisma.BookingWhereInput = {
    driverId,
    pickupDate,
    pickupTime,
    status: { in: BLOCKING_STATUSES }
  };

  if (excludeBookingId) {
    where.id = { not: excludeBookingId };
  }

  const conflict = await tx.booking.findFirst({ where });

  if (conflict) {
    throw new AppError('Driver is already assigned to another booking at the requested pickup date and time.', 409);
  }
};

export const checkVehicleAvailability = async (
  vehicleId: string,
  pickupDate: Date,
  pickupTime: string,
  excludeBookingId?: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> => {
  const where: Prisma.BookingWhereInput = {
    vehicleId,
    pickupDate,
    pickupTime,
    status: { in: BLOCKING_STATUSES }
  };

  if (excludeBookingId) {
    where.id = { not: excludeBookingId };
  }

  const conflict = await tx.booking.findFirst({ where });

  if (conflict) {
    throw new AppError('Vehicle is already assigned to another booking at the requested pickup date and time.', 409);
  }
};

export const validateAssignmentAvailability = async (
  driverId: string,
  vehicleId: string,
  pickupDate: Date,
  pickupTime: string,
  excludeBookingId?: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> => {
  await checkDriverAvailability(driverId, pickupDate, pickupTime, excludeBookingId, tx);
  await checkVehicleAvailability(vehicleId, pickupDate, pickupTime, excludeBookingId, tx);
};

export const getHasOtherActiveBookings = async (
  driverId: string | null,
  vehicleId: string | null,
  excludeBookingId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<{ driverHasOther: boolean, vehicleHasOther: boolean }> => {
  let driverHasOther = false;
  let vehicleHasOther = false;

  if (driverId) {
    const count = await tx.booking.count({
      where: {
        driverId,
        id: { not: excludeBookingId },
        status: { in: BLOCKING_STATUSES }
      }
    });
    driverHasOther = count > 0;
  }

  if (vehicleId) {
    const count = await tx.booking.count({
      where: {
        vehicleId,
        id: { not: excludeBookingId },
        status: { in: BLOCKING_STATUSES }
      }
    });
    vehicleHasOther = count > 0;
  }

  return { driverHasOther, vehicleHasOther };
};
