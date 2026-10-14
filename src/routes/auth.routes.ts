import express from "express";

import { Login } from "../Controllers/Login.js";
import Register from "../Controllers/Register.js";
import AddAdmin from "../Controllers/addAdmin.js";
import { RefreshToken } from "../Controllers/RefreshToken.js";

import { rateLimit } from "express-rate-limit";
import {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} from "../Controllers/ForgotPassword.js";

const router = express.Router();

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة لاحقاً",
  },
});

router.post("/login", Login);
router.post("/register", Register);
router.post("/admin", AddAdmin);
router.post("/auth/refresh", RefreshToken);

// Password Reset Flow
router.post("/forgot-password", forgotPasswordLimiter, requestPasswordReset);
router.post("/verify-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

// Aliases under /auth
router.post("/auth/forgot-password", forgotPasswordLimiter, requestPasswordReset);
router.post("/auth/verify-otp", verifyResetOtp);
router.post("/auth/reset-password", resetPassword);

export default router;
