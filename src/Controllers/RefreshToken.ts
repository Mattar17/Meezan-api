import type { Response } from "express";
import { IAuthRequest } from "../types/AuthRequest.js";
import logger from "../utils/logger.js";
import crypto from "node:crypto";
import supabase from "../Services/supabaseClient.js";
import generateToken from "../Services/generateToken.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function RefreshToken(req: IAuthRequest, res: Response) {
  const isMobile = req.headers["x-client-type"] === "mobile";

  try {
    const refreshToken = isMobile 
      ? req.body?.refreshToken 
      : (req.cookies?.refreshToken || req.body?.refreshToken);

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: "Refresh token is required" 
      });
    }
    console.log("Incoming Refresh Token",refreshToken);
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    console.log("[Token Hash]",tokenHash)
    // 2. Fetch token and associated lawyer
    const { data: tokenRecord, error: fetchTokenError } = await supabase
      .from("user_refresh_tokens")
      .select("id, is_valid, user_id, expires_at, lawyers(id, name, email, is_admin)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (fetchTokenError) {
      logger.error(`[RefreshToken Fetch Error] ${fetchTokenError.message}`);
      return res.status(500).json({ success: false, message: "Error fetching token" });
    }
    console.log("[TOKEN RECORD : ]",tokenRecord);
    const isExpired = tokenRecord ? new Date(tokenRecord.expires_at).getTime() < Date.now() : true;
    if (!tokenRecord || !tokenRecord.is_valid || isExpired) {
      return res.status(403).json({ 
        success: false, 
        message: "Invalid or expired refresh token" 
      });
    }

    // 3. Resolve joined record safely
    const lawyer = Array.isArray(tokenRecord.lawyers)
      ? tokenRecord.lawyers[0]
      : tokenRecord.lawyers;

    if (!lawyer) {
      return res.status(401).json({
        success: false,
        message: "Associated account not found",
      });
    }

    // 4. Generate new pair
    const { accessToken, refreshToken: newRefreshToken } = generateToken({
      lawyer_email: lawyer.email,
      lawyer_id: lawyer.id,
      is_admin: lawyer.is_admin,
    });

    const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    // 5. Rotate token atomically by updating the existing row
    const { data: updated, error: updateError } = await supabase
      .from("user_refresh_tokens")
      .update({
        token_hash: newTokenHash,
        expires_at: expiresAt,
        is_valid: true,
      })
      .eq("id", tokenRecord.id)
      .eq("token_hash", tokenHash) // Ensures no concurrent request rotated it first
      .select("id");

    if (updateError || !updated || updated.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: "Token rotation conflict or failure" 
      });
    }

    // 6. Deliver response based on client environment
    if (isMobile) {
      return res.status(200).json({
        success: true,
        data: {
          accessToken,
          newRefreshToken,
        },
      });
    }

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      maxAge: REFRESH_TOKEN_TTL_MS,
      path: "/api/auth",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[RefreshToken Error] ${message}`);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
}