<<<<<<< HEAD
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Request interface to include decoded payload
export interface AuthenticatedRequest extends Request {
  token?: string | jwt.JwtPayload;
}

export default function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];

  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      code: "NO_TOKEN",
      message: "Access token missing or malformed",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string);
    req.token = decoded;
    return next();
  } catch (error:any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Access token has expired",
      });
    }

    return res.status(403).json({
      success: false,
      code: "INVALID_TOKEN",
      message: "Token is invalid or corrupted",
    });
  }
=======
import jwt from "jsonwebtoken";
export default function verifyToken(req: any, res: any, next: any) {
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }
  req.token = jwt.verify(token, process.env.JWT_SECRET as string);
  next();
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
}
