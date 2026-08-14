import crypto from "crypto";

export const generateBookingId = (): string => {
  const year = new Date().getFullYear();
  // Generate 5 random alphanumeric characters
  const random = crypto.randomBytes(3).toString("hex").substring(0, 5).toUpperCase();
  return `PAT-${year}-${random}`;
};

export const generateCustomerId = (): string => {
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `CUST-${random}`;
};

export const generateDriverId = (): string => {
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `DRV-${random}`;
};

export const generateVehicleId = (): string => {
  const random = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `VH-${random}`;
};
