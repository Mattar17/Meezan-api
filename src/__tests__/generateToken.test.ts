import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import generateToken from "../Services/generateToken.js";
import jwt from "jsonwebtoken";

const mockPayload = {
  lawyer_email: "test@gmail.com",
  lawyer_id: "testID",
  is_admin: false,
};

describe("generate token", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it("should throw an error if JWT_SECRET is missing", () => {
    delete process.env.JWT_SECRET;
    expect(() => generateToken(mockPayload)).toThrow(
      new Error("cannot generate jwt token"),
    );
  });

  it("should thorw an error if JWT_SECRET is empty string", () => {
    process.env.JWT_SECRET = "";
    expect(() => generateToken(mockPayload)).toThrow(
      "cannot generate jwt token",
    );
  });

  it("should generate a JWT token with the provided payload", () => {
    process.env.JWT_SECRET = "test-secret";

    const token = generateToken(mockPayload);

    const decoded = jwt.verify(token, "test-secret");

    expect(decoded).toMatchObject(mockPayload);
  });
});
