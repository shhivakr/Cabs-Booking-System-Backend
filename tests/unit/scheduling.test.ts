import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, CustomerType, CustomerStatus, LicenseType, VehicleCategory } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => `Bearer ${generateAccessToken(id, role)}`;

const adminId = '00000000-0000-0000-0000-000000000030';
const customerUserId1 = '00000000-0000-0000-0000-000000000031';
const dispatcherId = '00000000-0000-0000-0000-000000000032';

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
      { id: adminId, name: 'Admin', phone: '+919999999999', email: 'admin3@test.com', passwordHash: 'hash', role: Role.ADMIN },
      { id: dispatcherId, name: 'Disp', phone: '+919999999998', email: 'disp@test.com', passwordHash: 'hash', role: Role.DISPATCHER },
      { id: customerUserId1, name: 'Cust1', phone: '+919999999901', email: 'cust1@test.com', passwordHash: 'hash', role: Role.CUSTOMER }
    ]
  });

  const c1 = await prisma.customer.create({
    data: { customerCode: 'C-01', name: 'Cust 1', phone: '+919999999901', email: 'cust1@test.com', type: CustomerType.RETAIL, status: CustomerStatus.ACTIVE, address: 'A', city: 'C', userId: customerUserId1 }
  });

  const d1 = await prisma.driver.create({
    data: { driverCode: 'D-01', name: 'Driver 1', phone: '+918888888801', address: 'A', dob: new Date('1990-01-01'), licenseNumber: 'DL-01', licenseType: LicenseType.COMMERCIAL_LMV, licenseExpiry: new Date('2030-01-01'), joiningDate: new Date('2024-01-01'), status: 'AVAILABLE' }
  });

  const v1 = await prisma.vehicle.create({
    data: { vehicleCode: 'V-01', plateNumber: 'TS-01', model: 'M', category: VehicleCategory.SEDAN, year: 2024, seats: 4, luggageCapacity: 2, fuelType: 'Petrol', color: 'White', fitnessExpiry: new Date('2030-01-01'), insuranceExpiry: new Date('2030-01-01'), permitExpiry: new Date('2030-01-01'), pucExpiry: new Date('2030-01-01'), status: 'AVAILABLE' }
  });

  return { c1, d1, v1 };
};

describe('Scheduling Conflicts', () => {
  let seeded: any;

  beforeEach(async () => {
    await cleanUp();
    seeded = await seedData();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('allows same driver different time on same date', async () => {
    const res1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b1 = res1.body.data;
    
    // Assign b1
    await request(app).post(`/api/v1/bookings/${b1.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    // Create b2 same day, different time
    const res2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '15:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b2 = res2.body.data;

    // Assign b2 to same driver/vehicle
    const assignRes = await request(app).post(`/api/v1/bookings/${b2.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    expect(assignRes.status).toBe(200); // Should be allowed
  });

  it('rejects same driver same date same time (409 Conflict)', async () => {
    const res1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b1 = res1.body.data;
    
    // Assign b1
    await request(app).post(`/api/v1/bookings/${b1.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    // Create b2 same day, same time
    const res2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b2 = res2.body.data;

    // Assign b2 to same driver/vehicle
    const assignRes = await request(app).post(`/api/v1/bookings/${b2.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    expect(assignRes.status).toBe(409); 
    expect(assignRes.body.message).toMatch(/already assigned/);
  });

  it('allows same driver same time different date', async () => {
    const res1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b1 = res1.body.data;
    
    await request(app).post(`/api/v1/bookings/${b1.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    // Create b2 different day, same time
    const res2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-02', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b2 = res2.body.data;

    const assignRes = await request(app).post(`/api/v1/bookings/${b2.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    expect(assignRes.status).toBe(200); 
  });

  it('does not block availability if blocking booking is cancelled', async () => {
    const res1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b1 = res1.body.data;
    
    await request(app).post(`/api/v1/bookings/${b1.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    // Cancel b1
    await request(app).post(`/api/v1/bookings/${b1.id}/cancel`).set('Authorization', getAuthHeader(adminId, Role.ADMIN))
      .send({ cancellationReason: 'Test' });

    // Create b2 same day, same time
    const res2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b2 = res2.body.data;

    // Should succeed because b1 is cancelled
    const assignRes = await request(app).post(`/api/v1/bookings/${b2.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    expect(assignRes.status).toBe(200); 
  });

  it('prevents concurrent double assignment to same resource', async () => {
    // Create two bookings at same date/time
    const res1 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b1 = res1.body.data;
    const res2 = await request(app).post('/api/v1/bookings').set('Authorization', getAuthHeader(adminId, Role.ADMIN)).send({
      customerId: seeded.c1.id, pickupLocation: 'LocA', dropLocation: 'LocB', pickupDate: '2026-10-01', pickupTime: '10:00', tripType: 'LOCAL', vehicleCategory: 'SEDAN', fare: 500
    });
    const b2 = res2.body.data;

    // Try concurrent assignment
    const p1 = request(app).post(`/api/v1/bookings/${b1.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });
    const p2 = request(app).post(`/api/v1/bookings/${b2.id}/assign`).set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ driverId: seeded.d1.id, vehicleId: seeded.v1.id });

    const [a1, a2] = await Promise.all([p1, p2]);

    // One must succeed (200), one must fail (409)
    const statuses = [a1.status, a2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Verify invariant in db
    const driver = await prisma.driver.findUnique({ where: { id: seeded.d1.id } });
    expect(driver?.status).toBe('ASSIGNED');
    
    // Exactly one booking should have driver assigned
    const assignedBookings = await prisma.booking.findMany({
      where: { driverId: seeded.d1.id }
    });
    expect(assignedBookings.length).toBe(1);
  });
});
