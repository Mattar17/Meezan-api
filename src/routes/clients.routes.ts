import express from "express";

import verifyToken from "../middlewares/verifyToken.js";

import * as ClientsController from "../Controllers/clients.controller.js";

const router = express.Router();

router.post(
  "/offices/:officeId/clients",
  verifyToken,
  ClientsController.CreateClient,
);

router.get(
  "/offices/:officeId/clients",
  verifyToken,
  ClientsController.GetClients,
);

router.get(
  "/offices/:officeId/clients/:clientId",
  verifyToken,
  ClientsController.GetClientById,
);

router.patch(
  "/offices/:officeId/clients/:clientId",
  verifyToken,
  ClientsController.UpdateClient,
);

router.delete(
  "/offices/:officeId/clients/:clientId",
  verifyToken,
  ClientsController.DeleteClient,
);

export default router;

