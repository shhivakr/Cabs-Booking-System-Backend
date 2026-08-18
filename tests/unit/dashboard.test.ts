import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, LicenseType, VehicleCategory, PaymentMethod } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => `Bearer ${generateAccessToken(id, role)}`;
const adminId       = '10000000-0000-0000-0000-000000000002';
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
      { id: adminId, name: 'Admin', phone: '+910000000002', email: 'ad@dash.test', passwordHash: 'h', role: Role.ADMIN },
      { id: custUserId, name: 'Cust', phone: '+910000000005', email: 'c@dash.test', passwordHash: 'h', role: Role.CUSTOMER },
    ]
  });

  const c = await prisma.customer.create({
    data: {
      customerCode: 'CUST-01', name: 'Cust', phone: '+910000000005', email: 'c@dash.test',
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
      bookingCode: 'B-01', customerId: c.id, customerName: c.name, customerPhone: c.phone,
      pickupLocation: 'A', dropLocation: 'B', pickupDate: new Date(), pickupTime: '10:00',
      tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 1000, advance: 0, remaining: 1000,
      source: 'DISPATCHER_DIRECT', status: 'COMPLETED', driverId: d.id, vehicleId: v.id,
      paymentStatus: 'PAID'
    }
  });

  await prisma.payment.create({
    data: {
      paymentCode: 'P-01', bookingId: b1.id, amount: 1000, method: 'UPI', status: 'PAID',
      paymentDate: new Date()
    }
  });

  const b2 = await prisma.booking.create({
    data: {
      bookingCode: 'B-02', customerId: c.id, customerName: c.name, customerPhone: c.phone,
      pickupLocation: 'C', dropLocation: 'D', pickupDate: new Date(), pickupTime: '11:00',
      tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500, advance: 0, remaining: 500,
      source: 'DISPATCHER_DIRECT', status: 'NEW', paymentStatus: 'PENDING'
    }
  });

  return { c, d, v, b1, b2 };
};

describe('Dashboard API', () => {
  beforeEach(async () => {
    await cleanUp();
    await seedData();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('RBAC: CUSTOMER cannot access dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', getAuthHeader(custUserId, Role.CUSTOMER));
    expect(res.status).toBe(403);
  });

  it('GET /stats returns correct aggregated KPIs', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats?dateRange=today')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.bookings.total).toBe(2);
    expect(res.body.data.bookings.completed).toBe(1);
    expect(res.body.data.bookings.pending).toBe(1);
    // 1000 + 500 = 1500 fare total
    expect(res.body.data.tripValue).toBe("1500.00");
    // Only 1 payment of 1000 collected
    expect(res.body.data.collectedRevenue).toBe("1000.00");
  });

  it('GET /revenue returns chart data', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0].tripValue).toBe("1500.00");
      expect(res.body.data[0].collectedRevenue).toBe("1000.00");
    }
  });

  it('GET /status-breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/status-breakdown')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.COMPLETED).toBe(1);
    expect(res.body.data.NEW).toBe(1);
  });

  it('GET /unassigned returns unassigned bookings', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/unassigned')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1); // b2
    expect(res.body.data[0].bookingCode).toBe('B-02');
  });

  it('GET /upcoming-trips returns scheduled bookings', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/upcoming-trips')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1); // b2
    expect(res.body.data[0].bookingCode).toBe('B-02');
  });

  it('GET /fleet-summary', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/fleet-summary')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.AVAILABLE).toBe(1);
  });

  it('GET /driver-summary', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/driver-summary')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.AVAILABLE).toBe(1);
  });
});
