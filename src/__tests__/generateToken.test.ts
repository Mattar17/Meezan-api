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
<<<<<<< HEAD
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => generateToken(mockPayload)).toThrow(
      new Error("Keys are missing !!"),
=======
    delete process.env.JWT_SECRET;
    expect(() => generateToken(mockPayload)).toThrow(
      new Error("cannot generate jwt token"),
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
    );
  });

  it("should thorw an error if JWT_SECRET is empty string", () => {
<<<<<<< HEAD
    process.env.JWT_ACCESS_SECRET = "";
    process.env.JWT_REFRESH_SECRET = "";
=======
    process.env.JWT_SECRET = "";
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
    expect(() => generateToken(mockPayload)).toThrow(
      "cannot generate jwt token",
    );
  });

  it("should generate a JWT token with the provided payload", () => {
<<<<<<< HEAD
    process.env.JWT_ACCESS_SECRET = "TEST-ACCESS";
    process.env.JWT_REFRESH_SECRET = "TEST-REFRESH";

    const {accessToken,refreshToken} = generateToken(mockPayload);

    const decodedAccess = jwt.verify(accessToken, "TEST-ACCESS");
    const decodedRefresh = jwt.verify(refreshToken,"TEST_REFRESH")
    expect(decodedAccess).toMatchObject(mockPayload);
    expect(decodedRefresh).toMatchObject(mockPayload);
=======
    process.env.JWT_SECRET = "test-secret";

    const token = generateToken(mockPayload);

    const decoded = jwt.verify(token, "test-secret");

    expect(decoded).toMatchObject(mockPayload);
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  });
});
