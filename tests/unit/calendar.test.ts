import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, BookingStatus, LicenseType, VehicleCategory } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => `Bearer ${generateAccessToken(id, role)}`;

const adminId = '00000000-0000-0000-0000-000000000020';
const customerUserId1 = '00000000-0000-0000-0000-000000000021';
const customerUserId2 = '00000000-0000-0000-0000-000000000022';

const cleanUp = async () => {
  await prisma.timelineEvent.deleteMany();
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
      { id: adminId, name: 'Admin', phone: '+919999999999', email: 'admin2@test.com', passwordHash: 'hash', role: Role.ADMIN },
      { id: customerUserId1, name: 'Cust1', phone: '+919999999901', email: 'cust1@test.com', passwordHash: 'hash', role: Role.CUSTOMER },
      { id: customerUserId2, name: 'Cust2', phone: '+919999999902', email: 'cust2@test.com', passwordHash: 'hash', role: Role.CUSTOMER }
    ]
  });

  const c1 = await prisma.customer.create({
    data: { customerCode: 'C-01', name: 'Cust 1', phone: '+919999999901', email: 'cust1@test.com', type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE, address: 'A', city: 'C', userId: customerUserId1 }
  });

  const c2 = await prisma.customer.create({
    data: { customerCode: 'C-02', name: 'Cust 2', phone: '+919999999902', email: 'cust2@test.com', type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE, address: 'A', city: 'C', userId: customerUserId2 }
  });

  const d1 = await prisma.driver.create({
    data: { driverCode: 'D-01', name: 'Driver 1', phone: '+918888888801', address: 'A', dob: new Date('1990-01-01'), licenseNumber: 'DL-01', licenseType: LicenseType.COMMERCIAL_LMV, licenseExpiry: new Date('2030-01-01'), joiningDate: new Date('2024-01-01'), status: 'AVAILABLE' }
  });

  const v1 = await prisma.vehicle.create({
    data: { vehicleCode: 'V-01', plateNumber: 'TS-01', model: 'M', category: VehicleCategory.SEDAN, year: 2024, seats: 4, luggageCapacity: 2, fuelType: 'Petrol', color: 'White', fitnessExpiry: new Date('2030-01-01'), insuranceExpiry: new Date('2030-01-01'), permitExpiry: new Date('2030-01-01'), pucExpiry: new Date('2030-01-01'), status: 'AVAILABLE' }
  });

  return { c1, c2, d1, v1 };
};

describe('Calendar API', () => {
  let seeded: any;
  let b1: any, b2: any, b3: any;

  beforeAll(async () => {
    await cleanUp();
    seeded = await seedData();

    // Create bookings directly
    b1 = await prisma.booking.create({
      data: {
        bookingCode: 'B-01', customerId: seeded.c1.id, customerName: seeded.c1.name, customerPhone: seeded.c1.phone, pickupLocation: 'A', dropLocation: 'B',
        pickupDate: new Date('2026-10-01T00:00:00.000Z'), pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN',
        fare: 500, advance: 0, remaining: 500, source: 'CUSTOMER_PORTAL', status: 'NEW'
      }
    });

    b2 = await prisma.booking.create({
      data: {
        bookingCode: 'B-02', customerId: seeded.c2.id, customerName: seeded.c2.name, customerPhone: seeded.c2.phone, pickupLocation: 'C', dropLocation: 'D',
        pickupDate: new Date('2026-10-02T00:00:00.000Z'), pickupTime: '11:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN',
        fare: 500, advance: 0, remaining: 500, source: 'CUSTOMER_PORTAL', status: 'CONFIRMED',
        driverId: seeded.d1.id, vehicleId: seeded.v1.id
      }
    });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('GET /api/v1/calendar allows ADMIN to view all', async () => {
    const res = await request(app)
      .get('/api/v1/calendar')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/v1/calendar restricts CUSTOMER to own bookings', async () => {
    const res = await request(app)
      .get('/api/v1/calendar')
      .set('Authorization', getAuthHeader(customerUserId1, Role.CUSTOMER));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(b1.id);
  });

  it('GET /api/v1/calendar filters by date range (custom)', async () => {
    const res = await request(app)
      .get('/api/v1/calendar?from=2026-10-01&to=2026-10-01')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(b1.id); // Only B-01 is on 10-01
  });

  it('GET /api/v1/calendar filters by driverId', async () => {
    const res = await request(app)
      .get(`/api/v1/calendar?driverId=${seeded.d1.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(b2.id); // B-02 has d1 assigned
  });

  it('GET /api/v1/calendar filters by vehicleId', async () => {
    const res = await request(app)
      .get(`/api/v1/calendar?vehicleId=${seeded.v1.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(b2.id); 
  });

  it('GET /api/v1/calendar returns 400 for invalid driverId', async () => {
    const res = await request(app)
      .get(`/api/v1/calendar?driverId=invalid`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
    expect(res.status).toBe(400);
  });
});
