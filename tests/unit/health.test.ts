import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("Health Check", () => {
  it("should return 200 OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      message: "Cab CRM Backend is running",
    });
  });
});
