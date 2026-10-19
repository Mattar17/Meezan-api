import crypto from "node:crypto";
import "dotenv/config";
import supabase from "./supabaseClient.js";
import logger from "../utils/logger.js";

export type PlanType = "standard" | "pro";

const PLAN_PRICES: Record<PlanType, number> = {
  standard: 200,
  pro: 300,
};

export default async function CreateIntention(
  user: { email: string; id: string },
  plan: PlanType = "standard"
) {
  const amount = PLAN_PRICES[plan] ?? 200;
  const orderId = crypto.randomBytes(16).toString("hex");

  const myHeaders = new Headers();
  myHeaders.append("Authorization", process.env.PAYMENT_SECRET_KEY!);
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("api-key", process.env.PAYMENT_TEST_KEY!);

  const merchantRedirect =
    process.env.PAYMENT_REDIRECT_URL ||
    `${process.env.FRONTEND_URL || "https://lawsync-saas.vercel.app"}/payment_webhook`;

  const body = {
    expireAt: `${Date.now() + 30 * 60 * 1000}`, // 30 minutes from now
    maxFailureAttempts: 3,
    paymentType: "credit",
    amount: `${amount}.0`,
    merchantId: process.env.KASHIER_MERCHANT_ID || "MID-52103-393",
    currency: "EGP",
    order: orderId,
    merchantRedirect,
    display: "ar",
    type: "one-time",
    allowedMethods: "card,wallet",
    customer: {
      email: user.email,
      reference: `customer-${user.id}`,
    },
  };

  try {
    const kashierBaseUrl = process.env.KASHIER_BASE_URL || "https://test-api.kashier.io";
    const res = await fetch(`${kashierBaseUrl}/v3/payment/sessions`, {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error(`[KASHIER API ERROR]: ${JSON.stringify(data)}`);
      throw new Error(data?.message || data?.error?.message || "Failed to create payment session");
    }

    const { error: saveOrderError } = await supabase
      .from("pending_orders")
      .insert({
        order_id: orderId,
        lawyer_id: user.id,
        amount: Number(amount),
        subscription_type: plan,
        status: "PENDING",
      });

    if (saveOrderError) {
      logger.error(`[SAVE PENDING ORDER ERROR]: ${saveOrderError.message}`);
      throw new Error(`Failed to save pending order: ${saveOrderError.message}`);
    }

    return data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[PAYMENT INTENTION ERROR]: ${msg}`);
    throw error;
  }
}
