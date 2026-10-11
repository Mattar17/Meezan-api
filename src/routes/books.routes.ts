import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import adminOnly from "../middlewares/adminOnly.js";
import {
  GetAllBooksInCategory,
  GetFileUrl,
  UploadBook,
  CreateCategory,
  DeleteCategory,
  DeleteBook,
  UpdateBookInfo,
  GetAllCategories,
} from "../Controllers/books.controller.js";
import { UploadFile } from "../Services/UploadFile.js";

const router = express.Router();

router.post("/books/category", verifyToken, adminOnly, CreateCategory);
router.get("/books/category", verifyToken, GetAllCategories);
router.post(
  "/books/upload",
  verifyToken,
  adminOnly,
  UploadFile.single("file"),
  UploadBook,
);
router.get(
  "/books/category/:categoryId",
  verifyToken,
  GetAllBooksInCategory,
);
router.get("/books/:bookId", verifyToken, GetFileUrl);
router.delete(
  "/books/category/:categoryId",
  verifyToken,
  adminOnly,
  DeleteCategory,
);
router.delete("/books/:bookId", verifyToken, adminOnly, DeleteBook);
router.patch("/books/:bookId", verifyToken, adminOnly, UpdateBookInfo);
export default router;
