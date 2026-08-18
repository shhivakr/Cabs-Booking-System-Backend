import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, LicenseType, VehicleCategory, PaymentMethod } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const getAuthHeader = (id: string, role: Role) =>
  `Bearer ${generateAccessToken(id, role)}`;

const superAdminId  = '10000000-0000-0000-0000-000000000001';
const adminId       = '10000000-0000-0000-0000-000000000002';
const accountantId  = '10000000-0000-0000-0000-000000000003';
const dispatcherId  = '10000000-0000-0000-0000-000000000004';
const custUserId1   = '10000000-0000-0000-0000-000000000005';
const custUserId2   = '10000000-0000-0000-0000-000000000006';

// ---------------------------------------------------------------------------
// Cleanup and Seed
// ---------------------------------------------------------------------------
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
      { id: superAdminId,  name: 'Super Admin', phone: '+910000000001', email: 'sa@pay.test',   passwordHash: 'h', role: Role.SUPER_ADMIN },
      { id: adminId,       name: 'Admin',       phone: '+910000000002', email: 'ad@pay.test',   passwordHash: 'h', role: Role.ADMIN },
      { id: accountantId,  name: 'Accountant',  phone: '+910000000003', email: 'ac@pay.test',   passwordHash: 'h', role: Role.ACCOUNTANT },
      { id: dispatcherId,  name: 'Dispatcher',  phone: '+910000000004', email: 'di@pay.test',   passwordHash: 'h', role: Role.DISPATCHER },
      { id: custUserId1,   name: 'Cust1',       phone: '+910000000005', email: 'c1@pay.test',   passwordHash: 'h', role: Role.CUSTOMER },
      { id: custUserId2,   name: 'Cust2',       phone: '+910000000006', email: 'c2@pay.test',   passwordHash: 'h', role: Role.CUSTOMER },
    ]
  });

  const c1 = await prisma.customer.create({
    data: {
      customerCode: 'CUST-PAY-01', name: 'Pay Customer 1',
      phone: '+910000000005', email: 'c1@pay.test',
      type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE,
      address: 'Addr', city: 'City', userId: custUserId1,
    }
  });

  const c2 = await prisma.customer.create({
    data: {
      customerCode: 'CUST-PAY-02', name: 'Pay Customer 2',
      phone: '+910000000006', email: 'c2@pay.test',
      type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE,
      address: 'Addr', city: 'City', userId: custUserId2,
    }
  });

  const driver = await prisma.driver.create({
    data: {
      driverCode: 'DRV-PAY-01', name: 'Pay Driver',
      phone: '+910000000099', address: 'Addr',
      dob: new Date('1990-01-01'),
      licenseNumber: 'DL-PAY-01', licenseType: LicenseType.COMMERCIAL_LMV,
      licenseExpiry: new Date('2030-01-01'), joiningDate: new Date('2024-01-01'),
      status: 'AVAILABLE'
    }
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleCode: 'VH-PAY-01', plateNumber: 'TS-PAY-0001',
      model: 'Sedan Pay', category: VehicleCategory.SEDAN,
      year: 2024, seats: 4, luggageCapacity: 2,
      fuelType: 'Petrol', color: 'White',
      fitnessExpiry: new Date('2030-01-01'), insuranceExpiry: new Date('2030-01-01'),
      permitExpiry: new Date('2030-01-01'), pucExpiry: new Date('2030-01-01'),
      status: 'AVAILABLE'
    }
  });

  // Helper to create a booking for c1 with given fare
  const createBooking = async (customerId: string, fare: number) => {
    return prisma.booking.create({
      data: {
        bookingCode: `PAT-TEST-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        customerId,
        customerName: 'Test Customer',
        customerPhone: '+910000000005',
        pickupLocation: 'Airport',
        dropLocation: 'Hotel',
        pickupDate: new Date('2026-12-01'),
        pickupTime: '10:00',
        tripType: 'LOCAL',
        vehicleCategory: 'SEDAN',
        fare,
        advance: 0,
        remaining: fare,
        source: 'DISPATCHER_DIRECT',
        status: 'CONFIRMED',
      }
    });
  };

  return { c1, c2, driver, vehicle, createBooking };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Payment API', () => {
  let seeded: Awaited<ReturnType<typeof seedData>>;

  beforeEach(async () => {
    await cleanUp();
    seeded = await seedData();
  });

  afterAll(async () => {
    await cleanUp();
  });

  // =========================================================================
  // RBAC — Creation
  // =========================================================================
  describe('Creation RBAC', () => {
    it('SUPER_ADMIN can create payment', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(superAdminId, Role.SUPER_ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(201);
      expect(res.body.data.paymentCode).toMatch(/^PAY-\d{4}-[A-Z0-9]{5}$/);
    });

    it('ADMIN can create payment', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(201);
    });

    it('ACCOUNTANT can create payment', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT))
        .send({ amount: '300', method: 'UPI', paymentDate: '2026-12-01', referenceNumber: 'UPI-REF-001' });
      expect(res.status).toBe(201);
      expect(res.body.data.method).toBe('UPI');
    });

    it('DISPATCHER cannot create payment → 403', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(403);
    });

    it('CUSTOMER cannot create payment → 403', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(custUserId1, Role.CUSTOMER))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Validation
  // =========================================================================
  describe('Creation Validation', () => {
    it('invalid booking UUID in param → 400', async () => {
      const res = await request(app)
        .post('/api/v1/bookings/not-a-uuid/payments')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
    });

    it('booking not found → 404', async () => {
      const res = await request(app)
        .post('/api/v1/bookings/00000000-0000-0000-0000-000000000000/payments')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(404);
    });

    it('cancelled booking → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cancelled');
    });

    it('zero amount → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '0', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
    });

    it('negative amount → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '-100', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
    });

    it('invalid method → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'BITCOIN', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
    });

    it('invalid paymentDate format → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '01-12-2026' });
      expect(res.status).toBe(400);
    });

    it('overpayment → 400', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '9999', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceeds remaining');
    });
  });

  // =========================================================================
  // Balance / Financial Integrity
  // =========================================================================
  describe('Balance Calculation', () => {
    it('partial payment → PARTIAL, correct remaining', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '300', method: 'CASH', paymentDate: '2026-12-01' });

      expect(res.status).toBe(201);
      expect(res.body.data.booking.paymentStatus).toBe('PARTIAL');
      expect(parseFloat(res.body.data.booking.remaining)).toBeCloseTo(1200, 2);
    });

    it('sequential partial payments accumulate correctly', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const base = { method: 'CASH', paymentDate: '2026-12-01' };

      // Payment 1: 300 → remaining 1200
      let res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ ...base, amount: '300' });
      expect(res.status).toBe(201);
      expect(res.body.data.booking.remaining).toBeCloseTo(1200, 0);
      expect(res.body.data.booking.paymentStatus).toBe('PARTIAL');

      // Payment 2: 700 → remaining 500
      res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ ...base, amount: '700' });
      expect(res.status).toBe(201);
      expect(res.body.data.booking.remaining).toBeCloseTo(500, 0);
      expect(res.body.data.booking.paymentStatus).toBe('PARTIAL');

      // Payment 3: 500 → remaining 0, PAID
      res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ ...base, amount: '500' });
      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.booking.remaining)).toBe(0);
      expect(res.body.data.booking.paymentStatus).toBe('PAID');
    });

    it('exact final payment → paymentStatus = PAID, remaining = 0', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '1500', method: 'CASH', paymentDate: '2026-12-01' });

      expect(res.status).toBe(201);
      expect(res.body.data.booking.paymentStatus).toBe('PAID');
      expect(parseFloat(res.body.data.booking.remaining)).toBe(0);
    });

    it('payment allowed on COMPLETED booking with remaining balance', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '1500', method: 'CASH', paymentDate: '2026-12-01' });
      expect(res.status).toBe(201);
      expect(res.body.data.booking.paymentStatus).toBe('PAID');
    });
  });

  // =========================================================================
  // Financial Reconciliation Invariant
  // =========================================================================
  describe('Financial Reconciliation', () => {
    it('booking.remaining always equals fare - sum(PAID payments)', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);

      await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '300', method: 'CASH', paymentDate: '2026-12-01' });

      await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '700', method: 'CASH', paymentDate: '2026-12-01' });

      // Read the booking directly from DB
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      const agg = await prisma.payment.aggregate({
        where: { bookingId: booking.id, status: 'PAID' },
        _sum: { amount: true }
      });

      const fare = new Prisma.Decimal(dbBooking!.fare);
      const totalPaid = agg._sum.amount ?? new Prisma.Decimal(0);
      const expectedRemaining = fare.minus(totalPaid);

      // Invariant: booking.remaining === fare - sum(PAID payments)
      expect(dbBooking!.remaining.toFixed(2)).toBe(expectedRemaining.toFixed(2));
    });
  });

  // =========================================================================
  // Timeline Event
  // =========================================================================
  describe('Timeline', () => {
    it('creates "Payment Received" timeline event after payment', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'UPI', paymentDate: '2026-12-01', referenceNumber: 'UPI123' });

      // Fetch booking with timeline
      const bookingRes = await request(app)
        .get(`/api/v1/bookings/${booking.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      const events = bookingRes.body.data.timelineEvents;
      const paymentEvent = events.find((e: any) => e.title === 'Payment Received');
      expect(paymentEvent).toBeDefined();
      expect(paymentEvent.description).toContain('500');
      expect(paymentEvent.description).toContain('UPI');
      expect(paymentEvent.description).toContain('UPI123');
      expect(paymentEvent.completed).toBe(true);
      expect(paymentEvent.current).toBe(false);  // must not alter operational status
    });
  });

  // =========================================================================
  // Retrieval RBAC
  // =========================================================================
  describe('Retrieval RBAC', () => {
    it('ADMIN can list booking payments', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });

      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.total).toBe(1);
    });

    it('DISPATCHER can list booking payments', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));
      expect(res.status).toBe(200);
    });

    it('ACCOUNTANT can list booking payments', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));
      expect(res.status).toBe(200);
    });

    it('CUSTOMER can list own booking payments', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(custUserId1, Role.CUSTOMER));
      expect(res.status).toBe(200);
    });

    it('CUSTOMER cannot list another customer booking payments → 403', async () => {
      const booking = await seeded.createBooking(seeded.c2.id, 1500);
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(custUserId1, Role.CUSTOMER));
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Customer Isolation — Get Payment by ID
  // =========================================================================
  describe('Customer Isolation — Get Payment by ID', () => {
    it('CUSTOMER can get own payment by ID', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const createRes = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      const paymentId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', getAuthHeader(custUserId1, Role.CUSTOMER));
      expect(res.status).toBe(200);
    });

    it('CUSTOMER cannot get another customer payment by ID → 403', async () => {
      const booking = await seeded.createBooking(seeded.c2.id, 1500);
      const createRes = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01' });
      const paymentId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/payments/${paymentId}`)
        .set('Authorization', getAuthHeader(custUserId1, Role.CUSTOMER));
      expect(res.status).toBe(403);
    });

    it('invalid payment UUID → 400', async () => {
      const res = await request(app)
        .get('/api/v1/payments/not-a-uuid')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect(res.status).toBe(400);
    });

    it('non-existent payment → 404', async () => {
      const res = await request(app)
        .get('/api/v1/payments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Immutability — No PATCH or DELETE
  // =========================================================================
  describe('Immutability', () => {
    it('PATCH /payments/:id does not exist → 404 or 405', async () => {
      const res = await request(app)
        .patch('/api/v1/payments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '999' });
      // Either method-not-allowed or not-found — route simply must not be defined
      expect([404, 405]).toContain(res.status);
    });

    it('DELETE /payments/:id does not exist → 404 or 405', async () => {
      const res = await request(app)
        .delete('/api/v1/payments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));
      expect([404, 405]).toContain(res.status);
    });
  });

  // =========================================================================
  // Concurrency
  // =========================================================================
  describe('Concurrency', () => {
    it('simultaneous payment requests do not exceed booking fare', async () => {
      // Booking fare = 500, both requests try to pay 400 simultaneously
      const booking = await seeded.createBooking(seeded.c1.id, 500);

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/bookings/${booking.id}/payments`)
          .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
          .send({ amount: '400', method: 'CASH', paymentDate: '2026-12-01' }),
        request(app)
          .post(`/api/v1/bookings/${booking.id}/payments`)
          .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT))
          .send({ amount: '400', method: 'UPI', paymentDate: '2026-12-01' }),
      ]);

      // One should succeed, one should fail
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toContain(201);
      expect(statuses).toContain(400);

      // Invariant: total paid must not exceed fare
      const agg = await prisma.payment.aggregate({
        where: { bookingId: booking.id, status: 'PAID' },
        _sum: { amount: true }
      });
      const totalPaid = agg._sum.amount ?? new Prisma.Decimal(0);
      expect(totalPaid.lessThanOrEqualTo(500)).toBe(true);

      // Booking remaining must be consistent
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      const expectedRemaining = new Prisma.Decimal(500).minus(totalPaid);
      expect(dbBooking!.remaining.toFixed(2)).toBe(expectedRemaining.toFixed(2));
    });
  });

  // =========================================================================
  // Response Shape
  // =========================================================================
  describe('Response Shape', () => {
    it('create payment returns expected fields', async () => {
      const booking = await seeded.createBooking(seeded.c1.id, 1500);
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/payments`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ amount: '500', method: 'CASH', paymentDate: '2026-12-01', referenceNumber: 'REF-001', notes: 'Test note' });

      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d.id).toBeDefined();
      expect(d.paymentCode).toMatch(/^PAY-\d{4}-[A-Z0-9]{5}$/);
      expect(parseFloat(d.amount)).toBe(500);
      expect(d.method).toBe('CASH');
      expect(d.status).toBe('PAID');
      expect(d.referenceNumber).toBe('REF-001');
      expect(d.notes).toBe('Test note');
      expect(d.booking).toBeDefined();
      expect(d.booking.bookingCode).toBeDefined();
      expect(d.booking.fare).toBeDefined();
      expect(parseFloat(d.booking.remaining)).toBeCloseTo(1000, 0);
      expect(d.booking.paymentStatus).toBe('PARTIAL');
    });
  });
});
