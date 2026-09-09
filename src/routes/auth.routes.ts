import express from "express";

import { Login } from "../Controllers/Login.js";
import Register from "../Controllers/Register.js";
import AddAdmin from "../Controllers/addAdmin.js";
import { RefreshToken } from "../Controllers/RefreshToken.js";

const router = express.Router();

router.post("/login", Login);
router.post("/register", Register);
router.post("/admin", AddAdmin);
router.post("/auth/refresh",RefreshToken)

export default router;
