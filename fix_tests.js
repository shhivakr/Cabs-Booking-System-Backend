import fs from 'fs';
import path from 'path';

function fixVehicleTests() {
  const file = path.join(process.cwd(), 'tests/unit/vehicle.test.ts');
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace all prisma.vehicle.create({ data: { ... } }) by injecting missing fields after "data: {"
  content = content.replace(/prisma\.vehicle\.create\(\{\s*data:\s*\{/g, 
    "prisma.vehicle.create({ data: { vehicleCode: 'VH-' + Math.random().toString(36).substring(7).toUpperCase(), luggageCapacity: 2, fuelType: 'Petrol', color: 'White', "
  );

  fs.writeFileSync(file, content);
  console.log('Fixed vehicle.test.ts');
}

function fixDriverTests() {
  const file = path.join(process.cwd(), 'tests/unit/driver.test.ts');
  let content = fs.readFileSync(file, 'utf8');
  
  // Inject driverCode and address where missing
  content = content.replace(/prisma\.driver\.create\(\{\s*data:\s*\{/g, 
    "prisma.driver.create({ data: { driverCode: 'DRV-' + Math.random().toString(36).substring(7).toUpperCase(), address: 'Test Address', "
  );

  content = content.replace(/prisma\.driver\.createMany\(\{\s*data:\s*\[\s*\{/g, 
    "prisma.driver.createMany({ data: [{ driverCode: 'DRV-' + Math.random().toString(36).substring(7).toUpperCase(), address: 'Test Address', "
  );
  
  content = content.replace(/\},\s*\{/g, 
    "}, { driverCode: 'DRV-' + Math.random().toString(36).substring(7).toUpperCase(), address: 'Test Address', "
  );

  fs.writeFileSync(file, content);
  console.log('Fixed driver.test.ts');
}

fixVehicleTests();
fixDriverTests();
