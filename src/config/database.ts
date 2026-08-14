import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

config();

// Prisma v7 requires configuring the client without the url in schema.prisma.
// The connection string is managed by prisma.config.ts for the CLI,
// and we pass the connection url via an adapter for the runtime client.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in the environment.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
