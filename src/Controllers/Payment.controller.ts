import type { Request, Response } from "express";
import CreateIntention from "../Services/CreatePaymentIntention.js";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import crypto from "crypto";
import { lookup } from "dns";

function calculateHMAC(data: any) {
  const safe = (v: any) => (v === undefined || v === null ? "" : v);
  const bool = (v: any) => (v === true ? "true" : v === false ? "false" : "");

  const hmacString =
    safe(data.amount_cents) +
    safe(data.created_at) +
    safe(data.currency) +
    bool(data.error_occured) +
    bool(data.has_parent_transaction) +
    safe(data.id) +
    safe(data.integration_id) +
    bool(data.is_3d_secure) +
    bool(data.is_auth) +
    bool(data.is_capture) +
    bool(data.is_refunded) +
    bool(data.is_standalone_payment) +
    bool(data.is_voided) +
    safe(data.order?.id) +
    safe(data.owner) +
    bool(data.pending) +
    safe(data.source_data?.pan) +
    safe(data.source_data?.sub_type) +
    safe(data.source_data?.type) +
    bool(data.success);

  const calculatedHmac = crypto
    .createHmac("sha512", process.env.PAYMOB_HMAC_SECRET!)
    .update(hmacString)
    .digest("hex");

  return calculatedHmac;
}

export async function PaymentIntention(req: Request, res: Response) {
  try {
    const { id } = req.params;
    console.log(id);
    const response = await CreateIntention(id as string);
    console.log(response);
    const clientSecret = response.client_secret;
    return res.json({
      response,
      link: `https://accept.paymob.com/unifiedcheckout/?publicKey=${process.env.PAYMOB_PUBLIC_KEY}&clientSecret=${clientSecret}`,
    });
  } catch (err: any) {
    return res.status(500).json(`${err.message}: Failed to create payment`);
  }
}
//https://accept.paymob.com/unifiedcheckout/?publicKey={your_public_key}&clientSecret={the_client_secret}'

export async function handlePaymentWebhook(req: Request, res: Response) {
  try {
    console.log("Webhook received");
    logger.log("warn", { message: "Request Queries", data: req.query });
    logger.log("warn", { message: "Request Params", data: req.params });

    // 1. Validate body exists
    if (!req.body || !req.body.obj) {
      console.log("Invalid payload");
      return res.status(400).json({ error: "Invalid payload" });
    }

    const data = req.body.obj;

    // 2. Extract important fields
    const { id, success, amount_cents, order, is_capture, integration_id } =
      data;

    console.log("Payment ID:", id);
    console.log("Success:", success);
    console.log("is Capture", is_capture);

    // 3. (IMPORTANT) Verify HMAC signature
    const receivedHmac = req.query.hmac as string;

    const calculatedHmac = calculateHMAC(data);
    if (receivedHmac !== calculatedHmac) {
      console.log("Invalid HMAC ❌");
      return res.status(403).json({ error: "Invalid signature" });
    }

    console.log("HMAC verified ✅");

    // 4. Update your database
    if (success) {
      // mark order as paid
      console.log("Payment SUCCESS → update DB");
    } else {
      console.log("Payment FAILED");
    }

    // 5. Always respond quickly
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
