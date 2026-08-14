import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { generateCustomerId } from "../../src/utils/idGenerator.js";
import { generateAccessToken } from "../../src/services/auth.service.js";
import { Role } from "@prisma/client";

// Setup auth headers for testing
const getAuthHeader = (id: string, role: Role) => {
  const accessToken = generateAccessToken(id, role);
  return `Bearer ${accessToken}`;
};

describe("Customer API", () => {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const dispatcherId = "00000000-0000-0000-0000-000000000002";
  const accountantId = "00000000-0000-0000-0000-000000000003";
  const customerUserId = "00000000-0000-0000-0000-000000000004";

  let createdCustomerId: string;

  beforeEach(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany({ where: { id: customerUserId } });

    // Create a mock user for the customer portal
    await prisma.user.create({
      data: {
        id: customerUserId,
        name: "Test Customer Login",
        email: "login@customer.local",
        phone: "0000000000",
        passwordHash: "dummy",
        role: "CUSTOMER",
      }
    });

    const cust = await prisma.customer.create({
      data: {
        customerCode: generateCustomerId(),
        name: "Alice Retail",
        phone: "1111111111",
        email: "alice@retail.local",
        type: "RETAIL",
        status: "ACTIVE",
        address: "123 Street",
        city: "Testville",
        userId: customerUserId,
      }
    });
    createdCustomerId = cust.id;
  });

  afterAll(async () => {
    await prisma.timelineEvent.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany({ where: { id: customerUserId } });
  });

  describe("Admin Endpoints (/api/v1/customers)", () => {
    
    it("should allow ADMIN to create a customer", async () => {
      const res = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", getAuthHeader(adminId, "ADMIN"))
        .send({
          name: "Bob Corp",
          phone: "2222222222",
          email: "bob@corp.local",
          type: "CORPORATE",
          companyName: "Bob LLC",
          address: "456 Ave",
          city: "Metropolis"
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("customerCode");
      expect(res.body.data.name).toBe("Bob Corp");
    });

    it("should reject CORPORATE customer without companyName", async () => {
      const res = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", getAuthHeader(adminId, "ADMIN"))
        .send({
          name: "Invalid Corp",
          phone: "3333333333",
          email: "invalid@corp.local",
          type: "CORPORATE",
          address: "111 St",
          city: "City"
        });
      expect(res.status).toBe(400); // Validation failure
    });

    it("should reject duplicate email or phone", async () => {
      const res = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", getAuthHeader(adminId, "ADMIN"))
        .send({
          name: "Duplicate Phone",
          phone: "1111111111", // Alice's phone
          email: "unique@test.local",
          address: "123 St",
          city: "City"
        });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Phone number already exists");
    });

    it("should allow DISPATCHER to update, but not delete", async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/customers/${createdCustomerId}`)
        .set("Authorization", getAuthHeader(dispatcherId, "DISPATCHER"))
        .send({ name: "Alice Updated" });
      
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.name).toBe("Alice Updated");

      const delRes = await request(app)
        .delete(`/api/v1/customers/${createdCustomerId}`)
        .set("Authorization", getAuthHeader(dispatcherId, "DISPATCHER"));
      
      expect(delRes.status).toBe(403);
    });

    it("should allow ACCOUNTANT to read only", async () => {
      const getRes = await request(app)
        .get(`/api/v1/customers`)
        .set("Authorization", getAuthHeader(accountantId, "ACCOUNTANT"));
      expect(getRes.status).toBe(200);

      const postRes = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", getAuthHeader(accountantId, "ACCOUNTANT"))
        .send({ name: "Fail", phone: "999", email: "f@f.com", address: "1", city: "1" });
      expect(postRes.status).toBe(403);
    });

    it("should soft delete customer and hide from normal queries", async () => {
      const delRes = await request(app)
        .delete(`/api/v1/customers/${createdCustomerId}`)
        .set("Authorization", getAuthHeader(adminId, "ADMIN"));
      expect(delRes.status).toBe(204);

      // Fetch list should be empty
      const getRes = await request(app)
        .get(`/api/v1/customers`)
        .set("Authorization", getAuthHeader(adminId, "ADMIN"));
      expect(getRes.body.data.length).toBe(0);

      // Fetch by ID should 404
      const idRes = await request(app)
        .get(`/api/v1/customers/${createdCustomerId}`)
        .set("Authorization", getAuthHeader(adminId, "ADMIN"));
      expect(idRes.status).toBe(404);
    });

    it("should support search and pagination", async () => {
      const res = await request(app)
        .get(`/api/v1/customers?search=Alice&page=1&limit=5`)
        .set("Authorization", getAuthHeader(adminId, "ADMIN"));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.total).toBe(1);
    });

  });

  describe("Customer Portal Endpoints (/api/v1/customers/me/profile)", () => {

    it("should allow CUSTOMER to fetch own profile", async () => {
      const res = await request(app)
        .get("/api/v1/customers/me/profile")
        .set("Authorization", getAuthHeader(customerUserId, "CUSTOMER"));
      
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Alice Retail");
    });

    it("should allow CUSTOMER to update allowed fields", async () => {
      const res = await request(app)
        .patch("/api/v1/customers/me/profile")
        .set("Authorization", getAuthHeader(customerUserId, "CUSTOMER"))
        .send({
          address: "456 New Home",
          status: "INACTIVE", // Status should be stripped by Zod (it's not in updateProfileSchema)
          lifetimeSpend: 9999 // Stripped
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.address).toBe("456 New Home");
      expect(res.body.data.status).toBe("ACTIVE");
      expect(res.body.data.lifetimeSpend).toBe("0"); // Not updated
    });

    it("should block CUSTOMER from accessing admin endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", getAuthHeader(customerUserId, "CUSTOMER"));
      expect(res.status).toBe(403);

      const res2 = await request(app)
        .get(`/api/v1/customers/${createdCustomerId}`)
        .set("Authorization", getAuthHeader(customerUserId, "CUSTOMER"));
      expect(res2.status).toBe(403);
    });

  });
});
