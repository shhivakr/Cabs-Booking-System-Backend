import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { DateRangeQuery } from '../utils/date.js';
import { resolveDateRange } from '../utils/date.js';

export const getDashboardStats = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);
  
  const bookingWhere: Prisma.BookingWhereInput = dateRange ? {
    pickupDate: dateRange
  } : {};
  
  const paymentWhere: Prisma.PaymentWhereInput = dateRange ? {
    paymentDate: dateRange,
    status: 'PAID'
  } : { status: 'PAID' };

  const [
    totalBookings,
    activeBookings,
    completedBookings,
    pendingBookings,
    fareAggregate,
    revenueAggregate
  ] = await Promise.all([
    prisma.booking.count({ where: bookingWhere }),
    prisma.booking.count({ where: { ...bookingWhere, status: { in: ['DRIVER_ARRIVED', 'ON_TRIP'] } } }),
    prisma.booking.count({ where: { ...bookingWhere, status: 'COMPLETED' } }),
    prisma.booking.count({ where: { ...bookingWhere, status: { in: ['NEW', 'CONFIRMED'] } } }),
    prisma.booking.aggregate({ 
      where: { ...bookingWhere, status: { not: 'CANCELLED' } }, 
      _sum: { fare: true } 
    }),
    prisma.payment.aggregate({ 
      where: paymentWhere, 
      _sum: { amount: true } 
    })
  ]);

  return {
    bookings: {
      total: totalBookings,
      active: activeBookings,
      completed: completedBookings,
      pending: pendingBookings
    },
    tripValue: fareAggregate._sum.fare?.toFixed(2) || "0.00",
    collectedRevenue: revenueAggregate._sum.amount?.toFixed(2) || "0.00"
  };
};

export const getDashboardRevenue = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);

  // To group by day efficiently (and independent of TZ differences at DB layer), 
  // we do simple aggregation if we want daily granularity, but doing it in memory 
  // after fetching or via raw SQL is often necessary for dynamic timezones. 
  // Since we have date inputs in the business timezone, we can use raw SQL DATE_TRUNC 
  // or fetch grouped data and aggregate. Because SQLite/Postgres differ, raw SQL is DB specific. 
  // The system uses PostgreSQL (based on package.json).
  
  let bookingCond = `status != 'CANCELLED'`;
  let paymentCond = `status = 'PAID'`;
  
  // Safe parameterization for date boundaries
  if (dateRange) {
    const fromStr = dateRange.gte.toISOString();
    const toStr = dateRange.lte.toISOString();
    bookingCond += ` AND "pickupDate" >= '${fromStr}'::timestamp AND "pickupDate" <= '${toStr}'::timestamp`;
    paymentCond += ` AND "paymentDate" >= '${fromStr}'::date AND "paymentDate" <= '${toStr}'::date`;
  }

  // Use DATE_TRUNC('day', date) AT TIME ZONE 'UTC' for grouping
  // Actually, pickupDate is timestamp, paymentDate is date
  const bookingsQuery = `
    SELECT DATE("pickupDate") as period, SUM(fare) as "tripValue"
    FROM "bookings"
    WHERE ${bookingCond}
    GROUP BY DATE("pickupDate")
    ORDER BY period ASC;
  `;

  const paymentsQuery = `
    SELECT DATE("paymentDate") as period, SUM(amount) as "collectedRevenue"
    FROM "payments"
    WHERE ${paymentCond}
    GROUP BY DATE("paymentDate")
    ORDER BY period ASC;
  `;

  const [bookingRes, paymentRes] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ period: Date | string, tripValue: Prisma.Decimal }>>(bookingsQuery),
    prisma.$queryRawUnsafe<Array<{ period: Date | string, collectedRevenue: Prisma.Decimal }>>(paymentsQuery)
  ]);

  // Merge results
  const merged: Record<string, { period: string, tripValue: string, collectedRevenue: string }> = {};

  const formatDateStr = (dateInput: Date | string) => {
    if (dateInput instanceof Date) {
      return dateInput.toISOString().split('T')[0] || '';
    }
    return String(dateInput).split('T')[0] || '';
  };

  for (const b of bookingRes) {
    const p = formatDateStr(b.period);
    if (!merged[p]) merged[p] = { period: p, tripValue: "0.00", collectedRevenue: "0.00" };
    merged[p].tripValue = b.tripValue.toFixed(2);
  }

  for (const p of paymentRes) {
    const pStr = formatDateStr(p.period);
    if (!merged[pStr]) merged[pStr] = { period: pStr, tripValue: "0.00", collectedRevenue: "0.00" };
    merged[pStr].collectedRevenue = p.collectedRevenue.toFixed(2);
  }

  return Object.values(merged).sort((a, b) => a.period.localeCompare(b.period));
};

export const getStatusBreakdown = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);
  const where = dateRange ? { pickupDate: dateRange } : {};

  const breakdown = await prisma.booking.groupBy({
    by: ['status'],
    where,
    _count: { _all: true }
  });

  const result: Record<string, number> = {};
  for (const b of breakdown) {
    result[b.status] = b._count._all;
  }
  return result;
};

export const getUnassignedBookings = async (page: number, limit: number) => {
  const where: Prisma.BookingWhereInput = {
    status: { in: ['NEW', 'CONFIRMED'] },
    driverId: null
  };

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { pickupDate: 'asc' },
      select: {
        id: true,
        bookingCode: true,
        customerName: true,
        customerPhone: true,
        pickupDate: true,
        pickupTime: true,
        pickupLocation: true,
        dropLocation: true,
        vehicleCategory: true,
        status: true,
        driverId: true,
        vehicleId: true
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

export const getUpcomingTrips = async (page: number, limit: number) => {
  const now = new Date();
  
  const where: Prisma.BookingWhereInput = {
    status: { notIn: ['COMPLETED', 'CANCELLED'] },
    pickupDate: { gte: new Date(now.toISOString().split('T')[0] || '') } // rough >= today
  };

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ pickupDate: 'asc' }, { pickupTime: 'asc' }],
      select: {
        id: true,
        bookingCode: true,
        customerName: true,
        pickupDate: true,
        pickupTime: true,
        status: true,
        driverName: true,
        vehiclePlate: true
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

export const getFleetSummary = async () => {
  const breakdown = await prisma.vehicle.groupBy({
    by: ['status'],
    _count: { _all: true }
  });

  const result: Record<string, number> = {};
  for (const b of breakdown) {
    result[b.status] = b._count._all;
  }
  return result;
};

export const getDriverSummary = async () => {
  const breakdown = await prisma.driver.groupBy({
    by: ['status'],
    _count: { _all: true }
  });

  const result: Record<string, number> = {};
  for (const b of breakdown) {
    result[b.status] = b._count._all;
  }
  return result;
};
