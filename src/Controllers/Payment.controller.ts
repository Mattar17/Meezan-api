import type { Request, Response } from "express";
import CreateIntention from "../Services/CreatePaymentIntention.js";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import { IAuthRequest } from "../types/AuthRequest.js";
import _ from "underscore";
import queryString from "query-string";
import crypto from "node:crypto"

export async function PaymentIntention(req: IAuthRequest, res: Response) {
  try {
    const lawyerId = req.token?.lawyer_id as string;

    const {data:lawyer} = await supabase
    .from("lawyers")
    .select("email,id")
    .eq("id",lawyerId)
    .single();
    
    if(!lawyer) return res.status(404).json({success:false,message:"تعذر العثور علي المستخدم"})

    const response = await CreateIntention(lawyer,"standard");
    console.log(response);
    const sessionUrl = response.sessionUrl;
    return res.json({
      success:true,
      data:{sessionUrl}
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json(`${message}: Failed to create payment`);
  }
}

export async function handlePaymentWebhook(req: Request, res: Response) {
  try {
    const {data,event} = req.body;

    data.signatureKeys.sort();
    const objectSignaturePayload = _.pick(data,data.signatureKeys);
    const signturePayload = queryString.stringify(objectSignaturePayload);
    const signature = crypto
    .createHmac("sha256",process.env.PAYMENT_TEST_KEY!)
    .update(signturePayload)
    .digest("hex")

    const kashierSignature = req.headers["x-kashier-signature"];

    if (signature !== kashierSignature){
      return res.status(403).json({success:false,message:"لا يمكن إتمام عملية الدفع"})
    }

    if (event.status === "SUCCESS" && data.status === "SUCCESS"){
      const {data:pendingOrder} = await supabase
      .from('pending_orders')
      .select("*")
      .eq("order_id",data.orderId)
      .maybeSingle()

      if(!pendingOrder) return res.status(404).json({success:false,message:"Order Not Found"})

        

    }else{
      return res.status(500).json({success:false,message:"payment failed"})
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
