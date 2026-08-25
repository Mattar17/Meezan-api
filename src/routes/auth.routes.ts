import express from "express";

import { Login } from "../Controllers/Login.js";
import Register from "../Controllers/Register.js";
import AccessPortal from "../Controllers/AccessPortal.js";
import AddAdmin from "../Controllers/addAdmin.js";

const router = express.Router();

router.post("/login", Login);
router.post("/register", Register);
router.post("/portal-access", AccessPortal);
router.post("/admin", AddAdmin);

export default router;
