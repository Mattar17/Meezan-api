import jwt from "jsonwebtoken";
export default function generateToken(payload: object) {
  const jwtKey = process.env.JWT_SECRET;
  if (!jwtKey) throw new Error("cannot generate jwt token");
  const token = jwt.sign(payload, jwtKey, { expiresIn: "1d" });
  return token;
}
