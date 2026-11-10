import express from "express";
import {
  CreateTemplate,
  GetAllTemplates,
  GetTemplateById,
  DeleteTemplate,
  GenerateDocument,
  CreateAppTemplate,
  GetAdminAppTemplates,
  DeleteAppTemplate,
  GetLawyerLogos,
  DeleteLawyerLogo,
} from "../Controllers/templates.controller.js";
import { UploadDocument, optionalLogoUpload } from "../Services/UploadDocument.js";
import verifyToken from "../middlewares/verifyToken.js";
import adminOnly from "../middlewares/adminOnly.js";

const router = express.Router();

/**
 * Admin App Templates routes
 */
router.post("/admin/app-templates", verifyToken, adminOnly, UploadDocument.single("file"), CreateAppTemplate);
router.get("/admin/app-templates", verifyToken, adminOnly, GetAdminAppTemplates);
router.delete("/admin/app-templates/:id", verifyToken, adminOnly, DeleteAppTemplate);

/**
 * Lawyer saved logos routes
 */
router.get("/lawyer/logos", verifyToken, GetLawyerLogos);
router.get("/lawyers/logos", verifyToken, GetLawyerLogos);
router.delete("/lawyer/logos/:id", verifyToken, DeleteLawyerLogo);

/**
 * Document generation endpoints from template (supports multipart logo upload or savedLogoId)
 */
router.post("/templates/:templateId/generate", verifyToken, optionalLogoUpload, GenerateDocument);
router.post("/templates/generate/:templateId", verifyToken, optionalLogoUpload, GenerateDocument);
router.post("/documents/:templateId", verifyToken, optionalLogoUpload, GenerateDocument);
router.post("/documents/generate/:templateId", verifyToken, optionalLogoUpload, GenerateDocument);

/**
 * Lawyer templates routes
 */
// Create a new lawyer template (accepts PDF file in 'file' or JSON 'rawArabicText')
router.post("/templates", verifyToken, UploadDocument.single("file"), CreateTemplate);

// Fetch all templates (returns grouped { myTemplates: [...], appTemplates: [...] })
router.get("/templates", verifyToken, GetAllTemplates);

// Fetch a single template by ID
router.get("/templates/:id", verifyToken, GetTemplateById);

// Delete a template by ID
router.delete("/templates/:id", verifyToken, DeleteTemplate);

// Backward compatibility alias routes
router.post("/admin/templates", verifyToken, UploadDocument.single("file"), CreateTemplate);
router.delete("/admin/templates/:id", verifyToken, DeleteTemplate);

export default router;
