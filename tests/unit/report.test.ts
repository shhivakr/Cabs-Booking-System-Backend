import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, LicenseType, VehicleCategory } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => `Bearer ${generateAccessToken(id, role)}`;
const adminId       = '10000000-0000-0000-0000-000000000002';
const accountantId  = '10000000-0000-0000-0000-000000000003';
const dispatcherId  = '10000000-0000-0000-0000-000000000004';
const custUserId    = '10000000-0000-0000-0000-000000000005';

const cleanUp = async () => {
  await prisma.timelineEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.driver.updateMany({ data: { assignedVehicleId: null } });
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
};

const seedData = async () => {
  await prisma.user.createMany({
    data: [
      { id: adminId, name: 'Admin', phone: '+910000000002', email: 'ad@rep.test', passwordHash: 'h', role: Role.ADMIN },
      { id: accountantId, name: 'Acc', phone: '+910000000003', email: 'ac@rep.test', passwordHash: 'h', role: Role.ACCOUNTANT },
      { id: dispatcherId, name: 'Disp', phone: '+910000000004', email: 'di@rep.test', passwordHash: 'h', role: Role.DISPATCHER },
      { id: custUserId, name: 'Cust', phone: '+910000000005', email: 'c@rep.test', passwordHash: 'h', role: Role.CUSTOMER },
    ]
  });

  const c = await prisma.customer.create({
    data: {
      customerCode: 'CUST-01', name: 'Cust', phone: '+910000000005', email: 'c@rep.test',
      type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE, address: 'A', city: 'C', userId: custUserId,
    }
  });

  const d = await prisma.driver.create({
    data: {
      driverCode: 'DRV-01', name: 'Driver 1', phone: '+91999', address: 'A', dob: new Date('1990-01-01'),
      licenseNumber: 'DL-01', licenseType: LicenseType.COMMERCIAL_LMV, licenseExpiry: new Date('2030-01-01'), 
      joiningDate: new Date('2024-01-01'), status: 'AVAILABLE'
    }
  });

  const v = await prisma.vehicle.create({
    data: {
      vehicleCode: 'VH-01', plateNumber: 'TS-0001', model: 'Sedan', category: VehicleCategory.SEDAN,
      year: 2024, seats: 4, luggageCapacity: 2, fuelType: 'Petrol', color: 'White',
      fitnessExpiry: new Date('2030-01-01'), insuranceExpiry: new Date('2030-01-01'),
      permitExpiry: new Date('2030-01-01'), pucExpiry: new Date('2030-01-01'), status: 'AVAILABLE'
    }
  });

  const b1 = await prisma.booking.create({
    data: {
      bookingCode: 'B-01', customerId: c.id, customerName: '=SUM(1,2)', customerPhone: c.phone, // Testing formula injection
      pickupLocation: 'A', dropLocation: 'B', pickupDate: new Date(), pickupTime: '10:00',
      tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 1000, advance: 0, remaining: 1000,
      source: 'DISPATCHER_DIRECT', status: 'COMPLETED', driverId: d.id, vehicleId: v.id,
      paymentStatus: 'PAID'
    }
  });

  const b2 = await prisma.booking.create({
    data: {
      bookingCode: 'B-02', customerId: c.id, customerName: '=SUM(1,2)', customerPhone: c.phone, 
      pickupLocation: 'C', dropLocation: 'D', pickupDate: new Date(), pickupTime: '11:00',
      tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500, advance: 0, remaining: 500,
      source: 'DISPATCHER_DIRECT', status: 'CANCELLED', driverId: d.id, vehicleId: v.id,
      cancellationReason: 'Test', cancellationNotes: 'Test notes',
      paymentStatus: 'PENDING'
    }
  });

  await prisma.payment.create({
    data: {
      paymentCode: 'P-01', bookingId: b1.id, amount: 1000, method: 'UPI', status: 'PAID',
      paymentDate: new Date()
    }
  });
  
  await prisma.payment.create({
    data: {
      paymentCode: 'P-02', bookingId: b1.id, amount: 500, method: 'CASH', status: 'REFUNDED',
      paymentDate: new Date()
    }
  });

  return { c, d, v, b1 };
};

describe('Report API', () => {
  beforeEach(async () => {
    await cleanUp();
    await seedData();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('GET /revenue returns correctly aggregated revenue and excludes REFUNDED', async () => {
    const res = await request(app)
      .get('/api/v1/reports/revenue')
      .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
    
    expect(res.status).toBe(200);
    expect(res.body.data.tripValue).toBe("1000.00"); // From booking fare
    expect(res.body.data.collectedRevenue).toBe("1000.00"); // 1000 PAID, 500 REFUNDED excluded
  });

  it('GET /routes returns route aggregation', async () => {
    const res = await request(app)
      .get('/api/v1/reports/routes')
      .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].route).toBe('A → B');
    expect(res.body.data[0].bookingCount).toBe(1);
    expect(res.body.data[0].totalFare).toBe("1000.00");
  });

  it('GET /drivers returns driver metrics', async () => {
    const res = await request(app)
      .get('/api/v1/reports/drivers')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].assignedTrips).toBe(2);
    expect(res.body.data[0].completedTrips).toBe(1);
  });

  it('GET /vehicles returns vehicle utilization', async () => {
    const res = await request(app)
      .get('/api/v1/reports/vehicles')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data[0].assignedTrips).toBe(2);
    expect(res.body.data[0].completedTrips).toBe(1);
    expect(res.body.data[0].utilizationMetric).toBe("1 completed trips");
  });

  it('GET /payments breaks down by method', async () => {
    const res = await request(app)
      .get('/api/v1/reports/payments')
      .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
    
    expect(res.status).toBe(200);
    expect(res.body.data.totalCollected).toBe("1000.00");
    const upi = res.body.data.methods.find((m: any) => m.method === 'UPI');
    expect(upi).toBeDefined();
    expect(upi.totalCollected).toBe("1000.00");
  });

  describe('CSV Export', () => {
    it('returns CSV with correct headers and escapes formulas', async () => {
      const res = await request(app)
        .get('/api/v1/reports/export?type=cancellations')
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
      
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="cancellations-report-.*\.csv"/);
      // Our seeded data has `=SUM(1,2)` as customer name, which should be escaped as `'=SUM(1,2)`
      expect(res.text).toContain(`'=SUM(1,2)`);
    });

    it('rejects invalid export type', async () => {
      const res = await request(app)
        .get('/api/v1/reports/export?type=hacks')
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
      
      expect(res.status).toBe(400);
    });
  });

  describe('Date Range Validation', () => {
    it('rejects invalid custom date range', async () => {
      const res = await request(app)
        .get('/api/v1/reports/revenue?dateRange=custom&from=2026-08-20&to=2026-08-10')
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
      
      expect(res.status).toBe(400);
      expect(res.text).toContain("cannot be after");
    });

    it('rejects custom range without from/to', async () => {
      const res = await request(app)
        .get('/api/v1/reports/revenue?dateRange=custom')
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
      
      expect(res.status).toBe(400);
      expect(res.text).toContain("required when dateRange is 'custom'");
    });
  });
});
