import { CustomerType, CustomerStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { generateCustomerId } from '../utils/idGenerator.js';
import { AppError } from '../utils/errors.js';

// --- Zod schemas matching requirements ---
import { z } from 'zod';

const customerBaseSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email(),
  type: z.enum(['RETAIL', 'CORPORATE']).optional().default('RETAIL'),
  companyName: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string(),
  city: z.string(),
  preferredContactMethod: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createCustomerSchema = customerBaseSchema.refine(data => {
  if (data.type === 'CORPORATE' && !data.companyName) return false;
  return true;
}, { message: "Corporate customers must have a companyName" });

export const updateCustomerSchema = customerBaseSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const customerQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  type: z.enum(['RETAIL', 'CORPORATE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  preferredContactMethod: z.string().optional().nullable(),
});

// --- Service Logic ---

export const getCustomers = async (query: z.infer<typeof customerQuerySchema>) => {
  const { page, limit, search, type, status } = query;
  
  const where: Prisma.CustomerWhereInput = {
    deletedAt: null, // Always exclude soft deleted
  };

  if (type) where.type = type;
  if (status) where.status = status;

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { customerCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.customer.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const getCustomerById = async (id: string) => {
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null }
  });

  if (!customer) {
    throw new AppError('Customer not found', 404);
  }
  return customer;
};

export const createCustomer = async (data: z.infer<typeof createCustomerSchema>) => {
  const existingPhone = await prisma.customer.findUnique({ where: { phone: data.phone } });
  if (existingPhone) throw new AppError('Phone number already exists', 400);

  const existingEmail = await prisma.customer.findUnique({ where: { email: data.email } });
  if (existingEmail) throw new AppError('Email already exists', 400);

  const customerCode = generateCustomerId();
  const dbData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

  return prisma.customer.create({
    data: {
      ...dbData,
      customerCode,
      status: CustomerStatus.ACTIVE,
    } as any
  });
};

export const updateCustomer = async (id: string, data: z.infer<typeof updateCustomerSchema>) => {
  // Ensure customer exists and is not soft deleted
  await getCustomerById(id);

  if (data.phone) {
    const existing = await prisma.customer.findFirst({ where: { phone: data.phone, id: { not: id } } });
    if (existing) throw new AppError('Phone number already exists', 400);
  }
  if (data.email) {
    const existing = await prisma.customer.findFirst({ where: { email: data.email, id: { not: id } } });
    if (existing) throw new AppError('Email already exists', 400);
  }

  const dbData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

  return prisma.customer.update({
    where: { id },
    data: dbData as any
  });
};

export const softDeleteCustomer = async (id: string) => {
  await getCustomerById(id); // Ensure exists and not already deleted

  return prisma.customer.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
};

// Self Service
export const getMyProfile = async (userId: string) => {
  const customer = await prisma.customer.findFirst({
    where: { userId, deletedAt: null }
  });

  if (!customer) {
    throw new AppError('Customer profile not found', 404);
  }
  return customer;
};

export const updateMyProfile = async (userId: string, data: z.infer<typeof updateProfileSchema>) => {
  const profile = await getMyProfile(userId);

  if (data.phone) {
    const existing = await prisma.customer.findFirst({ where: { phone: data.phone, id: { not: profile.id } } });
    if (existing) throw new AppError('Phone number already exists', 400);
  }

  const dbData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

  return prisma.customer.update({
    where: { id: profile.id },
    data: dbData as any
  });
};
