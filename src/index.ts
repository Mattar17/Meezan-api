import express, { type Request, type Response } from "express";
import mongoose from "mongoose";
const app = express();
import dotenv from "dotenv";
dotenv.config();
import routes from "./routes/index.js";
import cors from "cors";
import "dotenv/config";
import { handlePaymentWebhook } from "./Controllers/Payment.controller.js";
import cookieParser from "cookie-parser"

app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser())

app.get("/", async (req: Request, res: Response) => {
  res.json("Welcome to the License Management API 💙");
});

app.post("/reset-app-password", async (req: Request, res: Response) => {
  const { password } = req.body;
  return res
    .status(200)
    .json({ success: password === process.env.CONFIRM_RESET_PASSWORD });
});

app.post("/api/payment/webhook", handlePaymentWebhook);

app.use("/api", routes);

app.listen(8000, () => {
  console.log("typescript + express api is running on :8000");
});

export default app;
