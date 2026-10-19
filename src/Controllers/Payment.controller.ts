import type { Request, Response } from "express";
import CreateIntention, { PlanType } from "../Services/CreatePaymentIntention.js";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import { IAuthRequest } from "../types/AuthRequest.js";
import _ from "underscore";
import queryString from "query-string";
import crypto from "node:crypto";

export async function PaymentIntention(req: IAuthRequest, res: Response) {
  try {
    const lawyerId = req.token?.lawyer_id as string;
    let plan = (req.body?.plan as string) || "standard";
    if (plan === "basic") plan = "standard";

    if (!["standard", "pro"].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: "نوع الباقة غير صالح. الخيارات المتاحة: standard أو pro",
      });
    }

    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("email,id")
      .eq("id", lawyerId)
      .single();

    if (lawyerError || !lawyer) {
      return res.status(404).json({ success: false, message: "تعذر العثور على المستخدم" });
    }

    const response = await CreateIntention(lawyer, plan as PlanType);
    const sessionUrl = response.sessionUrl;

    if (!sessionUrl) {
      return res.status(502).json({
        success: false,
        message: "لم يتم استلام رابط جلسة الدفع من بوابة الدفع",
      });
    }

    return res.json({
      success: true,
      data: { sessionUrl },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[PaymentIntention] ${message}`);
    return res.status(500).json({ success: false, message: `تعذر إنشاء جلسة الدفع: ${message}` });
  }
}

export async function handlePaymentWebhook(req: Request, res: Response) {
  try {
    const { data, event } = req.body;

    if (!data || !data.signatureKeys || !Array.isArray(data.signatureKeys)) {
      return res.status(400).json({ success: false, message: "Invalid payload format" });
    }

    // 1. Verify Kashier HMAC Signature
    data.signatureKeys.sort();
    const objectSignaturePayload = _.pick(data, data.signatureKeys);
    const signaturePayload = queryString.stringify(objectSignaturePayload);
    const signature = crypto
      .createHmac("sha256", process.env.PAYMENT_TEST_KEY!)
      .update(signaturePayload)
      .digest("hex");

    const kashierSignature = req.headers["x-kashier-signature"] as string | undefined;

    if (!kashierSignature) {
      return res.status(403).json({ success: false, message: "Missing signature header" });
    }

    const sigBuffer = Buffer.from(signature, "utf-8");
    const kashierBuffer = Buffer.from(kashierSignature, "utf-8");

    if (
      sigBuffer.length !== kashierBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, kashierBuffer)
    ) {
      return res.status(403).json({ success: false, message: "Signature verification failed" });
    }

    // 2. Fetch Pending Order
    const orderId = data.orderId || data.order || data.merchantOrderId;
    const { data: pendingOrder, error: orderError } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (orderError) {
      logger.error(`[handlePaymentWebhook] Error fetching pending order: ${orderError.message}`);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!pendingOrder) {
      logger.warn(`[handlePaymentWebhook] Order not found for orderId: ${orderId}`);
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // 3. Idempotency Check: Don't process twice if already marked PAID
    if (pendingOrder.status === "PAID") {
      logger.info(`[handlePaymentWebhook] Order ${orderId} has already been processed.`);
      return res.status(200).json({ success: true, message: "Order already processed" });
    }

    // 4. Handle Payment Failure / Cancellation
    if (event?.status !== "SUCCESS" || data?.status !== "SUCCESS") {
      logger.warn(`[handlePaymentWebhook] Payment failed or unconfirmed for order ${orderId}`);
      await supabase
        .from("pending_orders")
        .update({ status: "FAILED" })
        .eq("id", pendingOrder.id);

      return res.status(200).json({ success: true, message: "Payment failure recorded" });
    }

    // 5. Payment Succeeded -> Update pending order status to PAID
    const { error: markPaidError } = await supabase
      .from("pending_orders")
      .update({ status: "PAID" })
      .eq("id", pendingOrder.id);

    if (markPaidError) {
      logger.error(`[handlePaymentWebhook] Error marking order as PAID: ${markPaidError.message}`);
    }

    // 6. Determine Plan Type and Dates
    const planType =
      pendingOrder.subscription_type ||
      (pendingOrder.amount === 300 ? "pro" : "standard");

    const nowDate = new Date();

    const addOneMonth = (baseDate: Date): Date => {
      const result = new Date(baseDate);
      const currentMonth = result.getMonth();
      result.setMonth(currentMonth + 1);
      if (result.getMonth() !== (currentMonth + 1) % 12) {
        result.setDate(0);
      }
      return result;
    };

    // 7. Check if lawyer already has a subscription record
    const { data: existingSubscription, error: fetchSubError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("lawyer_id", pendingOrder.lawyer_id)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchSubError) {
      logger.error(`[handlePaymentWebhook] Error fetching subscription: ${fetchSubError.message}`);
    }

    const gatewaySubId = data.transactionId ? String(data.transactionId) : null;

    if (
      existingSubscription &&
      existingSubscription.status === "active" &&
      new Date(existingSubscription.current_period_end) > nowDate
    ) {
      // Extend existing active subscription by one month from current_period_end
      const endDate = addOneMonth(new Date(existingSubscription.current_period_end));

      const { error: updateSubError } = await supabase
        .from("subscriptions")
        .update({
          current_period_end: endDate.toISOString(),
          status: "active",
          subscription_type: planType,
          gateway: "kashier",
          gateway_subscription_id: gatewaySubId,
          updated_at: nowDate.toISOString(),
        })
        .eq("id", existingSubscription.id);

      if (updateSubError) {
        logger.error(`[handlePaymentWebhook] Error extending subscription: ${updateSubError.message}`);
        return res.status(500).json({ success: false, message: "Error extending subscription" });
      }
    } else if (existingSubscription) {
      // Reactivate expired/inactive subscription for one month starting from now
      const startDate = nowDate;
      const endDate = addOneMonth(nowDate);

      const { error: renewSubError } = await supabase
        .from("subscriptions")
        .update({
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          status: "active",
          subscription_type: planType,
          gateway: "kashier",
          gateway_subscription_id: gatewaySubId,
          updated_at: nowDate.toISOString(),
        })
        .eq("id", existingSubscription.id);

      if (renewSubError) {
        logger.error(`[handlePaymentWebhook] Error renewing subscription: ${renewSubError.message}`);
        return res.status(500).json({ success: false, message: "Error renewing subscription" });
      }
    } else {
      // Create new subscription record for one month
      const startDate = nowDate;
      const endDate = addOneMonth(nowDate);

      const { error: insertSubError } = await supabase
        .from("subscriptions")
        .insert({
          lawyer_id: pendingOrder.lawyer_id,
          status: "active",
          subscription_type: planType,
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
          gateway: "kashier",
          gateway_subscription_id: gatewaySubId,
        });

      if (insertSubError) {
        logger.error(`[handlePaymentWebhook] Error creating subscription: ${insertSubError.message}`);
        return res.status(500).json({ success: false, message: "Error creating subscription" });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Subscription activated successfully",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[handlePaymentWebhook] Webhook error: ${message}`);
    return res.status(500).json({ error: "Server error" });
  }
}
