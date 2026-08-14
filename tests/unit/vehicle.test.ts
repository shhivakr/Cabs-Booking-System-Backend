import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { generateAccessToken } from '../../src/services/auth.service.js';
import { Role, VehicleStatus, DriverStatus } from '@prisma/client';

const getAuthHeader = (id: string, role: Role) => {
  const accessToken = generateAccessToken(id, role);
  return `Bearer ${accessToken}`;
};

const adminId = '00000000-0000-0000-0000-000000000020';
const dispatcherId = '00000000-0000-0000-0000-000000000021';
const accountantId = '00000000-0000-0000-0000-000000000022';
const customerUserId = '00000000-0000-0000-0000-000000000023';

describe('Vehicle and Maintenance APIs', () => {
  const cleanup = async () => {
    await prisma.maintenanceRecord.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.timelineEvent.deleteMany();
    await prisma.driver.updateMany({ data: { assignedVehicleId: null } });
    await prisma.vehicle.deleteMany();
    await prisma.driver.deleteMany();
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('Vehicle API', () => {
    it('should allow ADMIN to create a vehicle', async () => {
      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          plateNumber: 'TS-01-TEST-0001',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          luggageCapacity: 2,
          fuelType: 'Petrol',
          color: 'White',
          fitnessExpiry: '2027-01-01',
          insuranceExpiry: '2027-01-01',
          permitExpiry: '2027-01-01',
          pucExpiry: '2027-01-01'
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.plateNumber).toBe('TS-01-TEST-0001');
    });

    it('should reject duplicate plateNumber', async () => {
      await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0002',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          plateNumber: 'TS-01-TEST-0002',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: '2027-01-01',
          insuranceExpiry: '2027-01-01',
          permitExpiry: '2027-01-01',
          pucExpiry: '2027-01-01'
        });

      expect(res.status).toBe(400);
    });

    it('should list vehicles with pagination', async () => {
      await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0003',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .get('/api/v1/vehicles?page=1&limit=10')
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.meta).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should get vehicle by ID with assigned driver', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0004',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.id).toBe(vehicle.id);
    });

    it('should DISPATCHER update but not delete', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0005',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const patchRes = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ color: 'Red' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.color).toBe('Red');

      const deleteRes = await request(app)
        .delete(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(deleteRes.status).toBe(403);
    });

    it('should ACCOUNTANT read only', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0006',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const getRes = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT));

      expect(getRes.status).toBe(200);

      const postRes = await request(app)
        .post('/api/v1/vehicles')
        .set('Authorization', getAuthHeader(accountantId, Role.ACCOUNTANT))
        .send({
          plateNumber: 'TS-01-TEST-0007',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: '2027-01-01',
          insuranceExpiry: '2027-01-01',
          permitExpiry: '2027-01-01',
          pucExpiry: '2027-01-01'
        });

      expect(postRes.status).toBe(403);
    });

    it('should CUSTOMER have no access', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles')
        .set('Authorization', getAuthHeader(customerUserId, Role.CUSTOMER));

      expect(res.status).toBe(403);
    });

    it('should soft delete and hide from queries', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0008',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const deleteRes = await request(app)
        .delete(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      expect(deleteRes.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      expect(getRes.status).toBe(404);
    });

    it('should reject deletion of ASSIGNED vehicle', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0009',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.ASSIGNED
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T001',
          name: 'Test Driver',
          phone: '+919700000099',
          address: '1 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-001',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.ASSIGNED,
          assignedVehicleId: vehicle.id
        }
      });

      const deleteRes = await request(app)
        .delete(`/api/v1/vehicles/${vehicle.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      expect(deleteRes.status).toBe(400);
    });

    it('should search by plateNumber', async () => {
      await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0010',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .get('/api/v1/vehicles?search=TEST-0010')
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].plateNumber).toBe('TS-01-TEST-0010');
    });

    it('should filter by category', async () => {
      await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0011',
          model: 'Test SUV',
          category: 'SUV',
          year: 2024,
          seats: 6,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .get('/api/v1/vehicles?category=SUV')
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.data.some((v: any) => v.category === 'SUV')).toBe(true);
      expect(res.body.data.some((v: any) => v.category === 'SEDAN')).toBe(false);
    });

    it('should return 400 for malformed UUID', async () => {
      const res = await request(app)
        .get('/api/v1/vehicles/invalid-uuid')
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      expect(res.status).toBe(400);
    });
  });

  describe('Vehicle Assignment', () => {
    it('should assign driver to vehicle', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0012',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.AVAILABLE
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T002',
          name: 'Test Driver 2',
          phone: '+919700000100',
          address: '2 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-002',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.AVAILABLE
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: driver.id });

      expect(res.status).toBe(200);
      
      const updatedVehicle = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
      const updatedDriver = await prisma.driver.findUnique({ where: { id: driver.id } });
      
      expect(updatedVehicle?.status).toBe(VehicleStatus.ASSIGNED);
      expect(updatedDriver?.assignedVehicleId).toBe(vehicle.id);
      expect(updatedDriver?.status).toBe(DriverStatus.ASSIGNED);
    });

    it('should reject assigning already-assigned driver', async () => {
      const otherVehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0013',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.ASSIGNED
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T003',
          name: 'Test Driver 3',
          phone: '+919700000101',
          address: '3 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-003',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.ASSIGNED,
          assignedVehicleId: otherVehicle.id
        }
      });

      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0014',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.AVAILABLE
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: driver.id });

      expect(res.status).toBe(400);
    });

    it('should reject assigning inactive driver', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0015',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.AVAILABLE
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T004',
          name: 'Test Driver 4',
          phone: '+919700000102',
          address: '4 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-004',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.INACTIVE
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: driver.id });

      expect(res.status).toBe(400);
    });

    it('should reject assigning to unavailable vehicle', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0016',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.MAINTENANCE
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T005',
          name: 'Test Driver 5',
          phone: '+919700000103',
          address: '5 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-005',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.AVAILABLE
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: driver.id });

      expect(res.status).toBe(400);
    });

    it('should unassign driver', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0017',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          status: VehicleStatus.ASSIGNED
        }
      });

      const driver = await prisma.driver.create({
        data: {
          driverCode: 'DRV-T006',
          name: 'Test Driver 6',
          phone: '+919700000104',
          address: '6 Test Lane',
          dob: new Date('1990-01-01'),
          licenseNumber: 'DL-VT-006',
          licenseType: 'COMMERCIAL_LMV',
          licenseExpiry: new Date('2028-01-01'),
          joiningDate: new Date('2024-01-01'),
          status: DriverStatus.ASSIGNED,
          assignedVehicleId: vehicle.id
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/assign`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({ driverId: null });

      expect(res.status).toBe(200);

      const updatedVehicle = await prisma.vehicle.findUnique({ where: { id: vehicle.id } });
      const updatedDriver = await prisma.driver.findUnique({ where: { id: driver.id } });
      
      expect(updatedVehicle?.status).toBe(VehicleStatus.AVAILABLE);
      expect(updatedDriver?.assignedVehicleId).toBe(null);
      expect(updatedDriver?.status).toBe(DriverStatus.AVAILABLE);
    });
  });

  describe('Maintenance API', () => {
    it('should create maintenance record', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0018',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const res = await request(app)
        .post(`/api/v1/vehicles/${vehicle.id}/maintenance`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          date: '2026-06-01',
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.type).toBe('Oil Change');
    });

    it('should list maintenance records', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0019',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: new Date('2026-06-01'),
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        }
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}/maintenance`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should get single maintenance record', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0020',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const record = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: new Date('2026-06-01'),
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        }
      });

      const res = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}/maintenance/${record.id}`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(record.id);
    });

    it('should update maintenance record', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0021',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const record = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: new Date('2026-06-01'),
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        }
      });

      const res = await request(app)
        .patch(`/api/v1/vehicles/${vehicle.id}/maintenance/${record.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({ cost: 3000 });

      expect(res.status).toBe(200);
      expect(res.body.data.cost).toBe('3000');
    });

    it('should hard delete maintenance record', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0022',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const record = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: new Date('2026-06-01'),
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        }
      });

      const res = await request(app)
        .delete(`/api/v1/vehicles/${vehicle.id}/maintenance/${record.id}`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN));

      expect(res.status).toBe(204);

      const checkRecord = await prisma.maintenanceRecord.findUnique({
        where: { id: record.id }
      });
      expect(checkRecord).toBeNull();
    });

    it('should reject maintenance for deleted vehicle', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0023',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01'),
          deletedAt: new Date()
        }
      });

      const res = await request(app)
        .post(`/api/v1/vehicles/${vehicle.id}/maintenance`)
        .set('Authorization', getAuthHeader(adminId, Role.ADMIN))
        .send({
          date: '2026-06-01',
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        });

      expect(res.status).toBe(404);
    });

    it('should DISPATCHER only read maintenance', async () => {
      const vehicle = await prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', 
          plateNumber: 'TS-01-TEST-0024',
          model: 'Test Sedan',
          category: 'SEDAN',
          year: 2024,
          seats: 4,
          fitnessExpiry: new Date('2027-01-01'),
          insuranceExpiry: new Date('2027-01-01'),
          permitExpiry: new Date('2027-01-01'),
          pucExpiry: new Date('2027-01-01')
        }
      });

      const record = await prisma.maintenanceRecord.create({
        data: {
          vehicleId: vehicle.id,
          date: new Date('2026-06-01'),
          type: 'Oil Change',
          cost: 2500,
          description: 'Regular oil change',
          provider: 'Auto Shop'
        }
      });

      const getRes = await request(app)
        .get(`/api/v1/vehicles/${vehicle.id}/maintenance/${record.id}`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER));

      expect(getRes.status).toBe(200);

      const postRes = await request(app)
        .post(`/api/v1/vehicles/${vehicle.id}/maintenance`)
        .set('Authorization', getAuthHeader(dispatcherId, Role.DISPATCHER))
        .send({
          date: '2026-06-01',
          type: 'Tire Change',
          cost: 5000,
          provider: 'Auto Shop'
        });

      expect(postRes.status).toBe(403);
    });
  });
});
