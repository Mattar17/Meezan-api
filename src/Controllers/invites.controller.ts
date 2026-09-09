import type { Request, Response } from "express";
import crypto from "crypto";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";
import type { IAuthRequest } from "../types/AuthRequest.js";

// POST /api/offices/:officeId/invites
export async function CreateInvite(req: IAuthRequest<{officeId:string}>, res: Response) {
  const { officeId } = req.params;
  const { email, role = "member" } = req.body;
  const inviterId = req.token?.lawyer_id;

  try {
    // only the owner can invite
    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("id, owner_id")
      .eq("id", officeId)
      .single();

    if (officeError || !office) {
      return res
        .status(404)
        .json({ success: false, message: "Office not found." });
    }

    if (office.owner_id !== inviterId) {
      return res.status(403).json({
        success: false,
        message: "Only the office owner can send invites.",
      });
    }

    // already a member?
    const { data: existingLawyer } = await supabase
      .from("lawyers")
      .select("id")
      .eq("email", email)
      .single();

    if (existingLawyer) {
      const { data: existingMember } = await supabase
        .from("office_members")
        .select("id")
        .eq("office_id", officeId)
        .eq("lawyer_id", existingLawyer.id)
        .single();

      if (existingMember) {
        return res.status(409).json({
          success: false,
          message: "This lawyer is already a member of the office.",
        });
      }
    }

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("invites")
      .insert({
        invited_lawyer_id: existingLawyer?.id,
        office_id: officeId,
        email,
        role,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "There's already a pending invite for this email.",
        });
      }
      logger.error(`[Invite Create] : ${error.message}`);
      return res
        .status(400)
        .json({ success: false, message: "Failed to create invite." });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Invite Create] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}

// GET /api/offices/:officeId/invites  (owner view — pending invites for the office)
export async function getOfficeInvites(req: IAuthRequest, res: Response) {
  const { officeId } = req.params;

  try {
    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (officeError || !office) {
      return res
        .status(404)
        .json({ success: false, message: "Office not found." });
    }

    if (office.owner_id !== req.token?.lawyer_id) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to view these invites.",
      });
    }

    const { data, error } = await supabase
      .from("invites")
      .select("*")
      .eq("office_id", officeId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error(`[Invite Fetch] : ${error.message}`);
      return res
        .status(400)
        .json({ success: false, message: "Failed to fetch invites." });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Invite Fetch] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}

// GET /api/invites/me  (lawyer's own pending invites, matched by email)
export async function getMyInvites(req: IAuthRequest, res: Response) {
  const lawyerId = req.token?.lawyer_id;

  try {
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("email")
      .eq("id", lawyerId as string)
      .single();

    if (lawyerError || !lawyer) {
      return res
        .status(404)
        .json({ success: false, message: "Lawyer not found." });
    }

    const { data, error } = await supabase
      .from("invites")
      .select("*, offices(id, name)")
      .eq("email", lawyer.email)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error(`[Invite Fetch Mine] : ${error.message}`);
      return res
        .status(400)
        .json({ success: false, message: "Failed to fetch invites." });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Invite Fetch Mine] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}

// POST /api/invites/:inviteId/respond   body: { action: "accepted" | "declined" }
export async function respondToInvite(req: IAuthRequest, res: Response) {
  const { inviteId } = req.params;
  const { action } = req.body;
  const lawyerId = req.token?.lawyer_id;

  if (action !== "accepted" && action !== "declined") {
    return res.status(400).json({ success: false, message: "Invalid action." });
  }

  try {
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*")
      .eq("id", inviteId)
      .eq("status", "pending")
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({
        success: false,
        message: "Invite not found or already handled.",
      });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase
        .from("invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      return res
        .status(410)
        .json({ success: false, message: "This invite has expired." });
    }

    // confirm the logged-in lawyer owns the invited email
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("id, email")
      .eq("id", lawyerId as string)
      .single();

    if (lawyerError || !lawyer || lawyer.email !== invite.email) {
      return res.status(403).json({
        success: false,
        message: "This invite isn't addressed to you.",
      });
    }

    const { data: updatedInvite, error: updateError } = await supabase
      .from("invites")
      .update({
        status: action,
        invited_lawyer_id: lawyer.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .select()
      .single();

    if (updateError) {
      logger.error(`[Invite Respond] : ${updateError.message}`);
      return res
        .status(400)
        .json({ success: false, message: "Failed to update invite." });
    }

    if (action === "accepted") {
      const { error: memberError } = await supabase
        .from("office_members")
        .insert({ office_id: invite.office_id, lawyer_id: lawyer.id });

      if (memberError) {
        logger.error(
          `[Invite Accept - member insert] : ${memberError.message}`,
        );
        return res.status(400).json({
          success: false,
          message: "Invite accepted but failed to join office.",
        });
      }
    }

    return res.status(200).json({ success: true, data: updatedInvite });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Invite Respond] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}

// DELETE /api/invites/:id  (owner cancels a pending invite)
export async function cancelInvite(req: IAuthRequest, res: Response) {
  const { id } = req.params;

  try {
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*, offices(owner_id)")
      .eq("id", id)
      .single();

    if (inviteError || !invite) {
      return res
        .status(404)
        .json({ success: false, message: "Invite not found." });
    }

    if ((invite.offices as any).owner_id !== req.token?.lawyer_id) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to cancel this invite.",
      });
    }

    const { error } = await supabase
      .from("invites")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) {
      logger.error(`[Invite Cancel] : ${error.message}`);
      return res
        .status(400)
        .json({ success: false, message: "Failed to cancel invite." });
    }

    return res
      .status(200)
      .json({ success: true, message: "Invite cancelled." });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Invite Cancel] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}
