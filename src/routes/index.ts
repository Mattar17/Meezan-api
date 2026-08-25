import express from "express";

import APIKeyValidation from "../middlewares/APIKeyValidator.js";
import { requestLogger } from "../middlewares/requestLogger.js";

import paymentRoutes from "./payment.routes.js";
import activationRoutes from "./activation.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import authRoutes from "./auth.routes.js";
import lawyerRoutes from "./lawyers.routes.js";
import officeRoutes from "./offices.routes.js";
import inviteRoutes from "./invites.routes.js";
import caseRoutes from "./cases.routes.js";
import taskRoutes from "./tasks.routes.js";
import booksRoutes from "./books.routes.js";

const router = express.Router();

router.use(APIKeyValidation);
router.use(requestLogger);

router.get("/test", (_, res) => {
  res.status(200).json("This lawsync api testing");
});

router.use(paymentRoutes);
router.use(activationRoutes);
router.use(analyticsRoutes);
router.use(authRoutes);

router.use("/lawyers", lawyerRoutes);
router.use("/offices", officeRoutes);

router.use(inviteRoutes);
router.use(caseRoutes);
router.use(taskRoutes);
router.use(booksRoutes);

export default router;
