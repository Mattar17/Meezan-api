import request from "supertest";
import app from "@/index.js";

describe("GET /api/test", () => {
  test("should return 200", async () => {
    const res = await request(app)
      .post("/reset-app-password")
      .send({ password: "1234" });
    expect(res.statusCode).toBe(200);
  });
});
