import express from "express";
import { handlePaymentWebhook, PaymentIntention } from "../Controllers/Payment.controller.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = express.Router();

router.post("/payment",verifyToken, PaymentIntention);
router.post("/payment_webhook",handlePaymentWebhook)

export default router;
