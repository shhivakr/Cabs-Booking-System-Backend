import { Prisma, Role, BookingStatus, BookingSource, TripType } from '@prisma/client';
import { prisma } from '../config/database.js';
import { DateRangeQuery, resolveDateRange } from '../utils/date.js';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export const calendarQuerySchema = z.object({
  dateRange: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  driverId: z.string().uuid({ message: "Invalid driver UUID" }).optional(),
  vehicleId: z.string().uuid({ message: "Invalid vehicle UUID" }).optional(),
  status: z.nativeEnum(BookingStatus, { message: "Invalid status" }).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})
.refine(data => {
  if (data.from && data.to) return true;
  if (data.dateRange === 'custom') return !!data.from && !!data.to;
  return true;
}, { message: "'from' and 'to' are required when dateRange is 'custom'" })
.refine(data => {
  if (data.from && data.to) return new Date(data.from) <= new Date(data.to);
  return true;
}, { message: "'from' date cannot be after 'to' date" })
.refine(data => {
  if (data.from && isNaN(Date.parse(data.from))) return false;
  if (data.to && isNaN(Date.parse(data.to))) return false;
  return true;
}, { message: "Invalid date format for 'from' or 'to'. Use YYYY-MM-DD" });

export const getCalendar = async (
  query: z.infer<typeof calendarQuerySchema>,
  user: { id: string, role: Role }
) => {
  const { page, limit, driverId, vehicleId, status } = query;
  
  const where: Prisma.BookingWhereInput = {};

  // RBAC: Customer Isolation
  if (user.role === Role.CUSTOMER) {
    const customer = await prisma.customer.findUnique({
      where: { userId: user.id },
      select: { id: true, deletedAt: true, status: true }
    });
    
    if (!customer || customer.deletedAt || customer.status === 'INACTIVE') {
      throw new AppError('Customer profile not found or inactive', 400);
    }
    
    where.customerId = customer.id;
  }

  // Date Filtering
  // Only apply date range if provided; if entirely absent, we could return all or default to week/month. 
  // Let's assume the query schema requires nothing but we can use the resolver.
  if (query.dateRange || (query.from && query.to)) {
    // We'll construct a DateRangeQuery compliant object. The resolver returns undefined if nothing is provided.
    const dateQuery: DateRangeQuery = {
      dateRange: query.dateRange,
      from: query.from,
      to: query.to
    };
    
    // The resolveDateRange might throw if from/to are invalid, but we validated them in calendarQuerySchema?
    // Wait, calendarQuerySchema doesn't have the refinements from dateRangeQuerySchema. 
    // We should use the same refinements or rely on resolveDateRange.
    // Actually, `resolveDateRange` expects string format validation, let's just let Prisma handle invalid dates or do basic check.
    const dateFilter = resolveDateRange(dateQuery);
    if (dateFilter) {
      where.pickupDate = dateFilter;
    }
  }

  // Optional Filters
  if (driverId) where.driverId = driverId;
  if (vehicleId) where.vehicleId = vehicleId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { pickupDate: 'asc' },
        { pickupTime: 'asc' },
        { createdAt: 'asc' }
      ],
      select: {
        id: true,
        bookingCode: true,
        customerName: true,
        customerPhone: true,
        pickupLocation: true,
        dropLocation: true,
        pickupDate: true,
        pickupTime: true,
        status: true,
        driverId: true,
        driverName: true,
        vehicleId: true,
        vehiclePlate: true,
        vehicleModel: true,
        vehicleCategory: true,
        tripType: true,
        source: true,
        createdAt: true,
      }
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
