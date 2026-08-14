import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => {
  const accessToken = generateAccessToken(id, role);
  return `Bearer ${accessToken}`;
};

const adminId = '00000000-0000-0000-0000-000000000010';
const dispatcherId = '00000000-0000-0000-0000-000000000011';
const accountantId = '00000000-0000-0000-0000-000000000012';
const customerUserId = '00000000-0000-0000-0000-000000000013';

const cleanUp = async () => {
  await prisma.maintenanceRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.driver.updateMany({ data: { assignedVehicleId: null } });
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
};

describe('Driver API', () => {
  beforeEach(async () => {
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('should allow ADMIN to create a driver', async () => {
    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
      .send({
        name: 'Test Driver',
        phone: '+919800000099',
        address: '1 Test St',
        dob: '1990-01-01',
        licenseNumber: 'DL-TEST-001',
        licenseType: 'COMMERCIAL_LMV',
        licenseExpiry: '2028-12-31',
        joiningDate: '2024-01-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.driverCode).toBeDefined();
    expect(res.body.data.name).toBe('Test Driver');
  });

  it('should reject duplicate phone', async () => {
    const data = {
      name: 'Test Driver 2',
      phone: '+919800000099',
      address: '1 Test St',
      dob: '1990-01-01',
      licenseNumber: 'DL-TEST-002',
      licenseType: 'COMMERCIAL_LMV',
      licenseExpiry: '2028-12-31',
      joiningDate: '2024-01-01',
    };
    await prisma.driver.create({
      data: {
        driverCode: 'DRV-12345',
        name: data.name,
        phone: data.phone,
        address: data.address,
        licenseNumber: data.licenseNumber,
        licenseType: 'COMMERCIAL_LMV',
        dob: new Date(data.dob),
        licenseExpiry: new Date(data.licenseExpiry),
        joiningDate: new Date(data.joiningDate),
      }
    });

    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
      .send({ ...data, licenseNumber: 'DL-TEST-003' });

    expect(res.status).toBe(400);
  });

  it('should reject duplicate licenseNumber', async () => {
    const data = {
      name: 'Test Driver 3',
      phone: '+919800000098',
      address: '1 Test St',
      dob: '1990-01-01',
      licenseNumber: 'DL-TEST-003',
      licenseType: 'COMMERCIAL_LMV',
      licenseExpiry: '2028-12-31',
      joiningDate: '2024-01-01',
    };
    await prisma.driver.create({
      data: {
        driverCode: 'DRV-12346',
        name: data.name,
        phone: data.phone,
        address: data.address,
        licenseNumber: data.licenseNumber,
        licenseType: 'COMMERCIAL_LMV',
        dob: new Date(data.dob),
        licenseExpiry: new Date(data.licenseExpiry),
        joiningDate: new Date(data.joiningDate),
      }
    });

    const res = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
      .send({ ...data, phone: '+919800000097' });

    expect(res.status).toBe(400);
  });

  it('should list drivers with pagination', async () => {
    await prisma.driver.createMany({
      data: [
        { driverCode: 'DRV-11111', address: 'Test Address', name: 'D1', phone: '+911111111111', licenseNumber: 'DL-1', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') },
        { driverCode: 'DRV-22222', address: 'Test Address', name: 'D2', phone: '+911111111112', licenseNumber: 'DL-2', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') },
      ],
    });

    const res = await request(app)
      .get('/api/v1/drivers?page=1&limit=10')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBe(2);
  });

  it('should get driver by ID with assigned vehicle', async () => {
    const driver = await prisma.driver.create({
      data: { driverCode: 'DRV-33333', address: 'Test Address', name: 'D3', phone: '+911111111113', licenseNumber: 'DL-3', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
    });

    const res = await request(app)
      .get(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(driver.id);
    expect(res.body.data.assignedVehicle).toBeNull();
  });

  it('should DISPATCHER update but not delete', async () => {
    const driver = await prisma.driver.create({
      data: { driverCode: 'DRV-44444', address: 'Test Address', name: 'D4', phone: '+911111111114', licenseNumber: 'DL-4', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
    });

    const patchRes = await request(app)
      .patch(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
      .send({ name: 'D4 Updated' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.name).toBe('D4 Updated');

    const deleteRes = await request(app)
      .delete(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

    expect(deleteRes.status).toBe(403);
  });

  it('should ACCOUNTANT read only', async () => {
    const driver = await prisma.driver.create({
      data: { driverCode: 'DRV-55555', address: 'Test Address', name: 'D5', phone: '+911111111115', licenseNumber: 'DL-5', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
    });

    const getRes = await request(app)
      .get(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));

    expect(getRes.status).toBe(200);

    const postRes = await request(app)
      .post('/api/v1/drivers')
      .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT))
      .send({
        name: 'D6', phone: '+911111111116', address: 'A6', dob: '1990-01-01', licenseNumber: 'DL-6', licenseType: 'COMMERCIAL_LMV', licenseExpiry: '2028-12-31', joiningDate: '2024-01-01'
      });

    expect(postRes.status).toBe(403);
  });

  it('should CUSTOMER have no access', async () => {
    const getRes = await request(app)
      .get('/api/v1/drivers')
      .set('Authorization', getAuthHeader(customerUserId, Role.CUSTOMER));

    expect(getRes.status).toBe(403);
  });

  it('should soft delete and hide from queries', async () => {
    const driver = await prisma.driver.create({
      data: { driverCode: 'DRV-77777', address: 'Test Address', name: 'D7', phone: '+911111111117', licenseNumber: 'DL-7', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
    });

    const deleteRes = await request(app)
      .delete(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(getRes.status).toBe(404);
  });

  it('should reject deletion of ASSIGNED driver', async () => {
    const vehicle = await prisma.vehicle.create({
      data: { vehicleCode: 'VH-TEST1', plateNumber: 'TEST-0001', model: 'Test Model', category: 'SEDAN', year: 2024, seats: 4, luggageCapacity: 2, fuelType: 'Petrol', color: 'White', fitnessExpiry: new Date('2027-01-01'), insuranceExpiry: new Date('2027-01-01'), permitExpiry: new Date('2027-01-01'), pucExpiry: new Date('2027-01-01') }
    });
    
    const driver = await prisma.driver.create({
      data: { driverCode: 'DRV-88888', address: 'Test Address', name: 'D8', phone: '+911111111118', licenseNumber: 'DL-8', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
    });
    
    await prisma.driver.update({
      where: { id: driver.id },
      data: { assignedVehicleId: vehicle.id, status: 'ASSIGNED' }
    });

    const deleteRes = await request(app)
      .delete(`/api/v1/drivers/${driver.id}`)
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(deleteRes.status).toBe(400);
  });

  it('should search by name', async () => {
    await prisma.driver.createMany({
      data: [
        { driverCode: 'DRV-99999', address: 'Test Address', name: 'Searchable Driver', phone: '+911111111119', licenseNumber: 'DL-9', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') },
        { driverCode: 'DRV-00000', address: 'Test Address', name: 'Another Driver', phone: '+911111111120', licenseNumber: 'DL-10', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31') }
      ],
    });

    const res = await request(app)
      .get('/api/v1/drivers?search=Searchable')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Searchable Driver');
  });

  it('should filter by status', async () => {
    await prisma.driver.createMany({
      data: [
        { driverCode: 'DRV-AAAAA', address: 'Test Address', name: 'D11', phone: '+911111111121', licenseNumber: 'DL-11', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31'), status: 'AVAILABLE' },
        { driverCode: 'DRV-BBBBB', address: 'Test Address', name: 'D12', phone: '+911111111122', licenseNumber: 'DL-12', joiningDate: new Date('2024-01-01'), dob: new Date('1990-01-01'), licenseType: 'COMMERCIAL_LMV', licenseExpiry: new Date('2028-12-31'), status: 'OFF_DUTY' }
      ],
    });

    const res = await request(app)
      .get('/api/v1/drivers?status=AVAILABLE')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('AVAILABLE');
  });

  it('should return 400 for malformed UUID', async () => {
    const res = await request(app)
      .get('/api/v1/drivers/not-a-uuid')
      .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

    expect(res.status).toBe(400);
  });
});
