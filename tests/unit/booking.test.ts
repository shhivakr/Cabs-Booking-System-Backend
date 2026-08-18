import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, BookingStatus, LicenseType, VehicleCategory } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => {
  const accessToken = generateAccessToken(id, role);
  return `Bearer ${accessToken}`;
};

const adminId = '00000000-0000-0000-0000-000000000010';
const dispatcherId = '00000000-0000-0000-0000-000000000011';
const accountantId = '00000000-0000-0000-0000-000000000012';
const customerUserId1 = '00000000-0000-0000-0000-000000000013';
const customerUserId2 = '00000000-0000-0000-0000-000000000014';

const cleanUp = async () => {
  await prisma.timelineEvent.deleteMany();
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
      { id: customerUserId1, name: 'Cust1', phone: '+919999999901', email: 'cust1@test.com', passwordHash: 'hash', role: Role.CUSTOMER },
      { id: customerUserId2, name: 'Cust2', phone: '+919999999902', email: 'cust2@test.com', passwordHash: 'hash', role: Role.CUSTOMER }
    ]
  });

  const c1 = await prisma.customer.create({
    data: {
      customerCode: 'CUST-TEST-01',
      name: 'Test Customer 1',
      phone: '+919999999901',
      email: 'cust1@test.com',
      type: CustomerType.RETAIL,
      status: CustomerStatus.ACTIVE,
      address: 'Test Address',
      city: 'Test City',
      userId: customerUserId1,
    }
  });

  const c2 = await prisma.customer.create({
    data: {
      customerCode: 'CUST-TEST-02',
      name: 'Test Customer 2',
      phone: '+919999999902',
      email: 'cust2@test.com',
      type: CustomerType.RETAIL,
      status: CustomerStatus.ACTIVE,
      address: 'Test Address',
      city: 'Test City',
      userId: customerUserId2,
    }
  });

  const d1 = await prisma.driver.create({
    data: {
      driverCode: 'DRV-TEST-01',
      name: 'Test Driver 1',
      phone: '+918888888801',
      address: 'Driver Address',
      dob: new Date('1990-01-01'),
      licenseNumber: 'DL-01',
      licenseType: LicenseType.COMMERCIAL_LMV,
      licenseExpiry: new Date('2030-01-01'),
      joiningDate: new Date('2024-01-01'),
      status: 'AVAILABLE'
    }
  });

  const v1 = await prisma.vehicle.create({
    data: {
      vehicleCode: 'VH-TEST-01',
      plateNumber: 'TS-01-TEST-01',
      model: 'Sedan Model',
      category: VehicleCategory.SEDAN,
      year: 2024,
      seats: 4,
      luggageCapacity: 2,
      fuelType: 'Petrol',
      color: 'White',
      fitnessExpiry: new Date('2030-01-01'),
      insuranceExpiry: new Date('2030-01-01'),
      permitExpiry: new Date('2030-01-01'),
      pucExpiry: new Date('2030-01-01'),
      status: 'AVAILABLE'
    }
  });

  return { c1, c2, d1, v1 };
};

describe('Booking API', () => {
  let seeded: any;

  beforeEach(async () => {
    await cleanUp();
    seeded = await seedData();
  });

  afterAll(async () => {
    await cleanUp();
  });

  describe('Creation', () => {
    it('should allow ADMIN to create booking', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          customerId: seeded.c1.id,
          pickupLocation: 'Airport',
          dropLocation: 'Hotel',
          pickupDate: '2026-12-01',
          pickupTime: '10:00',
          tripType: 'AIRPORT',
          vehicleCategory: 'SEDAN',
          source: 'PHONE_RESERVATION',
          fare: 1500,
          advance: 500
        });

      expect(res.status).toBe(201);
      expect(res.body.data.bookingCode).toBeDefined();
      expect(res.body.data.status).toBe('NEW');
      expect(res.body.data.remaining).toBe('1000'); // 1500 - 500
    });

    it('should allow CUSTOMER to create their own booking', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', getAuthHeader(customerUserId1, Role.CUSTOMER))
        .send({
          pickupLocation: 'Home',
          dropLocation: 'Office',
          pickupDate: '2026-12-01',
          pickupTime: '09:00',
          tripType: 'LOCAL',
          vehicleCategory: 'SEDAN',
          fare: 500
        });

      expect(res.status).toBe(201);
      expect(res.body.data.customerId).toBe(seeded.c1.id);
    });

    it('should reject advance > fare', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          customerId: seeded.c1.id,
          pickupLocation: 'A', dropLocation: 'B', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN',
          fare: 500, advance: 600
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Retrieval & RBAC', () => {
    let b1: any, b2: any;
    
    beforeEach(async () => {
      const r1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c1.id, pickupLocation: 'Airport', dropLocation: 'Hotel', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
      });
      if (r1.status !== 201) console.error("R1 FAILED:", r1.body);
      b1 = r1.body.data;

      const r2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c2.id, pickupLocation: 'Station', dropLocation: 'Mall', pickupDate: '2026-12-02', pickupTime: '11:00', tripType: 'LOCAL', vehicleCategory: 'SUV', fare: 800
      });
      if (r2.status !== 201) console.error("R2 FAILED:", r2.body);
      b2 = r2.body.data;
    });

    it('should list all for ADMIN', async () => {
      const res = await request(app).get('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should list only own for CUSTOMER', async () => {
      const res = await request(app).get('/api/v1/bookings').set('Authorization', getAuthHeader(customerUserId1, Role.CUSTOMER));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(b1.id);
    });

    it('should block CUSTOMER from viewing another customer booking', async () => {
      const res = await request(app).get(`/api/v1/bookings/${b2.id}`).set('Authorization', getAuthHeader(customerUserId1, Role.CUSTOMER));
      expect(res.status).toBe(403);
    });
  });

  describe('Assignment', () => {
    let bookingId: string;
    
    beforeEach(async () => {
      const res = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c1.id, pickupLocation: 'Airport', dropLocation: 'Hotel', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
      });
      if (res.status !== 201) console.error("Assignment BEFORE FAILED:", res.body);
      bookingId = res.body.data?.id;
    });

    it('should successfully assign driver and vehicle', async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DRIVER_ASSIGNED');
      
      const driver = await prisma.driver.findUnique({ where: { id: seeded.d1.id } });
      const vehicle = await prisma.vehicle.findUnique({ where: { id: seeded.v1.id } });
      expect(driver?.status).toBe('ASSIGNED');
      expect(vehicle?.status).toBe('ASSIGNED');

      // Check Timeline Event generated
      const timeline = await prisma.timelineEvent.findMany({ where: { bookingId } });
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.some(t => t.title === 'Driver & Vehicle Assigned')).toBe(true);
    });

    it('should reject assignment to already assigned driver', async () => {
      // First assignment
      await request(app).post(`/api/v1/bookings/${bookingId}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

      // Create another booking
      const b2 = (await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c2.id, pickupLocation: 'Airport', dropLocation: 'Hotel', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
      })).body.data;

      // Attempt to steal driver
      const res = await request(app)
        .post(`/api/v1/bookings/${b2.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

      expect(res.status).toBe(409);
    });
  });

  describe('State Machine & Cancellation', () => {
    let bookingId: string;
    
    beforeEach(async () => {
      const res = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c1.id, pickupLocation: 'Airport', dropLocation: 'Hotel', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
      });
      bookingId = res.body.data.id;
    });

    it('should allow valid status transitions', async () => {
      const res = await request(app).post(`/api/v1/bookings/${bookingId}/status`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ status: 'CONFIRMED' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('should reject invalid status transitions', async () => {
      const res = await request(app).post(`/api/v1/bookings/${bookingId}/status`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ status: 'ON_TRIP' }); // NEW -> ON_TRIP is invalid
      expect(res.status).toBe(409);
    });

    it('should successfully cancel booking and release driver', async () => {
      await request(app).post(`/api/v1/bookings/${bookingId}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

      const res = await request(app).post(`/api/v1/bookings/${bookingId}/cancel`).set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ cancellationReason: 'Customer requested' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      const driver = await prisma.driver.findUnique({ where: { id: seeded.d1.id } });
      const vehicle = await prisma.vehicle.findUnique({ where: { id: seeded.v1.id } });
      expect(driver?.status).toBe('AVAILABLE');
      expect(vehicle?.status).toBe('AVAILABLE');
    });
  });

  describe('Completion', () => {
    let bookingId: string;
    
    beforeEach(async () => {
      const res = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
        customerId: seeded.c1.id, pickupLocation: 'Airport', dropLocation: 'Hotel', pickupDate: '2026-12-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
      });
      bookingId = res.body.data.id;
      await request(app).post(`/api/v1/bookings/${bookingId}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER)).send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });
      await request(app).post(`/api/v1/bookings/${bookingId}/status`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER)).send({ status: 'DRIVER_ARRIVED' });
      await request(app).post(`/api/v1/bookings/${bookingId}/status`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER)).send({ status: 'ON_TRIP' });
    });

    it('should complete booking and update driver/customer stats', async () => {
      const res = await request(app).post(`/api/v1/bookings/${bookingId}/status`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ status: 'COMPLETED' });
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');

      const driver = await prisma.driver.findUnique({ where: { id: seeded.d1.id } });
      expect(driver?.status).toBe('AVAILABLE');
      expect(driver?.tripsCompleted).toBe(1);

      const customer = await prisma.customer.findUnique({ where: { id: seeded.c1.id } });
      expect(customer?.totalTrips).toBe(1);
    });
  });

  describe('Validation', () => {
    it('should return 400 for malformed UUID', async () => {
      const res = await request(app).get('/api/v1/bookings/invalid-uuid-format').set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect(res.status).toBe(400);
    });
  });
});
