import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { DateRangeQuery } from '../utils/date.js';
import { resolveDateRange } from '../utils/date.js';
import { toCsvRow } from '../utils/csv.js';
import { AppError } from '../utils/errors.js';

export const getRevenueReport = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);
  
  const bookingWhere: Prisma.BookingWhereInput = dateRange ? {
    pickupDate: dateRange
  } : {};

  const paymentWhere: Prisma.PaymentWhereInput = dateRange ? {
    paymentDate: dateRange,
    status: 'PAID'
  } : { status: 'PAID' };

  const [fareAgg, revenueAgg, outstandingAgg, count] = await Promise.all([
    prisma.booking.aggregate({
      where: { ...bookingWhere, status: { not: 'CANCELLED' } },
      _sum: { fare: true }
    }),
    prisma.payment.aggregate({
      where: paymentWhere,
      _sum: { amount: true }
    }),
    prisma.booking.aggregate({
      where: { ...bookingWhere, status: { not: 'CANCELLED' } },
      _sum: { remaining: true }
    }),
    prisma.booking.count({ where: { ...bookingWhere, status: { not: 'CANCELLED' } } })
  ]);

  return {
    period: query.dateRange || 'custom',
    tripValue: fareAgg._sum.fare?.toFixed(2) || "0.00",
    collectedRevenue: revenueAgg._sum.amount?.toFixed(2) || "0.00",
    outstandingBalance: outstandingAgg._sum.remaining?.toFixed(2) || "0.00",
    tripCount: count
  };
};

export const getRoutesReport = async (query: DateRangeQuery, page: number, limit: number) => {
  const dateRange = resolveDateRange(query);
  const where: Prisma.BookingWhereInput = dateRange ? { pickupDate: dateRange } : {};

  // Group by pickupLocation and dropLocation
  const routes = await prisma.booking.groupBy({
    by: ['pickupLocation', 'dropLocation'],
    where: { ...where, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { fare: true },
    orderBy: { _count: { pickupLocation: 'desc' } },
    skip: (page - 1) * limit,
    take: limit
  });

  const data = routes.map(r => ({
    route: `${r.pickupLocation} → ${r.dropLocation}`,
    pickupLocation: r.pickupLocation,
    dropLocation: r.dropLocation,
    bookingCount: r._count._all,
    totalFare: r._sum.fare?.toFixed(2) || "0.00",
    averageFare: r._count._all > 0 && r._sum.fare 
      ? (Number(r._sum.fare) / r._count._all).toFixed(2) 
      : "0.00"
  }));

  // Prisma doesn't support grouping count over distinct groups directly for pagination totals
  const totalGroups = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT "pickupLocation" || ' → ' || "dropLocation")::int as count
    FROM "bookings"
    WHERE status != 'CANCELLED'
  `;

  const total = totalGroups[0]?.count || 0;

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

export const getDriversReport = async (query: DateRangeQuery, page: number, limit: number) => {
  const dateRange = resolveDateRange(query);
  
  const where = dateRange ? { pickupDate: dateRange } : {};

  // Find all drivers that have bookings in this range
  const driverStats = await prisma.booking.groupBy({
    by: ['driverId', 'driverName'],
    where: { ...where, driverId: { not: null } },
    _count: { _all: true, status: true },
    _sum: { fare: true },
    orderBy: { _count: { driverId: 'desc' } },
    skip: (page - 1) * limit,
    take: limit
  });

  // We need to fetch how many of those were COMPLETED vs CANCELLED.
  // GroupBy over multiple fields including status is complex to paginate.
  // We'll augment the driver stats with individual counts.
  
  const data = await Promise.all(driverStats.map(async (stat) => {
    const completed = await prisma.booking.count({ 
      where: { ...where, driverId: stat.driverId, status: 'COMPLETED' } 
    });
    const cancelled = await prisma.booking.count({ 
      where: { ...where, driverId: stat.driverId, status: 'CANCELLED' } 
    });
    
    return {
      driverId: stat.driverId,
      driverName: stat.driverName,
      assignedTrips: stat._count._all,
      completedTrips: completed,
      cancelledTrips: cancelled,
      totalFareHandled: stat._sum.fare?.toFixed(2) || "0.00",
      averageFare: completed > 0 && stat._sum.fare 
        ? (Number(stat._sum.fare) / completed).toFixed(2)
        : "0.00"
    };
  }));

  const totalGroups = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT "driverId")::int as count
    FROM "bookings"
    WHERE "driverId" IS NOT NULL
  `;

  const total = totalGroups[0]?.count || 0;

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getVehiclesReport = async (query: DateRangeQuery, page: number, limit: number) => {
  const dateRange = resolveDateRange(query);
  const where = dateRange ? { pickupDate: dateRange } : {};

  const vehicleStats = await prisma.booking.groupBy({
    by: ['vehicleId', 'vehiclePlate', 'vehicleModel'],
    where: { ...where, vehicleId: { not: null } },
    _count: { _all: true },
    _sum: { fare: true },
    orderBy: { _count: { vehicleId: 'desc' } },
    skip: (page - 1) * limit,
    take: limit
  });

  const data = await Promise.all(vehicleStats.map(async (stat) => {
    const completed = await prisma.booking.count({
      where: { ...where, vehicleId: stat.vehicleId, status: 'COMPLETED' }
    });

    return {
      vehicleId: stat.vehicleId,
      vehiclePlate: stat.vehiclePlate,
      vehicleModel: stat.vehicleModel,
      assignedTrips: stat._count._all,
      completedTrips: completed,
      fareHandled: stat._sum.fare?.toFixed(2) || "0.00",
      utilizationMetric: `${completed} completed trips`
    };
  }));

  const totalGroups = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT "vehicleId")::int as count
    FROM "bookings"
    WHERE "vehicleId" IS NOT NULL
  `;
  const total = totalGroups[0]?.count || 0;

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getCancellationsReport = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);
  const where: Prisma.BookingWhereInput = {
    status: 'CANCELLED',
    ...(dateRange ? { pickupDate: dateRange } : {})
  };

  const [total, byReason] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.groupBy({
      by: ['cancellationReason'],
      where,
      _count: { _all: true }
    })
  ]);

  const reasons: Record<string, number> = {};
  for (const b of byReason) {
    const reason = b.cancellationReason || 'Unknown';
    reasons[reason] = b._count._all;
  }

  return {
    totalCancellations: total,
    reasons
  };
};

export const getPaymentsReport = async (query: DateRangeQuery) => {
  const dateRange = resolveDateRange(query);
  const where: Prisma.PaymentWhereInput = {
    status: 'PAID',
    ...(dateRange ? { paymentDate: dateRange } : {})
  };

  const [totalAgg, byMethod] = await Promise.all([
    prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { _all: true }
    })
  ]);

  const methods = byMethod.map(b => ({
    method: b.method,
    transactionCount: b._count._all,
    totalCollected: b._sum.amount?.toFixed(2) || "0.00"
  }));

  return {
    transactionCount: totalAgg._count._all,
    totalCollected: totalAgg._sum.amount?.toFixed(2) || "0.00",
    methods
  };
};

// ============================================================================
// Streaming CSV Exports
// ============================================================================

export const streamExportCsv = async (
  type: string,
  query: DateRangeQuery,
  res: any // Express Response
) => {
  const validTypes = ['revenue', 'routes', 'drivers', 'vehicles', 'cancellations', 'payments'];
  if (!validTypes.includes(type)) {
    throw new AppError('Invalid export type', 400);
  }

  const dateRange = resolveDateRange(query);
  let cursor: string | undefined = undefined;
  const batchSize = 100;

  res.setHeader('Content-Type', 'text/csv');
  const filename = `${type}-report-${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  try {
    if (type === 'revenue' || type === 'payments') {
      // Stream Payments
      res.write(toCsvRow(['Payment ID', 'Booking ID', 'Amount', 'Method', 'Status', 'Date']) + '\n');
      
      while (true) {
        const batch: any[] = await prisma.payment.findMany({
          take: batchSize,
          skip: cursor ? 1 : 0,
          ...(cursor ? { cursor: { id: cursor } } : {}),
          where: dateRange ? { paymentDate: dateRange, status: 'PAID' } : { status: 'PAID' },
          orderBy: { id: 'asc' },
          include: { booking: { select: { bookingCode: true } } }
        });
        
        if (batch.length === 0) break;
        
        for (const p of batch) {
          res.write(toCsvRow([
            p.paymentCode,
            p.booking?.bookingCode,
            p.amount.toFixed(2),
            p.method,
            p.status,
            p.paymentDate.toISOString().split('T')[0] || ''
          ]) + '\n');
        }
        
        cursor = batch[batch.length - 1].id;
      }
    } else {
      // Stream Bookings based on types
      let where: Prisma.BookingWhereInput = dateRange ? { pickupDate: dateRange } : {};
      
      if (type === 'cancellations') {
        where.status = 'CANCELLED';
        res.write(toCsvRow(['Booking ID', 'Customer', 'Date', 'Reason', 'Notes', 'Fare']) + '\n');
      } else if (type === 'drivers') {
        where.driverId = { not: null };
        res.write(toCsvRow(['Driver', 'Booking ID', 'Date', 'Status', 'Fare', 'Advance']) + '\n');
      } else if (type === 'vehicles') {
        where.vehicleId = { not: null };
        res.write(toCsvRow(['Vehicle', 'Booking ID', 'Date', 'Status', 'Fare']) + '\n');
      } else if (type === 'routes') {
        res.write(toCsvRow(['Booking ID', 'Date', 'Pickup', 'Drop', 'Fare', 'Status']) + '\n');
      }

      while (true) {
        const batch: any[] = await prisma.booking.findMany({
          take: batchSize,
          skip: cursor ? 1 : 0,
          ...(cursor ? { cursor: { id: cursor } } : {}),
          where,
          orderBy: { id: 'asc' }
        });

        if (batch.length === 0) break;

        for (const b of batch) {
          if (type === 'cancellations') {
            res.write(toCsvRow([
              b.bookingCode, b.customerName, (b.pickupDate.toISOString().split('T')[0] || ''),
              b.cancellationReason, b.cancellationNotes, b.fare.toFixed(2)
            ]) + '\n');
          } else if (type === 'drivers') {
            res.write(toCsvRow([
              b.driverName, b.bookingCode, (b.pickupDate.toISOString().split('T')[0] || ''),
              b.status, b.fare.toFixed(2), b.advance.toFixed(2)
            ]) + '\n');
          } else if (type === 'vehicles') {
            res.write(toCsvRow([
              b.vehiclePlate, b.bookingCode, (b.pickupDate.toISOString().split('T')[0] || ''),
              b.status, b.fare.toFixed(2)
            ]) + '\n');
          } else if (type === 'routes') {
            res.write(toCsvRow([
              b.bookingCode, (b.pickupDate.toISOString().split('T')[0] || ''),
              b.pickupLocation, b.dropLocation, b.fare.toFixed(2), b.status
            ]) + '\n');
          }
        }

        cursor = batch[batch.length - 1].id;
      }
    }
  } catch (error) {
    // If headers are already sent, we just end the stream
    res.end();
    throw error;
  }

  res.end();
};
