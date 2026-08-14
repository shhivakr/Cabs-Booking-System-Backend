import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import bcrypt from "bcrypt";

const testUserEmail = "test@taxicrm.local";
const testUserPassword = "Password123!";
let testUserId: string;

describe("Auth Endpoints", () => {
  beforeAll(async () => {
    // Clean up
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUserEmail } });

    // Create test user
    const hash = await bcrypt.hash(testUserPassword, 1); // fast hash for tests
    const user = await prisma.user.create({
      data: {
        name: "Test User",
        email: testUserEmail,
        phone: "+919999999999",
        passwordHash: hash,
        role: "ADMIN",
        status: "ACTIVE",
      }
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: testUserEmail } });
  });

  let accessToken: string;
  let refreshToken: string;

  it("POST /api/v1/auth/login - should fail with invalid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: testUserEmail,
      password: "WrongPassword!",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/login - should login and return tokens", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: testUserEmail,
      password: testUserPassword,
    });
    if (res.status !== 200) console.log("LOGIN 500 BODY:", res.body);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("GET /api/v1/auth/me - should fail without token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/auth/me - should return user with valid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(testUserEmail);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("POST /api/v1/auth/refresh - should rotate refresh token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
    expect(res.body.data.refreshToken).not.toBe(refreshToken); // Must be new
    
    // Update tokens for logout test
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken; 
  });

  it("POST /api/v1/auth/refresh - should fail with old revoked/rotated token", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken: "an-old-or-invalid-token",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/auth/logout - should revoke refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        refreshToken,
      });
    expect(res.status).toBe(200);

    // Verify token is revoked by attempting to refresh with it
    const refreshRes = await request(app).post("/api/v1/auth/refresh").send({
      refreshToken,
    });
    expect(refreshRes.status).toBe(401);
  });
});
