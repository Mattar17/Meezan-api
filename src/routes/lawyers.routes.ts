import express from "express";

import verifyToken from "../middlewares/verifyToken.js";
import AdminOnly from "../middlewares/adminOnly.js";
import { UploadImage } from "../Services/UploadImage.js";

import * as LawyerController from "../Controllers/lawyers.controller.js";

const router = express.Router();

router.get("/admin", verifyToken, LawyerController.getAllLawyersAdmin);
router.get("/", LawyerController.getAllLawyersPublic);
router.get("/id/:id", LawyerController.getLawyerById);

router.post("/", verifyToken, AdminOnly, LawyerController.createLawyer);

router.put("/:id", verifyToken, LawyerController.updateLawyer);

router.delete("/:id", verifyToken, AdminOnly, LawyerController.deleteLawyer);

router.post(
  "/:id/update-password",
  verifyToken,
  LawyerController.updatePassword,
);

router.post(
  "/avatar/:id",
  UploadImage.single("file"),
  LawyerController.setProfilePicture,
);

export default router;
