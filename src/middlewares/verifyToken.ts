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
  req.token = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string);
  next();
}
