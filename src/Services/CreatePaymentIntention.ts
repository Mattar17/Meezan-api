import crypto from "node:crypto"
import "dotenv/config"
import supabase from "./supabaseClient.js";

export default async function CreateIntention(user: { email: string; id: string }, plan: string) {
  let amount = "200.0";
  if (plan === "standard") {
    amount = "200.0";
  } else if (plan === "pro") {
    amount = "300.0";
  }

  const orderId = crypto.randomBytes(16).toString("hex");

  const myHeaders = new Headers();
  myHeaders.append("Authorization", process.env.PAYMENT_SECRET_KEY!);
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("api-key", process.env.PAYMENT_TEST_KEY!);

  // 4. Construct a brand-new body object scoped to this function call
  const body = {
    expireAt: `${Date.now() + 30 * 60 * 1000}`, // 30 minutes from now
    maxFailureAttempts: 3,
    paymentType: "credit",
    amount: amount,
    merchantId: "MID-52103-393",
    currency: "EGP",
    order: orderId,
    merchantRedirect: "https://lawsync-saas.vercel.app/payment_webhook",
    display: "en",
    type: "one-time",
    allowedMethods: "card,wallet",
    customer: { 
      email: user.email, 
      reference: `customer-${user.id}` 
    }
  };

  try {
    const res = await fetch("https://test-api.kashier.io/v3/payment/sessions", {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify(body),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      console.error("[KASHIER API ERROR:]", data);
      return { message: "Failed to create payment session", details: data };
    }
    
            const {error:saveOrderError} = await supabase
            .from('pending_orders')
            .insert({
              order_id: orderId,
              lawyer_id: user.id,
              amount: Number(amount),
              status: "PENDING"
            });
      
            if(saveOrderError) return {message:"Error adding pending order"}

    return data;
  } catch (error) {
    console.error("[PAYMENT INTENTION ERROR:]", error);
    throw error;
  }
}