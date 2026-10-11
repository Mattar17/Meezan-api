import {
  AnswerVerificationRequest,
  GetAllVerificationRequests,
  GetLawyerCardUrl,
  AnswerSubscriptionRequest,
  GetAllSubscriptionRequests,
  GetSubscriptionInvoiceUrl,
} from "../Controllers/admin.controller.js";
import adminOnly from "../middlewares/adminOnly.js";
import verifyToken from "../middlewares/verifyToken.js";
import Router from "express";

const router = Router();

// Verification requests
router.get("/verification_requests", verifyToken, adminOnly, GetAllVerificationRequests);
router.get("/verification_requests/:requestId", verifyToken, adminOnly, GetLawyerCardUrl);
router.post("/verification_requests/:requestId", verifyToken, adminOnly, AnswerVerificationRequest);

// Subscription requests
router.get("/subscription_requests", verifyToken, adminOnly, GetAllSubscriptionRequests);
router.get("/subscription_requests/:requestId", verifyToken, adminOnly, GetSubscriptionInvoiceUrl);
router.post("/subscription_requests/:requestId", verifyToken, adminOnly, AnswerSubscriptionRequest);

export default router;

