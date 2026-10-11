import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import adminOnly from "../middlewares/adminOnly.js";
import {
  GetAllLawCategories,
  GetLawCategoryById,
  CreateLawCategory,
  UpdateLawCategory,
  DeleteLawCategory,
  GetAllLawTexts,
  GetLawTextsByCategory,
  GetLawTextById,
  CreateLawText,
  UpdateLawText,
  DeleteLawText,
} from "../Controllers/laws.controller.js";

const router = express.Router();

// Law Categories Routes
router.get("/laws/categories", verifyToken, GetAllLawCategories);
router.get("/laws/categories/:categoryId", verifyToken, GetLawCategoryById);
router.post("/laws/categories", verifyToken, adminOnly, CreateLawCategory);
router.patch(
  "/laws/categories/:categoryId",
  verifyToken,
  adminOnly,
  UpdateLawCategory,
);
router.delete(
  "/laws/categories/:categoryId",
  verifyToken,
  adminOnly,
  DeleteLawCategory,
);

// Law Texts Routes
router.get("/laws/texts", verifyToken, GetAllLawTexts);
router.get(
  "/laws/categories/:categoryId/texts",
  verifyToken,
  GetLawTextsByCategory,
);
router.get("/laws/texts/:textId", verifyToken, GetLawTextById);
router.post("/laws/texts", verifyToken, adminOnly, CreateLawText);
router.patch("/laws/texts/:textId", verifyToken, adminOnly, UpdateLawText);
router.delete("/laws/texts/:textId", verifyToken, adminOnly, DeleteLawText);

export default router;

