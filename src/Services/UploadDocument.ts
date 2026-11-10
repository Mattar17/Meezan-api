import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

const documentFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const allowedExtensions = [".pdf", ".doc", ".docx"];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error("فقط ملفات PDF و Word (DOC, DOCX) مسموح بها"));
  }
};

export const UploadDocument = multer({
  storage,
  fileFilter: documentFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});

const logoFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("image/") || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("فقط ملفات الصور (PNG, JPG, JPEG, WEBP) مسموح بها كشعار"));
  }
};

export const UploadLogo = multer({
  storage,
  fileFilter: logoFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const logoMulterFields = UploadLogo.fields([
  { name: "logo", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

export const optionalLogoUpload = (req: any, res: any, next: any) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    logoMulterFields(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || "خطأ أثناء معالجة ملف الشعار" });
      }
      if (req.files) {
        const filesObj = req.files as Record<string, Express.Multer.File[]>;
        req.file = filesObj["logo"]?.[0] || filesObj["file"]?.[0] || req.file;
      }
      next();
    });
  } else {
    next();
  }
};

export default UploadDocument;

