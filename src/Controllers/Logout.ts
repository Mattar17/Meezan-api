import type { Request, Response } from "express";
import crypto from "node:crypto";
import supabase from "../Services/supabaseClient.js";
import logger from "@/utils/logger.js";

export async function Logout(req: Request, res: Response) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

      await supabase
        .from("user_refresh_tokens")
        .delete()
        .eq("token_hash", tokenHash);
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      path: "/api/auth",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    logger.error(`[Logout:] ${err}`)
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}