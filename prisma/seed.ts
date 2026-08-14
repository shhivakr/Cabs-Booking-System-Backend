import { CustomerType, LicenseType, VehicleCategory, TripType, PaymentStatus, BookingStatus, BookingSource, Role } from '@prisma/client';
import bcrypt from "bcrypt";
import { env } from "../src/config/env.js";
import { generateBookingId, generateCustomerId, generateDriverId, generateVehicleId } from '../src/utils/idGenerator.js';
import { prisma } from "../src/config/database.js";

async function main() {
  console.log('Clearing database...');
  await prisma.timelineEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding initial admin user...');
  const adminPasswordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, env.BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { email: env.SUPER_ADMIN_EMAIL },
    update: {
      passwordHash: adminPasswordHash,
      role: Role.SUPER_ADMIN,
    },
    create: {
      name: "Super Admin",
      email: env.SUPER_ADMIN_EMAIL,
      phone: "+919876543210",
      passwordHash: adminPasswordHash,
      role: Role.SUPER_ADMIN,
    }
  });

  console.log('Seeding customers...');
  const customers = [];
  for (let i = 1; i <= 22; i++) {
    const isCorporate = i % 5 === 0;
    customers.push(await prisma.customer.create({
      data: {
        customerCode: `CUST-100${i}`, // Deterministic code
        name: `Customer ${i}`,
        phone: `+9198000000${i.toString().padStart(2, '0')}`,
        email: `customer${i}@example.com`,
        type: isCorporate ? CustomerType.CORPORATE : CustomerType.RETAIL,
        companyName: isCorporate ? `Company ${i}` : null,
        address: `${i} Main St`,
        city: "Patna",
      }
    }));
  }

  console.log('Seeding drivers...');
  const drivers = [];
  for (let i = 1; i <= 12; i++) {
    drivers.push(await prisma.driver.create({
      data: {
        driverCode: `DRV-200${i}`,
        name: `Driver ${i}`,
        phone: `+9197000000${i.toString().padStart(2, '0')}`,
        address: `${i} Driver Lane, Patna`,
        dob: new Date(1990 - (i % 10), i % 12, i),
        licenseNumber: `DL-10-${i}0000`,
        licenseType: LicenseType.COMMERCIAL_LMV,
        licenseExpiry: new Date(2028, i % 12, i),
        joiningDate: new Date(2022, i % 12, i),
        rating: 4 + (i % 10) / 10,
        tripsCompleted: i * 50,
      }
    }));
  }

  console.log('Seeding vehicles...');
  const categories = [VehicleCategory.SEDAN, VehicleCategory.SUV, VehicleCategory.INNOVA, VehicleCategory.TEMPO_TRAVELLER, VehicleCategory.PREMIUM];
  const vehicles = [];
  for (let i = 1; i <= 12; i++) {
    const category = categories[i % categories.length]!;
    vehicles.push(await prisma.vehicle.create({
      data: {
        vehicleCode: `VH-300${i}`,
        plateNumber: `BR01-XY-${i.toString().padStart(4, '0')}`,
        model: `Model ${i}`,
        category: category,
        year: 2020 + (i % 4),
        seats: category === VehicleCategory.INNOVA ? 6 : category === VehicleCategory.TEMPO_TRAVELLER ? 12 : 4,
        luggageCapacity: 2,
        fuelType: "Diesel",
        color: "White",
        fitnessExpiry: new Date(2027, 0, 1),
        insuranceExpiry: new Date(2027, 0, 1),
        permitExpiry: new Date(2027, 0, 1),
        pucExpiry: new Date(2027, 0, 1),
      }
    }));
  }

  console.log('Assigning drivers to vehicles...');
  for (let i = 0; i < 12; i++) {
    await prisma.driver.update({
      where: { id: drivers[i]!.id },
      data: { assignedVehicleId: vehicles[i]!.id }
    });
  }

  console.log('Seeding bookings...');
  for (let i = 1; i <= 48; i++) {
    const customer = customers[i % 22]!;
    const driver = drivers[i % 12]!;
    const vehicle = vehicles[i % 12]!;
    
    await prisma.booking.create({
      data: {
        bookingCode: `PAT-2026-${i.toString().padStart(5, '0')}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerType: customer.type,
        customerCity: customer.city,
        pickupLocation: `Pickup ${i}, Patna`,
        dropLocation: `Drop ${i}, Patna`,
        pickupDate: new Date(),
        pickupTime: "10:00",
        tripType: TripType.LOCAL,
        vehicleCategory: vehicle.category,
        fare: 1500.00,
        advance: 500.00,
        remaining: 1000.00,
        paymentStatus: PaymentStatus.PARTIAL,
        status: BookingStatus.COMPLETED,
        source: BookingSource.CUSTOMER_PORTAL,
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plateNumber,
        vehicleModel: vehicle.model,
      }
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
