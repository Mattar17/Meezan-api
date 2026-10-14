import express from "express";

import verifyToken from "../middlewares/verifyToken.js";
import AdminOnly from "../middlewares/adminOnly.js";
import { UploadImage } from "../Services/UploadImage.js";

import * as LawyerController from "../Controllers/lawyers.controller.js";
<<<<<<< HEAD
import { UploadFile } from "../Services/UploadFile.js";
=======
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63

const router = express.Router();

router.get("/admin", verifyToken, LawyerController.getAllLawyersAdmin);
<<<<<<< HEAD
router.get("/verification_status", verifyToken, LawyerController.getVerificationStatus);
router.get("/subscription_status", verifyToken, LawyerController.getSubscriptionStatus);
router.get("/", LawyerController.getAllLawyersPublic);
=======
router.get("/", LawyerController.getAllLawyersPublic);
router.get("/:token", LawyerController.getLawyerByToken);
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
router.get("/id/:id", LawyerController.getLawyerById);

router.post("/", verifyToken, AdminOnly, LawyerController.createLawyer);

router.put("/:id", verifyToken, LawyerController.updateLawyer);

router.delete("/:id", verifyToken, AdminOnly, LawyerController.deleteLawyer);

router.post(
<<<<<<< HEAD
  "/:id/update-password",
  verifyToken,
  LawyerController.updatePassword,
=======
  "/:id/update-profile-password",
  verifyToken,
  LawyerController.updateProfilePassword,
);

router.post(
  "/:id/update-portal-password",
  verifyToken,
  LawyerController.updatePortalPassword,
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
);

router.post(
  "/avatar/:id",
  UploadImage.single("file"),
  LawyerController.setProfilePicture,
);

<<<<<<< HEAD
router.post("/verification_request",verifyToken,UploadFile.single("file"),LawyerController.verificationRequest)
router.post(
  "/subscription_request",
  verifyToken,
  UploadFile.single("file"),
  LawyerController.sendSubcriptionRequest,
);

=======
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
export default router;
