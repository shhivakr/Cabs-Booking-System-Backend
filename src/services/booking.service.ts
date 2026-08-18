import { BookingStatus, BookingSource, TripType, VehicleCategory, PaymentStatus, PaymentMethod, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';
import * as schedulingService from './scheduling.service.js';

// --- Validation Schemas ---

export const createBookingSchema = z.object({
  customerId: z.string().uuid().optional(), // Optional for CUSTOMER role (derived from token)
  pickupLocation: z.string().min(2),
  dropLocation: z.string().min(2),
  pickupDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" }),
  pickupTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Invalid time format (HH:mm)" }),
  tripType: z.nativeEnum(TripType),
  vehicleCategory: z.nativeEnum(VehicleCategory),
  source: z.nativeEnum(BookingSource).default(BookingSource.CUSTOMER_PORTAL),
  passengers: z.number().int().min(1).default(1),
  luggage: z.number().int().min(0).default(0),
  estimatedDistance: z.string().optional().nullable(),
  estimatedDuration: z.string().optional().nullable(),
  fare: z.coerce.number().min(0),
  advance: z.coerce.number().min(0).default(0),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  specialInstructions: z.string().optional().nullable()
});

export const updateBookingSchema = z.object({
  pickupLocation: z.string().min(2).optional(),
  dropLocation: z.string().min(2).optional(),
  pickupDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date" }).optional(),
  pickupTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Invalid time format (HH:mm)" }).optional(),
  tripType: z.nativeEnum(TripType).optional(),
  vehicleCategory: z.nativeEnum(VehicleCategory).optional(),
  passengers: z.number().int().min(1).optional(),
  luggage: z.number().int().min(0).optional(),
  estimatedDistance: z.string().optional().nullable(),
  estimatedDuration: z.string().optional().nullable(),
  fare: z.coerce.number().min(0).optional(),
  advance: z.coerce.number().min(0).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  specialInstructions: z.string().optional().nullable()
});

export const assignBookingSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid()
});

export const transitionBookingSchema = z.object({
  status: z.nativeEnum(BookingStatus)
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().min(2),
  cancellationNotes: z.string().optional().nullable()
});

export const bookingQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  status: z.nativeEnum(BookingStatus).optional(),
  source: z.nativeEnum(BookingSource).optional(),
  tripType: z.nativeEnum(TripType).optional(),
  customerId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// --- Helper Functions ---

const generateBookingCode = () => {
  return `PAT-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
};

const getCustomerForUser = async (userId: string) => {
  const customer = await prisma.customer.findUnique({
    where: { userId },
    select: { id: true, status: true, deletedAt: true }
  });
  if (!customer || customer.deletedAt) throw new AppError('Customer profile not found or inactive', 400);
  return customer;
};

// --- Service Logic ---

export const createBooking = async (
  data: z.infer<typeof createBookingSchema>,
  user: { id: string, role: Role }
) => {
  if (data.advance > data.fare) {
    throw new AppError('Advance cannot be greater than fare', 400);
  }

  let finalCustomerId = data.customerId;

  if (user.role === Role.CUSTOMER) {
    const customer = await getCustomerForUser(user.id);
    finalCustomerId = customer.id;
  } else {
    if (!finalCustomerId) {
      throw new AppError('customerId is required for admin/dispatcher creation', 400);
    }
  }

  const customerSnapshot = await prisma.customer.findUnique({ where: { id: finalCustomerId } });
  if (!customerSnapshot || customerSnapshot.deletedAt || customerSnapshot.status === 'INACTIVE') {
    throw new AppError('Customer not found or inactive', 400);
  }

  const remaining = data.fare - data.advance;

  // Retry logic for unique booking code
  let retries = 3;
  while (retries > 0) {
    try {
      const bookingCode = generateBookingCode();
      const booking = await prisma.booking.create({
        data: {
          bookingCode,
          customerId: finalCustomerId!,
          customerName: customerSnapshot.name,
          customerPhone: customerSnapshot.phone,
          customerEmail: customerSnapshot.email,
          customerType: customerSnapshot.type,
          customerCity: customerSnapshot.city,
          pickupLocation: data.pickupLocation,
          dropLocation: data.dropLocation,
          pickupDate: new Date(data.pickupDate),
          pickupTime: data.pickupTime,
          tripType: data.tripType,
          vehicleCategory: data.vehicleCategory,
          source: data.source,
          passengers: data.passengers,
          luggage: data.luggage,
          estimatedDistance: data.estimatedDistance ?? null,
          estimatedDuration: data.estimatedDuration ?? null,
          fare: data.fare,
          advance: data.advance,
          remaining: remaining,
          paymentMethod: data.paymentMethod,
          specialInstructions: data.specialInstructions ?? null,
          status: BookingStatus.NEW,
          timelineEvents: {
            create: {
              timestamp: new Date(),
              title: 'Booking Created',
              description: `Booking created via ${data.source}`,
              completed: true,
              current: true
            }
          }
        }
      });
      return booking;
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('bookingCode')) {
        retries--;
        if (retries === 0) throw new AppError('Failed to generate unique booking code', 500);
      } else {
        throw error;
      }
    }
  }
};

export const getBookings = async (
  query: z.infer<typeof bookingQuerySchema>,
  user: { id: string, role: Role }
) => {
  const { page, limit, search, status, source, tripType, customerId, driverId, vehicleId, startDate, endDate } = query;
  
  const where: Prisma.BookingWhereInput = {};

  if (user.role === Role.CUSTOMER) {
    const customer = await getCustomerForUser(user.id);
    where.customerId = customer.id;
  } else if (customerId) {
    where.customerId = customerId;
  }

  if (status) where.status = status;
  if (source) where.source = source;
  if (tripType) where.tripType = tripType;
  if (driverId) where.driverId = driverId;
  if (vehicleId) where.vehicleId = vehicleId;

  if (startDate || endDate) {
    where.pickupDate = {};
    if (startDate) where.pickupDate.gte = new Date(startDate);
    if (endDate) where.pickupDate.lte = new Date(endDate);
  }

  if (search) {
    where.OR = [
      { bookingCode: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.booking.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const getBookingById = async (id: string, user: { id: string, role: Role }) => {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      timelineEvents: { orderBy: { timestamp: 'asc' } }
    }
  });

  if (!booking) throw new AppError('Booking not found', 404);

  if (user.role === Role.CUSTOMER) {
    const customer = await getCustomerForUser(user.id);
    if (booking.customerId !== customer.id) {
      throw new AppError('You do not have permission to access this booking', 403);
    }
  }

  return booking;
};

export const updateBooking = async (
  id: string,
  data: z.infer<typeof updateBookingSchema>,
  user: { id: string, role: Role }
) => {
  const booking = await getBookingById(id, user); // Validates existence and ownership

  if (['ON_TRIP', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
    throw new AppError(`Cannot update booking in ${booking.status} status`, 400);
  }

  const fare = data.fare !== undefined ? data.fare : Number(booking.fare);
  const advance = data.advance !== undefined ? data.advance : Number(booking.advance);

  if (advance > fare) {
    throw new AppError('Advance cannot be greater than fare', 400);
  }

  const remaining = fare - advance;

  const dbData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

  if (dbData.pickupDate) dbData.pickupDate = new Date(dbData.pickupDate as string) as any;

  return prisma.booking.update({
    where: { id },
    data: {
      ...dbData,
      remaining
    } as any
  });
};

export const assignBooking = async (
  id: string,
  data: z.infer<typeof assignBookingSchema>
) => {
  // Only Admin/Dispatcher can assign, this is enforced by RBAC in routes

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw new AppError('Booking not found', 404);

    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
      throw new AppError(`Cannot assign booking in ${booking.status} status`, 400);
    }

    // Check Driver
    const driver = await tx.driver.findUnique({ where: { id: data.driverId } });
    if (!driver || driver.deletedAt || driver.status === 'INACTIVE') {
      throw new AppError('Driver not found or inactive', 400);
    }

    if (['INACTIVE', 'OFF_DUTY'].includes(driver.status)) {
      throw new AppError('Driver is not available', 400);
    }

    // Check Vehicle
    const vehicle = await tx.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle || vehicle.deletedAt || vehicle.status === 'INACTIVE') {
      throw new AppError('Vehicle not found or inactive', 400);
    }

    if (['INACTIVE', 'MAINTENANCE'].includes(vehicle.status)) {
      throw new AppError('Vehicle is not available', 400);
    }

    // Phase 8: Authoritative scheduling conflict check
    await schedulingService.validateAssignmentAvailability(
      driver.id, 
      vehicle.id, 
      booking.pickupDate, 
      booking.pickupTime, 
      booking.id, 
      tx
    );

    // Release old driver/vehicle if they changed
    if (booking.driverId && booking.driverId !== driver.id) {
      const { driverHasOther } = await schedulingService.getHasOtherActiveBookings(booking.driverId, null, booking.id, tx);
      await tx.driver.update({ 
        where: { id: booking.driverId }, 
        data: { 
          status: driverHasOther ? 'ASSIGNED' : 'AVAILABLE', 
          ...(driverHasOther ? {} : { assignedVehicleId: null }) 
        } 
      });
    }
    if (booking.vehicleId && booking.vehicleId !== vehicle.id) {
      const { vehicleHasOther } = await schedulingService.getHasOtherActiveBookings(null, booking.vehicleId, booking.id, tx);
      await tx.vehicle.update({ 
        where: { id: booking.vehicleId }, 
        data: { status: vehicleHasOther ? 'ASSIGNED' : 'AVAILABLE' } 
      });
      
      // Remove old driver's vehicle association if applicable
      if (booking.driverId && !vehicleHasOther) {
         await tx.driver.updateMany({
           where: { assignedVehicleId: booking.vehicleId },
           data: { assignedVehicleId: null }
         });
      }
    }

    // Assign new driver and vehicle
    await tx.driver.update({ 
      where: { id: driver.id }, 
      data: { 
        status: driver.status === 'AVAILABLE' ? 'ASSIGNED' : driver.status, 
        assignedVehicleId: vehicle.id 
      } 
    });
    await tx.vehicle.update({ 
      where: { id: vehicle.id }, 
      data: { status: vehicle.status === 'AVAILABLE' ? 'ASSIGNED' : vehicle.status } 
    });

    // Transition status if NEW or CONFIRMED
    const newStatus = ['NEW', 'CONFIRMED'].includes(booking.status) ? BookingStatus.DRIVER_ASSIGNED : booking.status;

    // Remove current flag from old timeline events
    await tx.timelineEvent.updateMany({
      where: { bookingId: id, current: true },
      data: { current: false }
    });

    return tx.booking.update({
      where: { id },
      data: {
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,
        driverRating: driver.rating,
        driverLicense: driver.licenseNumber,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plateNumber,
        vehicleModel: vehicle.model,
        status: newStatus,
        timelineEvents: {
          create: {
            timestamp: new Date(),
            title: 'Driver & Vehicle Assigned',
            description: `Assigned Driver ${driver.name} and Vehicle ${vehicle.plateNumber}`,
            completed: true,
            current: true
          }
        }
      }
    });
  });
};

export const transitionBookingStatus = async (
  id: string,
  data: z.infer<typeof transitionBookingSchema>
) => {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw new AppError('Booking not found', 404);

    const from = booking.status;
    const to = data.status;

    if (from === to) return booking; // Idempotent

    // Enforce strict state machine
    const validTransitions: Record<string, string[]> = {
      NEW: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['DRIVER_ASSIGNED', 'CANCELLED'],
      DRIVER_ASSIGNED: ['DRIVER_ARRIVED', 'CANCELLED'],
      DRIVER_ARRIVED: ['ON_TRIP', 'CANCELLED'],
      ON_TRIP: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: []
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new AppError(`Invalid status transition from ${from} to ${to}`, 409);
    }

    if (to === 'DRIVER_ASSIGNED' && (!booking.driverId || !booking.vehicleId)) {
      throw new AppError('Cannot transition to DRIVER_ASSIGNED without a driver and vehicle', 409);
    }

    // Handle COMPLETED lifecycle changes
    if (to === 'COMPLETED') {
      if (booking.driverId) {
        const { driverHasOther } = await schedulingService.getHasOtherActiveBookings(booking.driverId, null, booking.id, tx);
        await tx.driver.update({ 
          where: { id: booking.driverId }, 
          data: { 
            status: driverHasOther ? 'ASSIGNED' : 'AVAILABLE',
            ...(driverHasOther ? {} : { assignedVehicleId: null }),
            tripsCompleted: { increment: 1 },
            totalEarnings: { increment: booking.fare }
          } 
        });
      }
      if (booking.vehicleId) {
        const { vehicleHasOther } = await schedulingService.getHasOtherActiveBookings(null, booking.vehicleId, booking.id, tx);
        await tx.vehicle.update({ 
          where: { id: booking.vehicleId }, 
          data: { status: vehicleHasOther ? 'ASSIGNED' : 'AVAILABLE' } 
        });
      }
      await tx.customer.update({
        where: { id: booking.customerId },
        data: {
          totalTrips: { increment: 1 },
          lifetimeSpend: { increment: booking.fare },
          lastBookingDate: new Date()
        }
      });
    }

    // Handle CANCELLED lifecycle changes if transitioned via status (though cancel endpoint is preferred)
    if (to === 'CANCELLED') {
      if (booking.driverId) {
        const { driverHasOther } = await schedulingService.getHasOtherActiveBookings(booking.driverId, null, booking.id, tx);
        await tx.driver.update({ 
          where: { id: booking.driverId }, 
          data: { 
            status: driverHasOther ? 'ASSIGNED' : 'AVAILABLE',
            ...(driverHasOther ? {} : { assignedVehicleId: null })
          } 
        });
      }
      if (booking.vehicleId) {
        const { vehicleHasOther } = await schedulingService.getHasOtherActiveBookings(null, booking.vehicleId, booking.id, tx);
        await tx.vehicle.update({ 
          where: { id: booking.vehicleId }, 
          data: { status: vehicleHasOther ? 'ASSIGNED' : 'AVAILABLE' } 
        });
      }
    }
    
    // Handle ON_TRIP lifecycle changes
    if (to === 'ON_TRIP') {
       if (booking.driverId) {
          await tx.driver.update({ where: { id: booking.driverId }, data: { status: 'ON_TRIP' } });
       }
       if (booking.vehicleId) {
          await tx.vehicle.update({ where: { id: booking.vehicleId }, data: { status: 'ON_TRIP' } });
       }
    }

    // Remove current flag from old timeline events
    await tx.timelineEvent.updateMany({
      where: { bookingId: id, current: true },
      data: { current: false }
    });

    return tx.booking.update({
      where: { id },
      data: {
        status: to,
        timelineEvents: {
          create: {
            timestamp: new Date(),
            title: `Status updated to ${to}`,
            description: `Booking transitioned from ${from} to ${to}`,
            completed: true,
            current: true
          }
        }
      }
    });
  });
};

export const cancelBooking = async (
  id: string,
  data: z.infer<typeof cancelBookingSchema>,
  user: { id: string, role: Role }
) => {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id } });
    if (!booking) throw new AppError('Booking not found', 404);

    if (user.role === Role.CUSTOMER) {
      const customer = await getCustomerForUser(user.id);
      if (booking.customerId !== customer.id) {
        throw new AppError('You do not have permission to cancel this booking', 403);
      }
    }

    if (['ON_TRIP', 'COMPLETED', 'CANCELLED'].includes(booking.status)) {
      throw new AppError(`Cannot cancel booking in ${booking.status} status`, 409);
    }

    if (booking.driverId) {
      const { driverHasOther } = await schedulingService.getHasOtherActiveBookings(booking.driverId, null, booking.id, tx);
      await tx.driver.update({ 
        where: { id: booking.driverId }, 
        data: { 
          status: driverHasOther ? 'ASSIGNED' : 'AVAILABLE',
          ...(driverHasOther ? {} : { assignedVehicleId: null })
        } 
      });
    }
    if (booking.vehicleId) {
      const { vehicleHasOther } = await schedulingService.getHasOtherActiveBookings(null, booking.vehicleId, booking.id, tx);
      await tx.vehicle.update({ 
        where: { id: booking.vehicleId }, 
        data: { status: vehicleHasOther ? 'ASSIGNED' : 'AVAILABLE' } 
      });
    }

    await tx.timelineEvent.updateMany({
      where: { bookingId: id, current: true },
      data: { current: false }
    });

    return tx.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: data.cancellationReason,
        cancellationNotes: data.cancellationNotes ?? null,
        timelineEvents: {
          create: {
            timestamp: new Date(),
            title: 'Booking Cancelled',
            description: `Reason: ${data.cancellationReason}`,
            completed: true,
            current: true
          }
        }
      }
    });
  });
};
