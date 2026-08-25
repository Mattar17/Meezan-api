import multer from "multer";
import os from "os";
import path from "path";

const FileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("فقط ملفات PDF, TXT, DOC, DOCX مسموح بها"));
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

export const UploadFile = multer({
  storage,
  fileFilter: FileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});
